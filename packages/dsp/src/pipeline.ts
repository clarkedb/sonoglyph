import type {
  DspEngine,
  FeatureFrame,
  Glyph,
  RecognizerPlugin,
  Unsubscribe,
} from '@sonoglyph/core';

/**
 * Wires an engine to a set of recognizer plugins: push samples in, feature
 * frames fan out to every plugin that declared the frame's stream, glyphs
 * fan in to subscribers. This is the exact object both the playground's
 * microphone path and the integration tests drive — determinism depends on
 * there being only one pipeline implementation.
 */
export class Pipeline {
  private readonly plugins: RecognizerPlugin[] = [];
  private readonly pluginUnsubs = new Map<RecognizerPlugin, Unsubscribe>();
  private readonly glyphSubs = new Set<(glyph: Glyph) => void>();
  private readonly frameSubs = new Set<(frame: FeatureFrame) => void>();

  constructor(readonly engine: DspEngine) {}

  addPlugin(plugin: RecognizerPlugin): void {
    this.plugins.push(plugin);
    this.pluginUnsubs.set(
      plugin,
      plugin.onGlyph((glyph) => {
        for (const cb of this.glyphSubs) cb(glyph);
      }),
    );
  }

  removePlugin(plugin: RecognizerPlugin): void {
    const i = this.plugins.indexOf(plugin);
    if (i === -1) return;
    this.plugins.splice(i, 1);
    this.pluginUnsubs.get(plugin)?.();
    this.pluginUnsubs.delete(plugin);
  }

  /** Push a chunk of samples through the engine and all plugins. */
  push(samples: Float32Array): FeatureFrame[] {
    const frames = this.engine.push(samples);
    for (const frame of frames) {
      for (const cb of this.frameSubs) cb(frame);
      for (const plugin of this.plugins) {
        if (plugin.metadata.requiredStreams.includes(frame.stream)) {
          plugin.process(frame);
        }
      }
    }
    return frames;
  }

  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe {
    this.glyphSubs.add(cb);
    return () => this.glyphSubs.delete(cb);
  }

  /** Observe every feature frame (visualizations use this; they can never
   * influence recognition). */
  onFrame(cb: (frame: FeatureFrame) => void): Unsubscribe {
    this.frameSubs.add(cb);
    return () => this.frameSubs.delete(cb);
  }

  /** Reset engine and all plugins (e.g. when the audio source changes). */
  reset(): void {
    this.engine.reset();
    for (const plugin of this.plugins) plugin.reset();
  }
}
