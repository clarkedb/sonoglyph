import type {
  DspEngineOptions,
  FeatureFrame,
  EnvelopeData,
  Glyph,
  PeaksData,
  SpectrumData,
  Unsubscribe,
  WindowName,
} from '@sonoglyph/core';
import { STREAM_ENVELOPE, STREAM_PEAKS, STREAM_SPECTRUM } from '@sonoglyph/core';
import { BufferSource, MicrophoneSource, parseWav, RingBuffer } from '@sonoglyph/browser';
import {
  concat,
  DEFAULT_ENGINE_OPTIONS,
  Pipeline,
  type PipelineError,
  silence,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import { DtmfRecognizer, frequenciesFor, GoertzelDtmfRecognizer } from '@sonoglyph/plugin-dtmf';
import type { MorseElementPayload, MorseTranscript } from '@sonoglyph/plugin-morse';
import { MorseRecognizer, MorseTextTranslator, morseTiming } from '@sonoglyph/plugin-morse';

/** True silence this many timing units closes the current Morse letter —
 * above the 1-unit intra-letter gap, below the 3-unit letter gap. */
const MORSE_LETTER_CLOSE_UNITS = 2;

const EMPTY_TRANSCRIPT: MorseTranscript = { text: '', letters: [] };

export type InputMode = 'idle' | 'starting' | 'mic' | 'buffer' | 'key';

/** Which signal system the playground is exploring. The input, the active
 * recognizer(s), and the output panels all follow this one choice. */
export type SignalSystem = 'dtmf' | 'morse';

/** Within DTMF, which recognizer(s) feed the glyph timeline. */
export type DecoderChoice = 'fft' | 'goertzel' | 'both';

export interface PlaygroundStatus {
  mode: InputMode;
  sampleRate: number;
  windowSize: number;
  window: WindowName;
  system: SignalSystem;
  decoders: DecoderChoice;
  samplesReceived: number;
  chunksReceived: number;
}

const HISTORY_SEC = 2;

/**
 * Owns the pipeline and everything flowing through it. Deliberately not a
 * React component: audio callbacks arrive ~hundreds of times a second, so
 * visualization panels read this object directly from requestAnimationFrame
 * loops, and React state only changes on coarse events (glyphs, mode
 * changes, option changes).
 */
export class PlaygroundController {
  private engineOptions: DspEngineOptions = { ...DEFAULT_ENGINE_OPTIONS };
  private pipeline: Pipeline | null = null;
  private readonly fftRecognizer = new DtmfRecognizer();
  private readonly goertzelRecognizer = new GoertzelDtmfRecognizer();
  // Seed the unit estimate at 120 ms (~10 WPM), matching playMorse's own
  // unit and comfortably covering hand keying on the straight key — low
  // enough to still adapt down for brisk senders. A smaller seed makes a
  // normal intra-letter gap measure near the letter-gap threshold before
  // adaptation catches up, splitting a letter into single-dot pieces.
  private readonly morseRecognizer = new MorseRecognizer({ unitMs: 120 });
  private readonly morseTranslator = new MorseTextTranslator();
  private system: SignalSystem = 'dtmf';
  private decoders: DecoderChoice = 'fft';
  private frameUnsub: Unsubscribe | null = null;
  private glyphUnsub: Unsubscribe | null = null;
  private errorUnsub: Unsubscribe | null = null;

  private mic: MicrophoneSource | null = null;
  private bufferSource: BufferSource | null = null;
  private audioContext: AudioContext | null = null;

  /** Straight-key (spacebar) Morse state: an oscillator you hear plus a
   * timer that feeds the pipeline tone-while-down / silence-while-up. */
  private keyOsc: OscillatorNode | null = null;
  private keyGain: GainNode | null = null;
  private keyTimer: ReturnType<typeof setInterval> | null = null;
  private keyIsDown = false;
  private keyLastMs = 0;

  /** Live Morse letter-close tracking, driven by the envelope: the unit
   * length from the last element, and the stream time a tone was last
   * heard. When silence outlasts the letter gap, the pending letter is
   * committed — this is what makes a hand-keyed letter appear on the
   * pause, without waiting for the next element or a stop. */
  private morseUnitSec = 0;
  private morseLastActiveTime = 0;

  /** Rolling sample history for the waveform panel. */
  sampleHistory = new RingBuffer(DEFAULT_ENGINE_OPTIONS.sampleRate * HISTORY_SEC);
  /** Latest frame of each stream, for panels to read at their own pace. */
  latest: {
    spectrum?: FeatureFrame<SpectrumData>;
    peaks?: FeatureFrame<PeaksData>;
    envelope?: FeatureFrame<EnvelopeData>;
  } = {};
  glyphs: Glyph[] = [];
  /** Plugin errors caught by the pipeline — a throwing recognizer is
   * skipped for that frame, not fatal, so these just accumulate for
   * inspection rather than halting anything. */
  errors: PipelineError[] = [];
  /** The Morse translator's running decode (the Meaning layer): assembled
   * text plus the letters behind it, each with the code it came from. */
  morseTranscript: MorseTranscript = EMPTY_TRANSCRIPT;
  status: PlaygroundStatus = {
    mode: 'idle',
    sampleRate: DEFAULT_ENGINE_OPTIONS.sampleRate,
    windowSize: DEFAULT_ENGINE_OPTIONS.windowSize,
    window: DEFAULT_ENGINE_OPTIONS.window,
    system: 'dtmf',
    decoders: 'fft',
    samplesReceived: 0,
    chunksReceived: 0,
  };

  private readonly listeners = new Set<() => void>();

  constructor() {
    // The Meaning layer publishes a new transcript after each letter (and
    // on flush/reset); mirror it into React-visible state.
    this.morseTranslator.onMeaning((transcript) => {
      this.morseTranscript = transcript;
      this.notify();
    });
    this.pipeline = this.buildPipeline();
  }

  /** Subscribe to coarse changes (glyphs, mode, options). */
  subscribe(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.status = { ...this.status };
    for (const cb of this.listeners) cb();
  }

  /** The recognizers the current signal system puts on the pipeline. */
  private activeRecognizers(): (DtmfRecognizer | GoertzelDtmfRecognizer | MorseRecognizer)[] {
    if (this.system === 'morse') return [this.morseRecognizer];
    return this.decoders === 'fft'
      ? [this.fftRecognizer]
      : this.decoders === 'goertzel'
        ? [this.goertzelRecognizer]
        : [this.fftRecognizer, this.goertzelRecognizer];
  }

  private buildPipeline(): Pipeline {
    this.frameUnsub?.();
    this.glyphUnsub?.();
    this.errorUnsub?.();
    // Detach the old pipeline from the long-lived recognizers (it would
    // otherwise keep dead listeners alive) and clear press state — a new
    // engine means a new time base.
    this.pipeline?.dispose();
    this.fftRecognizer.reset();
    this.goertzelRecognizer.reset();
    this.morseRecognizer.reset();
    // A new engine restarts stream time; flush the translator so it closes
    // any pending letter and doesn't measure the next element's gap against
    // the old time base. The decoded transcript so far is kept, matching
    // how glyph history survives a rebuild.
    this.morseTranslator.flush();
    const recognizers = this.activeRecognizers();
    // Compute the streams the panels always need plus whatever the active
    // recognizers declare (the Goertzel one wants raw `samples`).
    const streams = [
      ...new Set([
        STREAM_SPECTRUM,
        STREAM_PEAKS,
        STREAM_ENVELOPE,
        ...recognizers.flatMap((r) => r.metadata.requiredStreams),
      ]),
    ];
    const pipeline = new Pipeline(new TsDspEngine({ ...this.engineOptions, streams }));
    for (const recognizer of recognizers) pipeline.addPlugin(recognizer);
    this.frameUnsub = pipeline.onFrame((frame) => {
      if (frame.stream === STREAM_SPECTRUM) {
        this.latest.spectrum = frame as FeatureFrame<SpectrumData>;
      } else if (frame.stream === STREAM_PEAKS) {
        this.latest.peaks = frame as FeatureFrame<PeaksData>;
      } else if (frame.stream === STREAM_ENVELOPE) {
        this.latest.envelope = frame as FeatureFrame<EnvelopeData>;
        if (this.system === 'morse') this.trackMorseSilence(frame as FeatureFrame<EnvelopeData>);
      }
    });
    this.glyphUnsub = pipeline.onGlyph((glyph) => {
      this.glyphs = [...this.glyphs, glyph];
      // Feed the Meaning layer: the translator reads the element glyphs and
      // assembles letters/words, ignoring glyphs it doesn't understand.
      // (It publishes via onMeaning, wired in the constructor.)
      this.morseTranslator.push(glyph);
      const units = (glyph.payload as MorseElementPayload | undefined)?.units;
      if (glyph.pluginId === 'morse' && units) this.morseUnitSec = glyph.duration / units;
      this.notify();
    });
    // A throwing recognizer is caught and skipped by the pipeline, not
    // fatal — surface it the same way as glyphs, for whichever panel wants
    // to show it.
    this.errorUnsub = pipeline.onError((err) => {
      this.errors = [...this.errors, err];
      this.notify();
    });
    // A new engine restarts the clock and the signal.
    this.morseUnitSec = 0;
    this.morseLastActiveTime = 0;
    this.status.sampleRate = this.engineOptions.sampleRate;
    this.status.windowSize = this.engineOptions.windowSize;
    this.status.window = this.engineOptions.window;
    this.status.system = this.system;
    this.status.decoders = this.decoders;
    return pipeline;
  }

  /**
   * Switch the signal system being explored. This swaps the active
   * recognizer(s) — and the UI swaps the input and output panels to match.
   * It's a fresh start: DTMF digits and Morse dots share one timeline, so
   * mixing them would be noise; clear the glyph history and transcript.
   */
  setSystem(system: SignalSystem): void {
    if (system === this.system) return;
    // Leaving Morse mid-key: stop the straight key so its timer doesn't
    // keep feeding tone into the other system's pipeline.
    if (this.status.mode === 'key') {
      this.teardownStraightKey();
      this.status.mode = 'idle';
    }
    this.system = system;
    this.glyphs = [];
    this.morseTranslator.reset();
    this.pipeline = this.buildPipeline();
    this.notify();
  }

  /**
   * Choose which DTMF recognizer(s) run — the FFT-peaks reference, the
   * Goertzel one, or both side by side for the live comparison. Glyph
   * history survives so the two decoders' output can be compared.
   */
  setDecoders(choice: DecoderChoice): void {
    if (choice === this.decoders) return;
    this.decoders = choice;
    this.pipeline = this.buildPipeline();
    this.notify();
  }

  /**
   * Key a text as Morse audio: dots, dashes, and the silences between
   * them, straight from the plugin's own timing table. The default 120 ms
   * unit (~10 WPM) keeps every gap comfortably wider than the analysis
   * window, so the envelope stream can actually see them.
   */
  async playMorse(text: string, unitMs = 120, frequencyHz = 600, amplitude = 0.35): Promise<void> {
    const sampleRate = this.engineOptions.sampleRate;
    const parts = morseTiming(text).map((segment) => {
      const durationSec = (segment.units * unitMs) / 1000;
      return segment.on
        ? applyFade(tones([{ frequencyHz, amplitude }], durationSec, sampleRate), sampleRate)
        : silence(durationSec, sampleRate);
    });
    if (parts.length === 0) return;
    // A word gap of trailing silence, in the signal itself: the last
    // letter only closes once ~2 units of silence have flowed through
    // the pipeline as frames, and it reads as a word break if more Morse
    // follows in a later buffer.
    parts.push(silence((7 * unitMs) / 1000, sampleRate));
    await this.playBuffer(concat(...parts), sampleRate);
  }

  /**
   * Straight-key input: the user holds a key (spacebar in the UI) to sound
   * a tone and releases to stop, tapping out Morse by hand — a short tap is
   * a dot, a long hold a dash, and the recognizer reads the durations. One
   * key state drives two things: an oscillator you hear, and a real-time
   * generator that feeds the pipeline tone-while-down / silence-while-up.
   */
  async startStraightKey(frequencyHz = 600): Promise<void> {
    if (this.status.mode === 'key') return;
    await this.stop();
    // Fresh session: a hand-keyed message shouldn't inherit old glyphs.
    this.glyphs = [];
    this.morseTranslator.reset();

    const ctx = (this.audioContext ??= new AudioContext());
    await ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = frequencyHz;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.keyOsc = osc;
    this.keyGain = gain;
    this.keyIsDown = false;
    this.keyLastMs = performance.now();
    // Feed the pipeline in ~20 ms chunks sized by real elapsed time, so the
    // engine's stream clock tracks wall-clock and hand-keyed durations map
    // straight to timing units.
    this.keyTimer = setInterval(() => this.keyTick(frequencyHz), 20);
    this.status.mode = 'key';
    this.notify();
  }

  /** Key down: sound the tone (ramped, to avoid a click). Repeats ignored. */
  keyDown(): void {
    if (this.status.mode !== 'key' || this.keyIsDown) return;
    this.keyIsDown = true;
    if (this.keyGain && this.audioContext) {
      this.keyGain.gain.setTargetAtTime(0.3, this.audioContext.currentTime, 0.005);
    }
  }

  /** Key up: silence the tone. */
  keyUp(): void {
    if (this.status.mode !== 'key' || !this.keyIsDown) return;
    this.keyIsDown = false;
    if (this.keyGain && this.audioContext) {
      this.keyGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.005);
    }
  }

  private keyTick(frequencyHz: number): void {
    const now = performance.now();
    // Cap a catch-up chunk (e.g. after the tab was backgrounded) so one
    // tick can't inject a multi-second element.
    const elapsedMs = Math.min(now - this.keyLastMs, 500);
    this.keyLastMs = now;
    const sampleRate = this.engineOptions.sampleRate;
    const n = Math.round((elapsedMs / 1000) * sampleRate);
    if (n <= 0) return;
    const durationSec = n / sampleRate;
    const chunk = this.keyIsDown
      ? tones([{ frequencyHz, amplitude: 0.4 }], durationSec, sampleRate)
      : silence(durationSec, sampleRate);
    this.handleSamples(chunk);
  }

  /** Tear down the straight-key oscillator, timer, and pending letter. */
  private teardownStraightKey(): void {
    const wasActive = this.keyTimer !== null;
    if (this.keyTimer !== null) {
      clearInterval(this.keyTimer);
      this.keyTimer = null;
    }
    if (this.keyOsc) {
      try {
        this.keyOsc.stop();
      } catch {
        /* already stopped */
      }
      this.keyOsc.disconnect();
      this.keyOsc = null;
    }
    this.keyGain?.disconnect();
    this.keyGain = null;
    this.keyIsDown = false;
    // Close the last hand-keyed letter — no further element will.
    if (wasActive) this.morseTranslator.flush();
  }

  /**
   * Close a hand-keyed Morse letter the moment the sender pauses. Keyed off
   * the live envelope, not the (latency-delayed) element glyphs: any frame
   * with a tone resets the silence clock, so a sounding tone can never be
   * mistaken for the gap after a letter. When true silence outlasts the
   * letter gap, commit the pending letter.
   */
  private trackMorseSilence(frame: FeatureFrame<EnvelopeData>): void {
    if (frame.data.rms >= this.morseRecognizer.options.onThreshold) {
      this.morseLastActiveTime = frame.time;
      return;
    }
    if (
      this.morseUnitSec > 0 &&
      frame.time - this.morseLastActiveTime >= MORSE_LETTER_CLOSE_UNITS * this.morseUnitSec
    ) {
      this.morseTranslator.closePending();
    }
  }

  private handleSamples = (samples: Float32Array): void => {
    this.sampleHistory.write(samples);
    this.pipeline?.push(samples);
    this.status.samplesReceived += samples.length;
    this.status.chunksReceived += 1;
  };

  /**
   * Rebuild the engine with new options (window size/function). Glyph
   * history survives; buffered samples and recognizer state do not.
   */
  setEngineOptions(partial: Partial<Pick<DspEngineOptions, 'windowSize' | 'window'>>): void {
    const windowSize = partial.windowSize ?? this.engineOptions.windowSize;
    this.engineOptions = {
      ...this.engineOptions,
      ...partial,
      // Keep frame pacing constant relative to the window: 75% overlap.
      hopSize: Math.max(128, windowSize / 4),
    };
    this.pipeline = this.buildPipeline();
    this.notify();
  }

  private setSampleRate(sampleRate: number): void {
    if (sampleRate === this.engineOptions.sampleRate) return;
    this.engineOptions = { ...this.engineOptions, sampleRate };
    this.sampleHistory = new RingBuffer(sampleRate * HISTORY_SEC);
    this.pipeline = this.buildPipeline();
  }

  async startMicrophone(): Promise<void> {
    // Reject re-entry: a second click while getUserMedia's permission
    // prompt is pending would otherwise orphan the first (still-starting)
    // microphone with no reference left to stop it.
    if (this.status.mode === 'starting' || this.status.mode === 'mic') return;
    await this.stop();
    this.status.mode = 'starting';
    this.notify();
    const mic = new MicrophoneSource();
    this.mic = mic;
    try {
      await mic.start(this.handleSamples);
    } catch (err) {
      await mic.stop();
      this.mic = null;
      this.status.mode = 'idle';
      this.notify();
      throw err;
    }
    this.setSampleRate(mic.sampleRate);
    this.status.mode = 'mic';
    this.notify();
  }

  async stop(): Promise<void> {
    this.teardownStraightKey();
    await this.mic?.stop();
    this.mic = null;
    await this.bufferSource?.stop();
    this.bufferSource = null;
    if (this.status.mode !== 'idle') {
      this.status.mode = 'idle';
      this.notify();
    }
  }

  /**
   * Play a buffer: audibly (so you hear what the pipeline hears) and into
   * the pipeline. When the microphone is live the pipeline feed is skipped —
   * the mic will pick the tone up acoustically, which is the honest path.
   */
  async playBuffer(samples: Float32Array, sampleRate: number): Promise<void> {
    // A queued playback supersedes a straight-key session.
    this.teardownStraightKey();
    this.playAudible(samples, sampleRate);
    // Skip the direct feed while the mic is live (acoustic pickup is the
    // honest path) or still starting (feeding now would leave this buffer
    // streaming into the mic's pipeline once the start resolves).
    if (this.status.mode === 'mic' || this.status.mode === 'starting') return;

    await this.bufferSource?.stop();
    this.setSampleRate(sampleRate);
    // Pad with silence on both sides. Trailing: recognizers detect the end
    // of a tone by seeing silent frames, and when a buffer runs dry no
    // frames flow at all — stream time freezes and an open press would
    // absorb the next one. The pad must outlast the analysis window (tone
    // energy leaks into every window that overlaps it) plus the
    // recognizer's gap threshold. Leading: noise-adaptive recognizers
    // (Goertzel) calibrate their floors on what they hear first — a
    // buffer that opens mid-tone reads as "the room sounds like this",
    // the way any real signal is preceded by a moment of ambience.
    const leadSec = (2 * this.engineOptions.windowSize) / sampleRate;
    const padSec = Math.max(0.3, (2 * this.engineOptions.windowSize) / sampleRate);
    const lead = Math.round(leadSec * sampleRate);
    const padded = new Float32Array(lead + samples.length + Math.round(padSec * sampleRate));
    padded.set(samples, lead);
    this.bufferSource = new BufferSource(padded, sampleRate);
    this.bufferSource.onEnded(() => {
      // End of input: close the Morse transcript's final letter, which no
      // following element can (the transmission is over).
      this.morseTranslator.flush();
      if (this.status.mode === 'buffer') {
        this.status.mode = 'idle';
        this.notify();
      }
    });
    this.status.mode = 'buffer';
    this.notify();
    await this.bufferSource.start(this.handleSamples);
  }

  private playAudible(samples: Float32Array, sampleRate: number): void {
    this.audioContext ??= new AudioContext();
    const ctx = this.audioContext;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.start();
  }

  /** Synthesize and play one DTMF key press. */
  async playKey(key: DtmfKey, durationMs = 120, amplitude = 0.35): Promise<void> {
    const { lowHz, highHz } = frequenciesFor(key);
    const sampleRate = this.engineOptions.sampleRate;
    const signal = tones(
      [
        { frequencyHz: lowHz, amplitude },
        { frequencyHz: highHz, amplitude },
      ],
      durationMs / 1000,
      sampleRate,
    );
    await this.playBuffer(applyFade(signal, sampleRate), sampleRate);
  }

  /** General-purpose tone generator: any set of frequencies. */
  async playTones(frequencies: number[], durationMs: number, amplitude = 0.35): Promise<void> {
    const sampleRate = this.engineOptions.sampleRate;
    const signal = tones(
      frequencies.map((frequencyHz) => ({ frequencyHz, amplitude })),
      durationMs / 1000,
      sampleRate,
    );
    await this.playBuffer(applyFade(signal, sampleRate), sampleRate);
  }

  /** Decode a WAV file and stream it through the pipeline in real time. */
  async playWavFile(file: File): Promise<void> {
    const { samples, sampleRate } = parseWav(await file.arrayBuffer());
    await this.playBuffer(samples, sampleRate);
  }

  clearGlyphs(): void {
    this.glyphs = [];
    // reset() republishes an empty transcript via onMeaning.
    this.morseTranslator.reset();
    this.notify();
  }
}

/** 2 ms raised-cosine fade at both ends to avoid audible clicks. */
function applyFade(samples: Float32Array, sampleRate: number): Float32Array {
  const fade = Math.min(Math.floor(sampleRate * 0.002), Math.floor(samples.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    samples[i]! *= g;
    samples[samples.length - 1 - i]! *= g;
  }
  return samples;
}
