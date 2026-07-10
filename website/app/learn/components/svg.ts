/**
 * SVG path builders shared by the chapter figures. Figures draw with the
 * site's CSS variables (var(--phosphor), var(--line), …) so every plot
 * follows the theme, light mode included.
 */

/** Polyline path through sample values: x spans [0, w], y is centered on
 * h/2 with `amp` fraction of half-height at |value| = 1. */
export function samplesPath(samples: ArrayLike<number>, w: number, h: number, amp = 0.9): string {
  const n = samples.length;
  if (n === 0) return '';
  const mid = h / 2;
  const scale = (h / 2) * amp;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i / (n - 1)) * w;
    const y = mid - (samples[i] ?? 0) * scale;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(' ');
}

export const DB_FLOOR = -90;

export function toDb(magnitude: number): number {
  return Math.max(DB_FLOOR, 20 * Math.log10(magnitude + 1e-9));
}

/** Spectrum magnitudes as a dB line: x spans [0, maxHz] → [0, w]; y maps
 * 0 dB to the top and DB_FLOOR to the bottom. */
export function spectrumPath(
  magnitudes: ArrayLike<number>,
  binHz: number,
  maxHz: number,
  w: number,
  h: number,
): string {
  const parts: string[] = [];
  const count = Math.min(magnitudes.length, Math.ceil(maxHz / binHz) + 1);
  for (let k = 0; k < count; k++) {
    const x = ((k * binHz) / maxHz) * w;
    const y = (toDb(magnitudes[k] ?? 0) / DB_FLOOR) * h;
    parts.push(`${k === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(' ');
}
