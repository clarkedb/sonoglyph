//! wasm-bindgen exports for the DSP primitives. Names mirror the TypeScript
//! `@sonoglyph/dsp` API (camelCase) so a consumer can swap `@sonoglyph/dsp`
//! for `@sonoglyph/dsp-wasm` by changing the import alone.
//!
//! `samples: &[f32]` is marshalled by wasm-bindgen as a copy from a JS
//! `Float32Array` into WASM memory on each call. That is fine for a probe
//! called a few times per frame; a zero-copy path (a view into pre-allocated
//! WASM memory) is only worth adding for the streaming engine's hot loop.

use wasm_bindgen::prelude::*;

use crate::goertzel;

#[wasm_bindgen(js_name = goertzelMagnitude)]
pub fn goertzel_magnitude(samples: &[f32], frequency_hz: f64, sample_rate: f64) -> f64 {
    goertzel::goertzel_magnitude(samples, frequency_hz, sample_rate)
}

#[wasm_bindgen(js_name = goertzelPower)]
pub fn goertzel_power(samples: &[f32], frequency_hz: f64, sample_rate: f64) -> f64 {
    goertzel::goertzel_power(samples, frequency_hz, sample_rate)
}
