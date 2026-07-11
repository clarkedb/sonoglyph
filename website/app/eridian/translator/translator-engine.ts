'use client';

import { useEffect, useState } from 'react';
import type {
  DspEngineOptions,
  FeatureFrame,
  Glyph,
  PeaksData,
  SpectrumData,
  Unsubscribe,
} from '@sonoglyph/core';
import { STREAM_PEAKS, STREAM_SPECTRUM } from '@sonoglyph/core';
import { BufferSource, MicrophoneSource, RingBuffer } from '@sonoglyph/browser';
import { DEFAULT_ENGINE_OPTIONS, Pipeline, TsDspEngine } from '@sonoglyph/dsp';
import type { Register, SyllableCode } from '@sonoglyph/eridian';
import type { EridianTranslation } from '@sonoglyph/plugin-eridian';
import { EridianRecognizer, EridianTranslator } from '@sonoglyph/plugin-eridian';
import { ERIDIAN_SAMPLE_RATE, entriesFromCodes, wordsAudio } from '../lib/audio';

/**
 * The live translator engine for Grace's console. A small non-React controller
 * (audio callbacks arrive hundreds of times a second, so the canvas views read
 * it directly from their own animation loops and React re-renders only on
 * coarse events) owning the same pipeline the offline composer drives, wired to
 * a live microphone instead of a synthesized buffer:
 *
 *   mic → Pipeline(TsDspEngine @ mic sample rate) → EridianRecognizer
 *       → glyphs → EridianTranslator → English
 *
 * It also speaks: `playPhrase` synthesizes an Eridian utterance and plays it
 * aloud. With the mic live it is picked up acoustically (the honest path — the
 * single-device "Play Rocky" demo); with the mic off it streams straight
 * through the pipeline so the console still decodes without a microphone.
 */

export type TranslatorStatus = 'idle' | 'starting' | 'listening' | 'playing' | 'error';

/** The window sizes offered as the resolution knob — the central time-vs-
 * frequency tradeoff, made touchable. 2048 (~23 Hz bins, ~43 ms) is the
 * default: it resolves the ~60 ms intra-word gap that separates a repeated
 * syllable (S4-S4 "Eridian" vs. a single S4), which a larger window smears into
 * one chord. A bigger window resolves closer scale degrees (the subdued −1/−2
 * registers crowd below one bin at 2048; see docs/eridian.md#resolution) at the
 * cost of that time resolution. */
export const WINDOW_SIZES = [2048, 4096, 8192] as const;
const DEFAULT_WINDOW_SIZE = 2048;

/** No new chord for this long commits the utterance in flight, so the log
 * settles during a pause rather than waiting for the next chord. Sits just
 * above the translator's own 0.6 s utterance gap. */
const SILENCE_FLUSH_MS = 900;

const HISTORY_SEC = 2;
const EMPTY_TRANSLATION: EridianTranslation = { utterances: [], text: '' };

export class TranslatorController {
  // ---- Hot state, read by the canvas views from their own rAF loops. ----
  /** Latest frame of each stream, for the spectrum/peaks view. */
  latest: {
    spectrum?: FeatureFrame<SpectrumData>;
    peaks?: FeatureFrame<PeaksData>;
  } = {};
  /** Rolling sample history for the waveform view. */
  sampleHistory = new RingBuffer(ERIDIAN_SAMPLE_RATE * HISTORY_SEC);

  // ---- Coarse state, mirrored into React via notify(). ----
  status: TranslatorStatus = 'idle';
  errorMessage: string | null = null;
  glyphs: Glyph[] = [];
  translation: EridianTranslation = EMPTY_TRANSLATION;
  sampleRate = ERIDIAN_SAMPLE_RATE;
  windowSize = DEFAULT_WINDOW_SIZE;

