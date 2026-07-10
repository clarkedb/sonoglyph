import type {
  DspEngine,
  DspEngineOptions,
  EnvelopeData,
  FeatureFrame,
  PeaksData,
  SamplesData,
  SpectrumData,
} from '@sonoglyph/core';
import { STREAM_ENVELOPE, STREAM_PEAKS, STREAM_SAMPLES, STREAM_SPECTRUM } from '@sonoglyph/core';
import { Fft } from './fft.ts';
import { detectPeaks } from './peaks.ts';
import { makeWindow, windowSum } from './window.ts';

export const SPECTRUM_VERSION = 1;
export const PEAKS_VERSION = 1;
export const ENVELOPE_VERSION = 1;
export const SAMPLES_VERSION = 1;

/**
 * Defaults tuned for DTMF at 48 kHz. A 2048-sample window gives ~23 Hz bins
 * — with parabolic peak interpolation that cleanly separates the 73 Hz-spaced
 * low group. Time resolution matters just as much as frequency resolution
 * here: the ~43 ms window plus a 512-sample hop (~11 ms) is what lets the
 * recognizer see 40 ms tones and the gaps between fast key presses. A 4096
 * window halves the bin width but smears every tone across ~85 ms, bridging
 * real inter-digit gaps — the window-size tradeoff, live.
 */
export const DEFAULT_ENGINE_OPTIONS: DspEngineOptions = {
  sampleRate: 48_000,
  windowSize: 2048,
  hopSize: 512,
  window: 'hann',
  streams: [STREAM_SPECTRUM, STREAM_PEAKS, STREAM_ENVELOPE],
};

/**
 * The TypeScript reference DSP engine.
 *
 * Samples are appended to an internal buffer; every time a full analysis
 * window is available, the engine emits one frame per configured stream and
 * advances by the hop size. Everything operates on plain Float32Arrays and
 * runs identically in the browser and in Node.
 */
export class TsDspEngine implements DspEngine {
  readonly options: Readonly<DspEngineOptions>;

  private readonly fft: Fft;
  private readonly window: Float32Array;
  private readonly windowNorm: number;
  private readonly windowed: Float32Array;
  private readonly binHz: number;

  /** Buffered samples not yet consumed by a hop. */
  private buffer: Float32Array;
  private buffered = 0;
  /** Stream time (seconds) of buffer[0]. */
  private bufferStartSec = 0;
  /** Total samples pushed since the last reset (absolute). */
  private pushedSamples = 0;
  /** Absolute index one past the end of the furthest window analyzed —
   * how `flush` tells whether real samples remain uncovered by any frame. */
  private coveredSamples = 0;

  constructor(options: Partial<DspEngineOptions> = {}) {
    const opts = { ...DEFAULT_ENGINE_OPTIONS, ...options };
    if (opts.windowSize < 2 || (opts.windowSize & (opts.windowSize - 1)) !== 0) {
      throw new Error(`windowSize must be a power of two, got ${opts.windowSize}`);
    }
    if (opts.hopSize < 1 || opts.hopSize > opts.windowSize) {
      throw new Error(`hopSize must be in [1, windowSize], got ${opts.hopSize}`);
    }
    this.options = opts;
    this.fft = new Fft(opts.windowSize);
    this.window = makeWindow(opts.window, opts.windowSize);
    // Normalize so a full-scale sine has magnitude ~1.0 in the spectrum.
    this.windowNorm = windowSum(this.window) / 2;
    this.windowed = new Float32Array(opts.windowSize);
    this.binHz = opts.sampleRate / opts.windowSize;
    this.buffer = new Float32Array(opts.windowSize * 4);
  }

