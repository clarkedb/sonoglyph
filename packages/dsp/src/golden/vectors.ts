/**
 * Golden vectors: frozen reference outputs of the TypeScript DSP, keyed by
 * code-generated inputs. These exist to pin the numeric behavior of the
 * reference engine and its standalone primitives so a future Rust/WASM port
 * (issue #16) can be cross-validated against the identical fixtures.
 *
 * The repo's rule holds (see `generate.ts`): **inputs are generated in code,
 * never stored.** Each vector describes its input with a `makeInput()` built
 * from the same synthesis helpers the unit tests use; only the *expected
 * output* is frozen, in `golden.json`. That JSON is the language-agnostic
 * contract — Rust reads the same file and must reproduce the same numbers
 * within `TOLERANCE`.
 *
 * Windows are deliberately small (256/512) so the frozen arrays stay short
 * and diffs stay readable when the engine legitimately changes and the set
 * is re-blessed.
 */

import type { DspEngineOptions, PeaksData, SpectrumData } from '@sonoglyph/core';
import { STREAM_ENVELOPE, STREAM_PEAKS, STREAM_SPECTRUM } from '@sonoglyph/core';
import { TsDspEngine } from '../engine.ts';
import { goertzelMagnitude, goertzelPower } from '../goertzel.ts';
import { sine, silence, tones, whiteNoise } from '../generate.ts';
import type { EnvelopeData } from '@sonoglyph/core';

const SAMPLE_RATE = 48_000;

/**
 * Absolute tolerance for comparing a live computation to the frozen value —
 * and, by design, the cross-implementation contract: the Rust engine must
 * land every number within this of the TS reference. Looser than the 6-digit
 * rounding used when freezing, so legitimate last-ULP float differences
 * between a JS `f64` pipeline and a Rust one do not trip the suite.
 */
export const TOLERANCE = 1e-5;

