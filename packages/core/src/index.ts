/**
 * @sonoglyph/core — the contracts every layer shares.
 *
 * This package contains interfaces and types only. It has zero dependencies
 * and no browser APIs. The pipeline it describes:
 *
 *   Samples → Features → Glyphs → Meaning
 *
 * Audio sources produce samples, the DSP engine turns samples into named
 * feature streams, recognizer plugins turn feature frames into glyphs, and
 * translators turn glyph sequences into meaning.
 */

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

/**
 * The symbolic representation of any recognized signal — Sonoglyph's central
 * abstraction. A DTMF `5`, a Morse dash, and a C-major chord are all glyphs.
 */
export interface Glyph<P = unknown> {
  /** The recognized symbol: "5", "-", "Cmaj", … */
  symbol: string;
  /** Id of the recognizer plugin that emitted this glyph. */
  pluginId: string;
  /** Start of the recognized span, in seconds of stream time. */
  start: number;
  /** Duration of the recognized span, in seconds. */
  duration: number;
  /** Recognizer confidence, 0..1. */
  confidence: number;
  /** Plugin-defined detail (e.g. the detected frequency pair for DTMF). */
  payload?: P;
}

// ---------------------------------------------------------------------------
// Feature streams
// ---------------------------------------------------------------------------

/**
 * One frame of one named feature stream. There is no canonical feature
 * vector; the DSP engine produces named, versioned streams and plugins
 * declare which ones they consume.
 */
export interface FeatureFrame<T = unknown> {
  /** Stream name: "spectrum", "peaks", "envelope", … */
  stream: string;
  /** Schema version of this stream's `data` payload. */
  version: number;
  /** Frame start, in seconds of stream time. */
  time: number;
  /** Seconds between successive frames of this stream. */
  hop: number;
  /** Stream-specific payload. */
  data: T;
}

/** Well-known stream names shipped by the reference DSP engine. */
export const STREAM_SPECTRUM = 'spectrum';
export const STREAM_PEAKS = 'peaks';
export const STREAM_ENVELOPE = 'envelope';

/** Payload of the `spectrum` stream (version 1). */
export interface SpectrumData {
  /** FFT magnitudes for bins 0..N/2 (inclusive of DC and Nyquist). */
  magnitudes: Float32Array;
  /** Frequency width of one bin, in Hz (sampleRate / fftSize). */
  binHz: number;
  /** Window function applied before the FFT. */
  window: string;
}

/** A single detected spectral peak. */
export interface SpectralPeak {
  /** Interpolated peak frequency, in Hz. */
  frequencyHz: number;
  /** Interpolated peak magnitude (same units as the spectrum). */
  magnitude: number;
  /** Index of the underlying FFT bin the peak was found at. */
  bin: number;
}

/** Payload of the `peaks` stream (version 1). Sorted by descending magnitude. */
export interface PeaksData {
  peaks: SpectralPeak[];
}

/** Payload of the `envelope` stream (version 1). */
export interface EnvelopeData {
  /** Root-mean-square amplitude of the frame, 0..1 for full-scale signals. */
  rms: number;
  /** Largest absolute sample value in the frame. */
  peak: number;
}

// ---------------------------------------------------------------------------
// DSP engine
// ---------------------------------------------------------------------------

/** Window functions the engine must offer. Implementations may add more. */
export type WindowName = 'rectangular' | 'hann' | 'hamming' | 'blackman';

export interface DspEngineOptions {
  /** Sample rate of the incoming samples, in Hz. */
  sampleRate: number;
  /** Analysis window length in samples. Must be a power of two. */
  windowSize: number;
  /** Samples between successive analysis frames. */
  hopSize: number;
  /** Window function applied before the FFT. */
  window: WindowName;
  /** Which feature streams to compute. Extractors not listed do not run. */
  streams: string[];
}

/**
 * Samples in, feature frames out. Implementations are pure stream
 * transformers over plain Float32Arrays: no browser APIs, no timers, no
 * audio-thread coupling — the same bytes in produce the same frames out,
 * in a browser or in Node.
 */
export interface DspEngine {
  readonly options: Readonly<DspEngineOptions>;
  /**
   * Append samples and return every feature frame that became complete.
   * Frames are returned in time order, grouped per analysis hop.
   */
  push(samples: Float32Array): FeatureFrame[];
  /** Clear buffered samples and reset stream time to zero. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Recognizer plugins
// ---------------------------------------------------------------------------

export interface PluginMetadata {
  /** Stable unique id, e.g. "dtmf". */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Plugin version (semver). */
  version: string;
  /** Names of the feature streams this plugin consumes. */
  requiredStreams: string[];
  /** Short description shown in UIs. */
  description?: string;
}

/**
 * A stateful stream consumer. The pipeline calls `process` for every frame
 * of a required stream; the plugin owns its segmentation state and emits
 * glyphs whenever it has accumulated enough evidence — recognition is
 * rarely a per-frame classification.
 */
export interface RecognizerPlugin {
  readonly metadata: PluginMetadata;
  /** Consume one frame of a stream listed in `metadata.requiredStreams`. */
  process(frame: FeatureFrame): void;
  /** Subscribe to emitted glyphs. */
  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe;
  /** Clear internal state (e.g. when the audio source changes). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Audio sources
// ---------------------------------------------------------------------------

/**
 * Anything that produces sample chunks: a microphone, a WAV file, a tone
 * generator. Chunk sizes are source-defined and carry no meaning; the DSP
 * engine does its own framing.
 */
export interface AudioSource {
  /** Sample rate in Hz. Available once `start` has resolved. */
  readonly sampleRate: number;
  /** Begin producing samples. Chunks are delivered in stream order. */
  start(onSamples: (samples: Float32Array) => void): Promise<void>;
  /** Stop producing samples. Safe to call more than once. */
  stop(): Promise<void>;
}
