/**
 * Radix-2 iterative FFT, hand-rolled on purpose: this implementation is
 * meant to be read. It follows the classic Cooley–Tukey shape —
 * bit-reversal permutation, then log2(N) passes of butterflies with
 * precomputed twiddle factors.
 */
export class Fft {
  readonly size: number;
  private readonly reverse: Uint32Array;
  /** Twiddle factors e^(-2πik/N) for k in [0, N/2). */
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two >= 2, got ${size}`);
    }
    this.size = size;

    const bits = Math.log2(size);
    this.reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reverse[i] = r;
    }

    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let k = 0; k < size / 2; k++) {
      const angle = (-2 * Math.PI * k) / size;
      this.cos[k] = Math.cos(angle);
      this.sin[k] = Math.sin(angle);
    }
  }

  /**
   * In-place complex FFT. `re` and `im` must each have length `size`.
   * For real input, fill `im` with zeros.
   */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    if (re.length !== n || im.length !== n) {
      throw new Error(`Expected buffers of length ${n}`);
    }

    // Bit-reversal permutation: reorder input so each butterfly pass can
    // combine adjacent blocks.
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i]!;
      if (j > i) {
        const tr = re[i]!;
        re[i] = re[j]!;
        re[j] = tr;
        const ti = im[i]!;
        im[i] = im[j]!;
        im[j] = ti;
      }
    }

    // Butterfly passes: combine size-1 DFTs into size-2, size-2 into
    // size-4, … until one size-n DFT remains.
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len; // twiddle stride for this pass
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k++) {
          const even = start + k;
          const odd = even + half;
          const wr = this.cos[k * step]!;
          const wi = this.sin[k * step]!;
          const or_ = re[odd]! * wr - im[odd]! * wi;
          const oi = re[odd]! * wi + im[odd]! * wr;
          re[odd] = re[even]! - or_;
          im[odd] = im[even]! - oi;
          re[even] = re[even]! + or_;
          im[even] = im[even]! + oi;
        }
      }
    }
  }

  /**
   * Magnitude spectrum of a real signal: bins 0..N/2 inclusive (DC through
   * Nyquist). Magnitudes are normalized by `norm` (pass the window sum / 2
   * so a full-scale windowed sine reads ~1.0; pass 1 for raw magnitudes).
   */
  magnitudes(signal: Float32Array, norm = 1, out?: Float32Array): Float32Array {
    const n = this.size;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    re.set(signal.subarray(0, n));
    this.transform(re, im);
    const bins = n / 2 + 1;
    const mags = out ?? new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      mags[k] = Math.hypot(re[k]!, im[k]!) / norm;
    }
    return mags;
  }
}