/** Round for storage; normalize -0 and sub-tolerance noise to 0. */
function freeze(x: number): number {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/** A block of exactly `n` samples at ±`amplitude`, alternating each sample —
 *  the Nyquist tone, used to probe the top of the band. */
function nyquistTone(n: number, amplitude: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = i % 2 === 0 ? amplitude : -amplitude;
  return out;
}

/** A constant (DC) block of exactly `n` samples. */
function dc(n: number, value: number): Float32Array {
  return new Float32Array(n).fill(value);
}

/** Exactly `n` samples of a single sine, sidestepping duration rounding. */
function sineN(frequencyHz: number, n: number, amplitude = 1): Float32Array {
  return sine(frequencyHz, n / SAMPLE_RATE, SAMPLE_RATE, amplitude);
}

export interface EngineVector {
  kind: 'engine';
  name: string;
  description: string;
  options: DspEngineOptions;
  makeInput: () => Float32Array;
}

export interface GoertzelVector {
  kind: 'goertzel';
  name: string;
  description: string;
  frequencyHz: number;
  sampleRate: number;
  makeInput: () => Float32Array;
}

export type GoldenVector = EngineVector | GoertzelVector;

function engineOptions(over: Partial<DspEngineOptions>): DspEngineOptions {
  return {
    sampleRate: SAMPLE_RATE,
    windowSize: 256,
    hopSize: 256,
    window: 'hann',
    streams: [STREAM_SPECTRUM, STREAM_PEAKS, STREAM_ENVELOPE],
    ...over,
  };
}

/**
 * The vectors. Engine vectors push exactly one analysis window (hop =
 * windowSize) so the frozen output is a single representative frame per
 * stream — framing behavior is covered by `engine.test.ts`; these pin the
 * DSP math. Goertzel vectors probe one frequency over one block.
 */
export const GOLDEN_VECTORS: GoldenVector[] = [
  {
    kind: 'engine',
    name: 'engine/silence-hann-256',
    description: 'Silence: the zero baseline — every magnitude, RMS, and peak is 0.',
    options: engineOptions({}),
    makeInput: () => silence(256 / SAMPLE_RATE, SAMPLE_RATE),
  },
  {
    kind: 'engine',
    name: 'engine/sine-on-bin-hann-256',
    description: 'Full-scale sine exactly on bin 32 (6000 Hz): normalization lands ~1.0.',
    options: engineOptions({}),
    makeInput: () => sineN(6000, 256, 1),
  },
  {
    kind: 'engine',
    name: 'engine/sine-off-bin-hann-256',
    description: 'Sine at bin 32.5 (6093.75 Hz): spectral leakage + parabolic peak interpolation.',
    options: engineOptions({}),
    makeInput: () => sineN(6093.75, 256, 1),
  },
  {
    kind: 'engine',
    name: 'engine/sine-on-bin-rect-256',
    description: 'Same on-bin sine under a rectangular window: contrasts the window math.',
    options: engineOptions({ window: 'rectangular' }),
    makeInput: () => sineN(6000, 256, 1),
  },
  {
    kind: 'engine',
    name: 'engine/dtmf-1-hann-512',
    description: 'DTMF "1" (697 + 1209 Hz, 0.5 each) at a 512 window: two resolved peaks.',
    options: engineOptions({ windowSize: 512, hopSize: 512 }),
    makeInput: () =>
      tones(
        [
          { frequencyHz: 697, amplitude: 0.5 },
          { frequencyHz: 1209, amplitude: 0.5 },
        ],
        512 / SAMPLE_RATE,
        SAMPLE_RATE,
      ),
  },
  {
    kind: 'engine',
    name: 'engine/white-noise-rect-256',
    description:
      'Deterministic mulberry32 noise (seed 1, 0.5): pins full-chain + PRNG portability.',
    options: engineOptions({ window: 'rectangular' }),
    makeInput: () => whiteNoise(256 / SAMPLE_RATE, SAMPLE_RATE, 0.5, 1),
  },
  {
    kind: 'goertzel',
    name: 'goertzel/tone-present',
    description: 'Probe the frequency that is present (1209 Hz, amp 0.8): magnitude ~0.8.',
    frequencyHz: 1209,
    sampleRate: SAMPLE_RATE,
    makeInput: () => sineN(1209, 480, 0.8),
  },
  {
    kind: 'goertzel',
    name: 'goertzel/tone-absent',
    description: 'Probe a DTMF frequency that is absent (941 Hz) from a 1209 Hz tone: ~0.',
    frequencyHz: 941,
    sampleRate: SAMPLE_RATE,
    makeInput: () => sineN(1209, 480, 0.8),
  },
  {
    kind: 'goertzel',
    name: 'goertzel/off-grid',
    description: 'Odd-length block (333 samples) so 1000 Hz does not align to the block DFT grid.',
    frequencyHz: 1000,
    sampleRate: SAMPLE_RATE,
    makeInput: () => sineN(1000, 333, 1),
  },
  {
    kind: 'goertzel',
    name: 'goertzel/dc',
    description: 'DC edge case: probing 0 Hz on a constant block, where 2/N overstates by 2×.',
    frequencyHz: 0,
    sampleRate: SAMPLE_RATE,
    makeInput: () => dc(256, 0.5),
  },
  {
    kind: 'goertzel',
    name: 'goertzel/nyquist',
    description: 'Nyquist edge case: probing 24000 Hz on the alternating ±1 Nyquist tone.',
    frequencyHz: SAMPLE_RATE / 2,
    sampleRate: SAMPLE_RATE,
    makeInput: () => nyquistTone(256, 1),
  },
];

// --- Serializable digests (what gets frozen / compared) --------------------

export interface FrozenSpectrum {
  binHz: number;
  window: string;
  magnitudes: number[];
}
export interface FrozenPeak {
  frequencyHz: number;
  magnitude: number;
  bin: number;
}
export interface FrozenEnvelope {
  rms: number;
  peak: number;
}
export interface FrozenEngine {
  kind: 'engine';
  frameCount: number;
  spectrum?: FrozenSpectrum;
  peaks?: FrozenPeak[];
  envelope?: FrozenEnvelope;
}
export interface FrozenGoertzel {
  kind: 'goertzel';
  frequencyHz: number;
  sampleRate: number;
  blockLength: number;
  magnitude: number;
  power: number;
}
export type FrozenResult = FrozenEngine | FrozenGoertzel;

function computeEngine(v: EngineVector): FrozenEngine {
  const engine = new TsDspEngine(v.options);
  const frames = engine.push(v.makeInput());
  const out: FrozenEngine = { kind: 'engine', frameCount: frames.length };

  const spectrum = frames.find((f) => f.stream === STREAM_SPECTRUM);
  if (spectrum) {
    const data = spectrum.data as SpectrumData;
    out.spectrum = {
      binHz: freeze(data.binHz),
      window: data.window,
      magnitudes: Array.from(data.magnitudes, freeze),
    };
  }
  const peaks = frames.find((f) => f.stream === STREAM_PEAKS);
  if (peaks) {
    const data = peaks.data as PeaksData;
    out.peaks = data.peaks.map((p) => ({
      frequencyHz: freeze(p.frequencyHz),
      magnitude: freeze(p.magnitude),
      bin: p.bin,
    }));
  }
  const envelope = frames.find((f) => f.stream === STREAM_ENVELOPE);
  if (envelope) {
    const data = envelope.data as EnvelopeData;
    out.envelope = { rms: freeze(data.rms), peak: freeze(data.peak) };
  }
  return out;
}

function computeGoertzel(v: GoertzelVector): FrozenGoertzel {
  const input = v.makeInput();
  return {
    kind: 'goertzel',
    frequencyHz: v.frequencyHz,
    sampleRate: v.sampleRate,
    blockLength: input.length,
    magnitude: freeze(goertzelMagnitude(input, v.frequencyHz, v.sampleRate)),
    power: freeze(goertzelPower(input, v.frequencyHz, v.sampleRate)),
  };
}

/** Run a vector through the reference implementation and digest the result. */
export function computeGolden(v: GoldenVector): FrozenResult {
  return v.kind === 'engine' ? computeEngine(v) : computeGoertzel(v);
}
