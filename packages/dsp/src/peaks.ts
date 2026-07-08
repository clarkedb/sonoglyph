import type { SpectralPeak } from '@sonoglyph/core';

export interface PeakDetectOptions {
  /** Frequency width of one FFT bin, in Hz. */
  binHz: number;
  /** Ignore peaks below this magnitude (absolute, post-normalization). */
  minMagnitude?: number;
  /** Ignore peaks quieter than `maxMagnitude * relativeThreshold`. */
  relativeThreshold?: number;
  /** Return at most this many peaks (strongest first). */
  maxPeaks?: number;
}

/**
 * Find spectral peaks: local maxima refined with parabolic interpolation.
 *
 * A pure tone rarely lands exactly on an FFT bin; its energy peaks at the
 * nearest bin with the true frequency somewhere between neighbors. Fitting
 * a parabola through the peak bin and its two neighbors (in log-magnitude,
 * where windowed peaks are near-parabolic) recovers the true frequency to a
 * small fraction of a bin — which is what lets a ~12 Hz-bin FFT check DTMF
 * frequencies against a ±1.5% tolerance.
 */
export function detectPeaks(magnitudes: Float32Array, opts: PeakDetectOptions): SpectralPeak[] {
  const { binHz, minMagnitude = 1e-4, relativeThreshold = 0.01, maxPeaks = 16 } = opts;

  let max = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    if (magnitudes[i]! > max) max = magnitudes[i]!;
  }
  const floor = Math.max(minMagnitude, max * relativeThreshold);

  const peaks: SpectralPeak[] = [];
  // Skip DC (bin 0) and Nyquist (last bin); neither is a meaningful peak.
  for (let k = 1; k < magnitudes.length - 1; k++) {
    const m = magnitudes[k]!;
    if (m < floor) continue;
    if (m <= magnitudes[k - 1]! || m < magnitudes[k + 1]!) continue;

    // Parabolic interpolation in log magnitude. Offset p is in (-0.5, 0.5)
    // bins; the interpolated peak height is y1 - (a-c)*p/4 in log space.
    const a = Math.log(Math.max(magnitudes[k - 1]!, 1e-12));
    const b = Math.log(Math.max(m, 1e-12));
    const c = Math.log(Math.max(magnitudes[k + 1]!, 1e-12));
    const denom = a - 2 * b + c;
    const p = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    const offset = Math.max(-0.5, Math.min(0.5, p));

    peaks.push({
      frequencyHz: (k + offset) * binHz,
      magnitude: Math.exp(b - 0.25 * (a - c) * offset),
      bin: k,
    });
  }

  peaks.sort((x, y) => y.magnitude - x.magnitude);
  return peaks.slice(0, maxPeaks);
}
