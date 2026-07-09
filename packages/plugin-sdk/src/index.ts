/**
 * @sonoglyph/plugin-sdk — helpers for recognizer plugin authors.
 *
 * The framework contract (`RecognizerPlugin` in @sonoglyph/core) is small
 * on purpose, but implementing it well means reinventing the same
 * debouncing/segmentation state machine every time. This package is that
 * machine, extracted from the DTMF reference plugin: write a per-frame
 * classifier, get press segmentation, dropout absorption, gap debouncing,
 * and span-corrected durations for free.
 */

export {
  defineRecognizer,
  SegmentingRecognizer,
  type FrameMatch,
  type GlyphInit,
  type Run,
  type RecognizerSpec,
  type SegmentationOptions,
} from './segmenting-recognizer.ts';
