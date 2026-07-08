/**
 * The Goertzel algorithm: signal energy at ONE known frequency, computed
 * as a two-tap recursive filter over the samples. Where the FFT answers
 * "what frequencies are present?" for ~N·log N work, Goertzel answers
 * "how much of frequency f is present?" for ~N multiplies — the classic
 * choice when a decoder already knows the handful of frequencies it cares
 * about, as real-world DTMF decoders do.
 *
 * Frequency selectivity is set by the block length: like an FFT bin, a
 * rectangular block of N samples has a main lobe ~2·sampleRate/N wide, so
 * shorter blocks trade selectivity for time resolution at the same cost.
 */

/**
 * Normalized magnitude of `frequencyHz` in the block: a full-scale sine
 * at that exact frequency measures ~1.0, matching the engine's spectrum
 * normalization. The frequency does not need to land on a bin.
 */
export function goertzelMagnitude(
  samples: Float32Array,
  frequencyHz: number,
  sampleRate: number,
): number {
  const n = samples.length;
  const coeff = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = samples[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  // |X|² for the final state; 2/N scales a full-scale in-bin sine to 1.
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return (2 / n) * Math.sqrt(Math.max(0, power));
}

/**
 * Normalized power (magnitude squared). For an amplitude-A sine at the
 * measured frequency this is ~A², so powers are directly comparable with
 * the block's mean-square energy times two (a sine's mean square is A²/2).
 */
export function goertzelPower(
  samples: Float32Array,
  frequencyHz: number,
  sampleRate: number,
): number {
  const magnitude = goertzelMagnitude(samples, frequencyHz, sampleRate);
  return magnitude * magnitude;
}
