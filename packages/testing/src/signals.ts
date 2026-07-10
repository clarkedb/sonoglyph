import type { ToneSpec } from '@sonoglyph/dsp';
import { concat, silence, tones, whiteNoise } from '@sonoglyph/dsp';

/** One step of a tone sequence: a chord (or single tone), then a gap. */
export interface ToneStep {
  /** Frequencies sounding simultaneously during this step. */
  tones: ToneSpec[];
  /** Override the sequence-wide tone duration for this step. */
  durationMs?: number;
  /** Override the sequence-wide gap after this step. */
  gapMs?: number;
}

export interface ToneSequenceOptions {
  sampleRate?: number;
  /** Duration of each step's tone, unless the step overrides it. */
  toneMs?: number;
  /** Silence after each step, unless the step overrides it. */
  gapMs?: number;
  /** Leading silence, so the first tone doesn't start at sample zero. */
  leadInMs?: number;
  /**
   * Trailing silence. Defaults to none: `decode` flushes the pipeline at
   * end of stream, so the last tone's glyph emits without a synthetic tail.
   * Set it only to model real trailing silence — e.g. a gap the recognizer
   * must *detect* rather than one flush stands in for.
   */
  tailMs?: number;
}

export const DEFAULT_SEQUENCE_OPTIONS: Required<ToneSequenceOptions> = {
  sampleRate: 48_000,
  toneMs: 80,
  gapMs: 80,
  leadInMs: 100,
  tailMs: 0,
};

/**
 * Synthesize a sequence of tone steps with per-step timing — the shape of
 * nearly every recognition test input: keys of a dial, Morse elements,
 * chords of a language. Domain mappings (key → frequency pair, letter →
 * dots and dashes) belong to the plugin under test; this builder only
 * turns the resulting steps into samples.
 */
export function toneSequence(steps: ToneStep[], options: ToneSequenceOptions = {}): Float32Array {
  const opts = { ...DEFAULT_SEQUENCE_OPTIONS, ...options };
  const parts: Float32Array[] = [silence(opts.leadInMs / 1000, opts.sampleRate)];
  for (const step of steps) {
    const toneMs = step.durationMs ?? opts.toneMs;
    const gapMs = step.gapMs ?? opts.gapMs;
    parts.push(tones(step.tones, toneMs / 1000, opts.sampleRate));
    if (gapMs > 0) parts.push(silence(gapMs / 1000, opts.sampleRate));
  }
  parts.push(silence(opts.tailMs / 1000, opts.sampleRate));
  return concat(...parts);
}

/** Scale samples in place so the largest absolute value is `amplitude`. */
function normalizePeak(samples: Float32Array, amplitude: number): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return samples;
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i]! / peak) * amplitude;
  return samples;
}

/**
 * Deterministic pink (1/f) noise with the given peak amplitude. Energy
 * falls ~3 dB per octave — the broad "everything at once" background of
 * rooms, wind, and crowds, and a harsher test than white noise for
 * low-frequency detectors. Paul Kellet's three-pole approximation over
 * the dsp white-noise generator.
 */
export function pinkNoise(
  durationSec: number,
  sampleRate: number,
  amplitude: number,
  seed = 1,
): Float32Array {
  const white = whiteNoise(durationSec, sampleRate, 1, seed);
  const out = new Float32Array(white.length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < white.length; i++) {
    const w = white[i]!;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return normalizePeak(out, amplitude);
}

export interface FanRumbleOptions {
  /** Low-pass cutoff in Hz. Real fan/HVAC rumble sits around 100–300 Hz. */
  cutoffHz?: number;
  seed?: number;
}

/**
 * Fan-like noise: white noise through a one-pole low-pass, which
 * concentrates energy in the rumble band the way real HVAC/fan noise
 * does. The motivating scenario: a quiet signal from across the room
 * with a fan next to the microphone — loud where the signal isn't.
 */
export function fanRumble(
  durationSec: number,
  sampleRate: number,
  amplitude: number,
  options: FanRumbleOptions = {},
): Float32Array {
  const { cutoffHz = 200, seed = 99 } = options;
  const raw = whiteNoise(durationSec, sampleRate, 1, seed);
  const out = new Float32Array(raw.length);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let y = 0;
  for (let i = 0; i < raw.length; i++) {
    y += alpha * (raw[i]! - y);
    out[i] = y;
  }
  return normalizePeak(out, amplitude);
}
