//! Sonoglyph DSP core, in Rust. The TypeScript engine in `packages/dsp` is the
//! readable reference; every function here is cross-validated against its
//! frozen golden vectors (`packages/dsp/src/golden`).
//!
//! Inputs are `&[f32]` (a `Float32Array` at the WASM boundary) but the math
//! runs in `f64` — exactly as JavaScript does, where reading a `Float32Array`
//! element promotes it to a double. Matching the numeric type is what makes
//! the two implementations agree within the golden tolerance.

pub mod goertzel;

pub use goertzel::{goertzel_magnitude, goertzel_power};

#[cfg(target_arch = "wasm32")]
mod wasm;
