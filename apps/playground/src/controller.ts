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
  silence,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import { DtmfRecognizer, frequenciesFor, GoertzelDtmfRecognizer } from '@sonoglyph/plugin-dtmf';
import { MorseRecognizer, MorseTextTranslator, morseTiming } from '@sonoglyph/plugin-morse';

export type InputMode = 'idle' | 'starting' | 'mic' | 'buffer';

/** Which DTMF recognizer(s) feed the glyph timeline. */
export type DecoderChoice = 'fft' | 'goertzel' | 'both';

export interface PlaygroundStatus {
  mode: InputMode;
  sampleRate: number;
  windowSize: number;
  window: WindowName;
  decoders: DecoderChoice;
  morseEnabled: boolean;
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
  private readonly morseRecognizer = new MorseRecognizer();
  private readonly morseTranslator = new MorseTextTranslator();
  private decoders: DecoderChoice = 'fft';
  private morseEnabled = false;
  private frameUnsub: Unsubscribe | null = null;
  private glyphUnsub: Unsubscribe | null = null;

  private mic: MicrophoneSource | null = null;
  private bufferSource: BufferSource | null = null;
  private audioContext: AudioContext | null = null;

  /** Rolling sample history for the waveform panel. */
  sampleHistory = new RingBuffer(DEFAULT_ENGINE_OPTIONS.sampleRate * HISTORY_SEC);
  /** Latest frame of each stream, for panels to read at their own pace. */
  latest: {
    spectrum?: FeatureFrame<SpectrumData>;
    peaks?: FeatureFrame<PeaksData>;
    envelope?: FeatureFrame<EnvelopeData>;
  } = {};
  glyphs: Glyph[] = [];
  /** The Morse translator's running transcript (the Meaning layer). */
  morseText = '';
  status: PlaygroundStatus = {
    mode: 'idle',
    sampleRate: DEFAULT_ENGINE_OPTIONS.sampleRate,
    windowSize: DEFAULT_ENGINE_OPTIONS.windowSize,
    window: DEFAULT_ENGINE_OPTIONS.window,
    decoders: 'fft',
    morseEnabled: false,
    samplesReceived: 0,
    chunksReceived: 0,
  };

  private readonly listeners = new Set<() => void>();

  constructor() {
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

  /** The recognizers the current choices put on the pipeline. */
  private activeRecognizers(): (DtmfRecognizer | GoertzelDtmfRecognizer | MorseRecognizer)[] {
    const dtmf =
      this.decoders === 'fft'
        ? [this.fftRecognizer]
        : this.decoders === 'goertzel'
          ? [this.goertzelRecognizer]
          : [this.fftRecognizer, this.goertzelRecognizer];
    return this.morseEnabled ? [...dtmf, this.morseRecognizer] : dtmf;
  }

  private buildPipeline(): Pipeline {
    this.frameUnsub?.();
    this.glyphUnsub?.();
    // Detach the old pipeline from the long-lived recognizers (it would
    // otherwise keep dead listeners alive) and clear press state — a new
    // engine means a new time base.
    this.pipeline?.dispose();
    this.fftRecognizer.reset();
    this.goertzelRecognizer.reset();
    this.morseRecognizer.reset();
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
      }
    });
    this.glyphUnsub = pipeline.onGlyph((glyph) => {
      this.glyphs = [...this.glyphs, glyph];
      // The Meaning layer: the translator reads the glyph stream and
      // keeps the transcript; it ignores glyphs it doesn't understand.
      this.morseTranslator.push(glyph);
      this.morseText = this.morseTranslator.value;
      this.notify();
    });
    this.status.sampleRate = this.engineOptions.sampleRate;
    this.status.windowSize = this.engineOptions.windowSize;
    this.status.window = this.engineOptions.window;
    this.status.decoders = this.decoders;
    return pipeline;
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

  /** Put the Morse recognizer on (or off) the pipeline. */
  setMorseEnabled(enabled: boolean): void {
    if (enabled === this.morseEnabled) return;
    this.morseEnabled = enabled;
    this.status.morseEnabled = enabled;
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
    this.morseTranslator.reset();
    this.morseText = '';
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
