import type { DspEngineOptions, Glyph, RecognizerPlugin } from '@sonoglyph/core';
import { DEFAULT_ENGINE_OPTIONS, Pipeline, TsDspEngine } from '@sonoglyph/dsp';

export interface DecodeOptions {
  /** Sample rate of the signal. Defaults to 48 kHz, the engine default. */
  sampleRate?: number;
  /** Engine overrides beyond the sample rate (window size, streams, …).
   * A `sampleRate` in here wins over the top-level option — don't set
   * both, or the engine's rate silently detaches from the signal's. */
  engineOptions?: Partial<DspEngineOptions>;
  /**
   * Chunk size the signal is fed in. Defaults to 128 samples — the
   * AudioWorklet render quantum — so tests exercise the exact chunking
   * the microphone path produces.
   */
  chunkSize?: number;
}

/**
 * Feed a signal through the default pipeline and collect the glyphs the
 * plugin(s) emit. This is the decode harness every recognition test needs:
 * the same engine, the same pipeline, and the same worklet-sized chunks as
 * the live microphone path, so a green test means the browser behavior.
 */
export function decode(
  signal: Float32Array,
  plugins: RecognizerPlugin | RecognizerPlugin[],
  options: DecodeOptions = {},
): Glyph[] {
  const { sampleRate = 48_000, engineOptions = {}, chunkSize = 128 } = options;
  const pluginList = Array.isArray(plugins) ? plugins : [plugins];
  // Compute whatever the plugins declare they need, on top of the engine
  // defaults — a plugin's requiredStreams should be all it takes to test it.
  const streams = engineOptions.streams ?? [
    ...new Set([
      ...DEFAULT_ENGINE_OPTIONS.streams,
      ...pluginList.flatMap((p) => p.metadata.requiredStreams),
    ]),
  ];
  const pipeline = new Pipeline(new TsDspEngine({ sampleRate, ...engineOptions, streams }));
  for (const plugin of pluginList) {
    pipeline.addPlugin(plugin);
  }
  const glyphs: Glyph[] = [];
  pipeline.onGlyph((g) => glyphs.push(g));
  for (let i = 0; i < signal.length; i += chunkSize) {
    pipeline.push(signal.subarray(i, Math.min(i + chunkSize, signal.length)));
  }
  pipeline.dispose();
  return glyphs;
}

/** The recognized text: every glyph's symbol, concatenated in order. */
export function symbols(glyphs: Glyph[]): string {
  return glyphs.map((g) => g.symbol).join('');
}
