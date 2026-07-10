//! The FFT abstraction for the Sonoglyph DSP core (issue #16).
//!
//! [`Fft`] is the swappable interface; [`RadixTwoFft`] is the first backend — a
//! hand-rolled radix-2 Cooley–Tukey transform that is a **bit-exact port** of
//! the TypeScript `Fft` in `packages/dsp/src/fft.ts`. "Bit-exact" is the point:
//! the golden vectors are frozen from the TS engine and compared at a tight
//! tolerance, so the reference backend reproduces the TS arithmetic exactly —
//! f64 math, `f32` storage of the buffers and twiddles. Because every value
//! that flows through a transcendental (`sin`/`cos`/`hypot`) is stored as
//! `f32`, the f32 rounding absorbs the last-ULP differences between platforms'
//! and languages' math libraries, so the results match regardless of host.
//!
//! [`RustFftBackend`] is the optimized backend, wrapping the `rustfft` crate.
//! It is *not* bit-exact (different butterfly order and precision), so it is
//! validated against [`RadixTwoFft`] with a numerical tolerance rather than the
//! tight golden contract. Pick a backend with [`make_fft`].

use std::f64::consts::PI;
use std::sync::Arc;

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

/// A real-signal FFT: samples in, magnitude spectrum out.
pub trait Fft {
    /// The transform length in samples (a power of two).
    fn size(&self) -> usize;

    /// Magnitude spectrum of a real signal: bins `0..=size/2` (DC through
    /// Nyquist), each divided by `norm`. Pass the window sum / 2 so a
    /// full-scale windowed sine reads ~1.0; pass 1.0 for raw magnitudes.
    fn magnitudes(&self, signal: &[f32], norm: f64) -> Vec<f32>;
}

/// Radix-2 iterative FFT: bit-reversal permutation, then log2(N) passes of
/// butterflies with precomputed twiddle factors. A bit-exact port of the
/// TypeScript reference — see the module docs.
pub struct RadixTwoFft {
    size: usize,
    reverse: Vec<usize>,
    /// Twiddle factors e^(-2πik/N) for k in [0, N/2), stored as `f32` like the
    /// reference (this is what makes the transform bit-identical across hosts).
    cos: Vec<f32>,
    sin: Vec<f32>,
}

impl RadixTwoFft {
    /// # Panics
    /// If `size` is not a power of two ≥ 2.
    pub fn new(size: usize) -> Self {
        assert!(
            size >= 2 && (size & (size - 1)) == 0,
            "FFT size must be a power of two >= 2, got {size}"
        );
        let bits = size.trailing_zeros();

        let mut reverse = vec![0usize; size];
        for (i, slot) in reverse.iter_mut().enumerate() {
            let mut r = 0usize;
            for b in 0..bits {
                r |= ((i >> b) & 1) << (bits - 1 - b);
            }
            *slot = r;
        }

        let mut cos = vec![0f32; size / 2];
        let mut sin = vec![0f32; size / 2];
        for k in 0..size / 2 {
            let angle = (-2.0 * PI * k as f64) / size as f64;
            cos[k] = angle.cos() as f32;
            sin[k] = angle.sin() as f32;
        }

        Self {
            size,
            reverse,
            cos,
            sin,
        }
    }

    /// In-place complex FFT. `re` and `im` must each have length `size`; for
    /// real input, fill `im` with zeros. Arithmetic runs in f64 and stores back
    /// to `f32`, matching the reference exactly.
    ///
    /// # Panics
    /// If `re` or `im` is not `size` long.
    pub fn transform(&self, re: &mut [f32], im: &mut [f32]) {
        let n = self.size;
        assert!(
            re.len() == n && im.len() == n,
            "expected buffers of length {n}"
        );

        // Bit-reversal permutation.
        for i in 0..n {
            let j = self.reverse[i];
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }

        // Butterfly passes.
        let mut len = 2;
        while len <= n {
            let half = len >> 1;
            let step = n / len; // twiddle stride for this pass
            let mut start = 0;
            while start < n {
                for k in 0..half {
                    let even = start + k;
                    let odd = even + half;
                    let wr = self.cos[k * step] as f64;
                    let wi = self.sin[k * step] as f64;
                    let re_odd = re[odd] as f64;
                    let im_odd = im[odd] as f64;
                    let or_ = re_odd * wr - im_odd * wi;
                    let oi = re_odd * wi + im_odd * wr;
                    let re_even = re[even] as f64;
                    let im_even = im[even] as f64;
                    re[odd] = (re_even - or_) as f32;
                    im[odd] = (im_even - oi) as f32;
                    re[even] = (re_even + or_) as f32;
                    im[even] = (im_even + oi) as f32;
                }
                start += len;
            }
            len <<= 1;
        }
    }
}

