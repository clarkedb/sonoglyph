export { Fft } from './fft.ts';
export { goertzelMagnitude, goertzelPower } from './goertzel.ts';
export { makeWindow, windowSum, WINDOW_NAMES } from './window.ts';
export { detectPeaks, type PeakDetectOptions } from './peaks.ts';
export {
  TsDspEngine,
  DEFAULT_ENGINE_OPTIONS,
  SPECTRUM_VERSION,
  PEAKS_VERSION,
  ENVELOPE_VERSION,
  SAMPLES_VERSION,
} from './engine.ts';
export { Pipeline, type PipelineError } from './pipeline.ts';
export { tones, sine, silence, whiteNoise, concat, mix, type ToneSpec } from './generate.ts';