  private engineOptions: DspEngineOptions = {
    ...DEFAULT_ENGINE_OPTIONS,
    windowSize: DEFAULT_WINDOW_SIZE,
    hopSize: DEFAULT_WINDOW_SIZE / 4,
    streams: [STREAM_SPECTRUM, STREAM_PEAKS],
  };
  private pipeline: Pipeline;
  private readonly recognizer = new EridianRecognizer();
  private readonly translator = new EridianTranslator();
  private frameUnsub: Unsubscribe | null = null;
  private glyphUnsub: Unsubscribe | null = null;

  private mic: MicrophoneSource | null = null;
  private bufferSource: BufferSource | null = null;
  private playbackCtx: AudioContext | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly listeners = new Set<() => void>();

  constructor() {
    // The translator republishes its reading after each chord (and on
    // flush/reset); mirror it into React-visible state.
    this.translator.onMeaning((translation) => {
      this.translation = translation;
      this.notify();
    });
    this.pipeline = this.buildPipeline();
  }

  subscribe(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }

  /** (Re)build the pipeline for the current engine options. Resets the
   * recognizer and flushes the translator: a new engine restarts stream time,
   * so a pending chord/utterance must not measure its gap against the old
   * clock. */
  private buildPipeline(): Pipeline {
    this.frameUnsub?.();
    this.glyphUnsub?.();
    this.pipeline?.dispose();
    this.recognizer.reset();
    this.translator.flush();

    const pipeline = new Pipeline(new TsDspEngine({ ...this.engineOptions }));
    pipeline.addPlugin(this.recognizer);
    this.frameUnsub = pipeline.onFrame((frame) => {
      if (frame.stream === STREAM_SPECTRUM) {
        this.latest.spectrum = frame as FeatureFrame<SpectrumData>;
      } else if (frame.stream === STREAM_PEAKS) {
        this.latest.peaks = frame as FeatureFrame<PeaksData>;
      }
    });
    this.glyphUnsub = pipeline.onGlyph((glyph) => {
      this.glyphs = [...this.glyphs, glyph];
      this.translator.push(glyph);
      this.armSilenceFlush();
      this.notify();
    });
    this.pipeline = pipeline;
    this.sampleRate = this.engineOptions.sampleRate;
    this.windowSize = this.engineOptions.windowSize;
    return pipeline;
  }

  /** Clear the conversation and restart the pipeline clock — a fresh session. */
  private resetSession(): void {
    this.glyphs = [];
    this.translator.reset();
    this.buildPipeline();
  }

  private handleSamples = (samples: Float32Array): void => {
    this.sampleHistory.write(samples);
    this.pipeline.push(samples);
  };