  push(samples: Float32Array): FeatureFrame[] {
    this.ensureCapacity(this.buffered + samples.length);
    this.buffer.set(samples, this.buffered);
    this.buffered += samples.length;
    this.pushedSamples += samples.length;

    const { windowSize, hopSize, sampleRate } = this.options;
    const frames: FeatureFrame[] = [];
    // Absolute index of buffer[0] — anchors each window's coverage so the
    // count survives the copyWithin shift below.
    const base = this.pushedSamples - this.buffered;

    let offset = 0;
    while (this.buffered - offset >= windowSize) {
      const time = this.bufferStartSec + offset / sampleRate;
      this.analyze(this.buffer.subarray(offset, offset + windowSize), time, frames);
      this.coveredSamples = base + offset + windowSize;
      offset += hopSize;
    }

    if (offset > 0) {
      this.buffer.copyWithin(0, offset, this.buffered);
      this.buffered -= offset;
      this.bufferStartSec += offset / sampleRate;
    }
    return frames;
  }

  flush(): FeatureFrame[] {
    const frames: FeatureFrame[] = [];
    // Real samples the analysis loop never reached (the last <windowSize of
    // a stream, or a whole stream shorter than one window) are still in the
    // buffer. Emit one final frame for them, zero-padded up to a full
    // window — real samples at the front, silence where the signal ran out.
    if (this.buffered > 0 && this.pushedSamples > this.coveredSamples) {
      const { windowSize, sampleRate } = this.options;
      const padded = new Float32Array(windowSize);
      padded.set(this.buffer.subarray(0, this.buffered));
      this.analyze(padded, this.bufferStartSec, frames);
      // Drained: advance the clock past it (so a later push stays
      // monotonic) and leave nothing for a second flush to re-emit.
      this.bufferStartSec += this.buffered / sampleRate;
      this.coveredSamples = this.pushedSamples;
      this.buffered = 0;
    }
    return frames;
  }

  reset(): void {
    this.buffered = 0;
    this.bufferStartSec = 0;
    this.pushedSamples = 0;
    this.coveredSamples = 0;
  }

  private analyze(frame: Float32Array, time: number, out: FeatureFrame[]): void {
    const { streams, sampleRate, hopSize, windowSize } = this.options;
    const hop = hopSize / sampleRate;
    const span = windowSize / sampleRate;

    const wantSpectrum = streams.includes(STREAM_SPECTRUM);
    const wantPeaks = streams.includes(STREAM_PEAKS);

    if (wantSpectrum || wantPeaks) {
      for (let i = 0; i < frame.length; i++) {
        this.windowed[i] = frame[i]! * this.window[i]!;
      }
      const magnitudes = this.fft.magnitudes(this.windowed, this.windowNorm);

      if (wantSpectrum) {
        const data: SpectrumData = { magnitudes, binHz: this.binHz, window: this.options.window };
        out.push({ stream: STREAM_SPECTRUM, version: SPECTRUM_VERSION, time, span, hop, data });
      }
      if (wantPeaks) {
        const data: PeaksData = { peaks: detectPeaks(magnitudes, { binHz: this.binHz }) };
        out.push({ stream: STREAM_PEAKS, version: PEAKS_VERSION, time, span, hop, data });
      }
    }

    if (streams.includes(STREAM_SAMPLES)) {
      // A copy, not a subarray: the engine reuses its buffer, and samples
      // consumers (unlike spectrum/peaks ones) may hold frames across hops.
      const data: SamplesData = { samples: frame.slice() };
      out.push({ stream: STREAM_SAMPLES, version: SAMPLES_VERSION, time, span, hop, data });
    }

    if (streams.includes(STREAM_ENVELOPE)) {
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = frame[i]!;
        sumSq += s * s;
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
      }
      const data: EnvelopeData = { rms: Math.sqrt(sumSq / frame.length), peak };
      out.push({ stream: STREAM_ENVELOPE, version: ENVELOPE_VERSION, time, span, hop, data });
    }
  }

  private ensureCapacity(needed: number): void {
    if (needed <= this.buffer.length) return;
    let size = this.buffer.length;
    while (size < needed) size *= 2;
    const next = new Float32Array(size);
    next.set(this.buffer.subarray(0, this.buffered));
    this.buffer = next;
  }
}
