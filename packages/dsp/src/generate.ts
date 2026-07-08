/**
 * Pure signal synthesis. Test signals are generated in code, never stored
 * as fixtures — these helpers are used by unit tests, integration tests,
 * and the playground's tone generator alike.
 */

export interface ToneSpec {
  frequencyHz: number;
  /** Linear amplitude, default 1. */
  amplitude?: number;
  /** Starting phase in radians, default 0. */
  phase?: number;
}

/** A sum of sine waves, `durationSec` long. */
export function tones(specs: ToneSpec[], durationSec: number, sampleRate: number): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (const { frequencyHz, amplitude = 1, phase = 0 } of specs) {
    const step = (2 * Math.PI * frequencyHz) / sampleRate;
    for (let i = 0; i < n; i++) {
      out[i]! += amplitude * Math.sin(phase + step * i);
    }
  }
  return out;
}

export function sine(
  frequencyHz: number,
  durationSec: number,
  sampleRate: number,
  amplitude = 1,
): Float32Array {
  return tones([{ frequencyHz, amplitude }], durationSec, sampleRate);
}

export function silence(durationSec: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(durationSec * sampleRate));
}

/** Deterministic white noise (mulberry32 PRNG) with the given peak amplitude. */
export function whiteNoise(
  durationSec: number,
  sampleRate: number,
  amplitude: number,
  seed = 1,
): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  let state = seed >>> 0;
  for (let i = 0; i < n; i++) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    out[i] = amplitude * (2 * r - 1);
  }
  return out;
}

/** Concatenate sample buffers. */
export function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Sample-wise sum; the result has the length of the longest input. */
export function mix(...parts: Float32Array[]): Float32Array {
  const total = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(total);
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) out[i]! += p[i]!;
  }
  return out;
}