  /** Commit the utterance in flight once the sender pauses, so it settles in
   * the log instead of hanging open until the next chord. */
  private armSilenceFlush(): void {
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.translator.flush();
    }, SILENCE_FLUSH_MS);
  }

  private clearSilenceFlush(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private setSampleRate(sampleRate: number): void {
    if (sampleRate === this.engineOptions.sampleRate) {
      this.buildPipeline();
      return;
    }
    this.engineOptions = { ...this.engineOptions, sampleRate };
    this.sampleHistory = new RingBuffer(sampleRate * HISTORY_SEC);
    this.buildPipeline();
  }

  /** The resolution knob: a bigger window resolves closer scale degrees (the
   * subdued registers) but smears events in time. Rebuilds the engine. */
  setWindowSize(windowSize: number): void {
    if (windowSize === this.engineOptions.windowSize) return;
    this.engineOptions = {
      ...this.engineOptions,
      windowSize,
      hopSize: Math.max(256, windowSize / 4),
    };
    this.buildPipeline();
    this.notify();
  }

  /** Arm the microphone: a fresh session, then live audio into the pipeline. */
  async arm(): Promise<void> {
    if (this.status === 'starting' || this.status === 'listening') return;
    this.status = 'starting';
    this.errorMessage = null;
    this.notify();

    const mic = new MicrophoneSource();
    this.mic = mic;
    try {
      await mic.start(this.handleSamples);
    } catch (err) {
      await mic.stop();
      this.mic = null;
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.notify();
      return;
    }
    // The engine must run at the mic's true sample rate — peak frequencies are
    // bin × sampleRate/windowSize, and Eridian's match tolerance is ~2.5%, so a
    // wrong rate shifts every note out of range. setSampleRate rebuilds the
    // pipeline (a fresh session for this mic).
    this.glyphs = [];
    this.translator.reset();
    this.setSampleRate(mic.sampleRate);
    this.status = 'listening';
    this.notify();
  }

  /** Release the microphone. The decoded conversation stays on screen. */
  async disarm(): Promise<void> {
    this.clearSilenceFlush();
    const mic = this.mic;
    this.mic = null;
    await mic?.stop();
    this.translator.flush();
    if (this.status !== 'idle') {
      this.status = 'idle';
      this.notify();
    }
  }

  /**
   * Speak an Eridian phrase (words, each a list of syllable codes) at a
   * register. Always played aloud; with the mic live that is the whole demo
   * (acoustic pickup). With the mic off, also streamed through the pipeline so
   * the console decodes it without a microphone.
   */
  async playPhrase(words: SyllableCode[][], register: Register = 0): Promise<void> {
    if (words.length === 0) return;
    const audio = wordsAudio(entriesFromCodes(words), register);
    this.playAudible(audio, ERIDIAN_SAMPLE_RATE);

    // Mic live (or starting): the mic hears it through the air — nothing more.
    if (this.status === 'listening' || this.status === 'starting') return;
    if (this.status === 'playing') await this.bufferSource?.stop();

    // Mic off: decode it directly. Match the engine to the synth's rate and
    // stream the buffer in real time (no lead silence — a silence→chord onset
    // straddling the first window smears the opening chord below the minimum
    // duration; see the composer). flush() on end drains the trailing chord.
    if (this.engineOptions.sampleRate !== ERIDIAN_SAMPLE_RATE) {
      this.setSampleRate(ERIDIAN_SAMPLE_RATE);
    }
    this.resetSession();
    const source = new BufferSource(audio, ERIDIAN_SAMPLE_RATE);
    this.bufferSource = source;
    source.onEnded(() => {
      this.pipeline.flush();
      this.translator.flush();
      this.clearSilenceFlush();
      if (this.status === 'playing') {
        this.status = 'idle';
        this.notify();
      }
    });
    this.status = 'playing';
    this.notify();
    await source.start(this.handleSamples);
  }

  private playAudible(samples: Float32Array, sampleRate: number): void {
    this.playbackCtx ??= new AudioContext();
    const ctx = this.playbackCtx;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.start();
  }

  /** Release live audio resources. Reusable — the controller can be re-armed
   * afterwards (which is what makes it safe under React StrictMode's
   * mount/unmount/mount in development). */
  async dispose(): Promise<void> {
    this.clearSilenceFlush();
    const mic = this.mic;
    this.mic = null;
    const bufferSource = this.bufferSource;
    this.bufferSource = null;
    await mic?.stop();
    await bufferSource?.stop();
    const ctx = this.playbackCtx;
    this.playbackCtx = null;
    if (ctx && ctx.state !== 'closed') await ctx.close();
    if (this.status !== 'idle') {
      this.status = 'idle';
      this.notify();
    }
  }
}

/**
 * Owns a single TranslatorController for the console's lifetime and re-renders
 * the component on the controller's coarse events. The canvas views read the
 * controller directly (hot per-frame data), so they need no re-render.
 */
export function useTranslatorEngine(): TranslatorController {
  // Lazy state initializer: constructs the controller exactly once and keeps it
  // stable across renders (the constructor is pure — no browser APIs — so it's
  // safe during SSR too). Live audio resources are created only on arm/play.
  const [controller] = useState(() => new TranslatorController());

  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = controller.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsub();
      void controller.dispose();
    };
  }, [controller]);

  return controller;
}