impl Fft for RadixTwoFft {
    fn size(&self) -> usize {
        self.size
    }

    fn magnitudes(&self, signal: &[f32], norm: f64) -> Vec<f32> {
        let n = self.size;
        let mut re = vec![0f32; n];
        let mut im = vec![0f32; n];
        let copy = signal.len().min(n);
        re[..copy].copy_from_slice(&signal[..copy]);
        self.transform(&mut re, &mut im);

        let bins = n / 2 + 1;
        (0..bins)
            .map(|k| ((re[k] as f64).hypot(im[k] as f64) / norm) as f32)
            .collect()
    }
}

/// The optimized backend: `rustfft`'s mixed-radix transform. Numerically
/// equivalent to [`RadixTwoFft`] but not bit-identical.
pub struct RustFftBackend {
    size: usize,
    fft: Arc<dyn rustfft::Fft<f32>>,
}

impl RustFftBackend {
    /// # Panics
    /// If `size` is not a power of two ≥ 2 (kept consistent with the reference,
    /// though `rustfft` itself handles any length).
    pub fn new(size: usize) -> Self {
        assert!(
            size >= 2 && (size & (size - 1)) == 0,
            "FFT size must be a power of two >= 2, got {size}"
        );
        let fft = FftPlanner::<f32>::new().plan_fft_forward(size);
        Self { size, fft }
    }
}

impl Fft for RustFftBackend {
    fn size(&self) -> usize {
        self.size
    }

    fn magnitudes(&self, signal: &[f32], norm: f64) -> Vec<f32> {
        let n = self.size;
        let mut buffer = vec![
            Complex {
                re: 0.0_f32,
                im: 0.0_f32
            };
            n
        ];
        let copy = signal.len().min(n);
        for (slot, &s) in buffer.iter_mut().zip(&signal[..copy]) {
            slot.re = s;
        }
        self.fft.process(&mut buffer);

        let bins = n / 2 + 1;
        buffer[..bins]
            .iter()
            .map(|c| ((c.re as f64).hypot(c.im as f64) / norm) as f32)
            .collect()
    }
}

/// Which [`Fft`] backend to build.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FftBackend {
    /// The bit-exact reference (holds the golden contract).
    RadixTwo,
    /// The optimized `rustfft` backend (numerically equivalent, faster).
    RustFft,
}

/// Build the chosen [`Fft`] backend for a transform of `size`.
pub fn make_fft(backend: FftBackend, size: usize) -> Box<dyn Fft> {
    match backend {
        FftBackend::RadixTwo => Box::new(RadixTwoFft::new(size)),
        FftBackend::RustFft => Box::new(RustFftBackend::new(size)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic(expected = "power of two")]
    fn rejects_non_power_of_two() {
        RadixTwoFft::new(1000);
    }

    #[test]
    fn rustfft_backend_matches_the_reference() {
        // The two backends must agree numerically (looser than the bit-exact
        // golden tolerance — different algorithm, different rounding).
        let n = 512;
        let signal: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64;
                (0.7 * (2.0 * PI * 5.0 * t / n as f64).sin()
                    + 0.3 * (2.0 * PI * 60.0 * t / n as f64).sin()) as f32
            })
            .collect();
        let reference = RadixTwoFft::new(n).magnitudes(&signal, 1.0);
        let optimized = RustFftBackend::new(n).magnitudes(&signal, 1.0);
        for (a, b) in reference.iter().zip(&optimized) {
            assert!(
                (*a as f64 - *b as f64).abs() < 1e-3,
                "reference {a}, rustfft {b}"
            );
        }
    }

    #[test]
    fn dc_signal_has_energy_only_in_bin_zero() {
        let fft = RadixTwoFft::new(8);
        let mags = fft.magnitudes(&[1.0; 8], 1.0);
        assert!((mags[0] as f64 - 8.0).abs() < 1e-5);
        for &m in &mags[1..] {
            assert!((m as f64).abs() < 1e-5);
        }
    }

    #[test]
    fn sine_on_a_bin_peaks_at_that_bin() {
        // A sine at bin 2 of an 8-point transform.
        let n = 8;
        let fft = RadixTwoFft::new(n);
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 2.0 * i as f64 / n as f64).sin() as f32)
            .collect();
        let mags = fft.magnitudes(&signal, 1.0);
        let peak = mags
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap()
            .0;
        assert_eq!(peak, 2);
    }
}
