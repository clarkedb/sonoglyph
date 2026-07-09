/**
 * @sonoglyph/testing — test a recognizer under realistic conditions in a
 * few lines.
 *
 * Extracted from what the DTMF plugin's tests grew by hand: signal
 * builders composing on the dsp generators (tone sequences with per-step
 * timing, noise colors), and a decode harness that runs the exact
 * pipeline the microphone path uses, in worklet-sized chunks. Test
 * signals are always generated in code, never stored as fixtures.
 */

export {
  toneSequence,
  pinkNoise,
  fanRumble,
  DEFAULT_SEQUENCE_OPTIONS,
  type ToneStep,
  type ToneSequenceOptions,
  type FanRumbleOptions,
} from './signals.js';
export { decode, symbols, type DecodeOptions } from './decode.js';
