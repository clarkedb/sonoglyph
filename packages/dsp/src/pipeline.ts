import type {
  DspEngine,
  FeatureFrame,
  Glyph,
  RecognizerPlugin,
  Unsubscribe,
} from '@sonoglyph/core';

/**
 * A plugin's `process(frame)` threw instead of returning. Reported through
 * `Pipeline.onError`; the offending plugin is skipped for this frame and
 * every other plugin keeps receiving frames — one broken recognizer must
 * not starve its siblings.
 */
export interface PipelineError {
  /** The plugin whose `process` call threw. */
  plugin: RecognizerPlugin;
  /** The frame it was processing when it threw. */
  frame: FeatureFrame;
  /** The thrown value, as-is — plugin authors may throw anything. */
  error: unknown;
}

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
  private readonly errorSubs = new Set<(err: PipelineError) => void>();

  constructor(readonly engine: DspEngine) {}

  addPlugin(plugin: RecognizerPlugin): void {
    if (this.pluginUnsubs.has(plugin)) return;
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

  /** Push a chunk of samples through the engine and all plugins. A plugin
   * whose `process` throws is reported via `onError` and skipped for that
   * frame — it does not stop delivery to the other plugins or the rest of
   * this batch. */
  push(samples: Float32Array): FeatureFrame[] {
    const frames = this.engine.push(samples);
    for (const frame of frames) {
      for (const cb of this.frameSubs) cb(frame);
      for (const plugin of this.plugins) {
        if (plugin.metadata.requiredStreams.includes(frame.stream)) {
          try {
            plugin.process(frame);
          } catch (error) {
            for (const cb of this.errorSubs) cb({ plugin, frame, error });
          }
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

  /** Observe plugins that threw instead of processing a frame. A plugin
   * error never propagates out of `push` — this is the only way to see it. */
  onError(cb: (err: PipelineError) => void): Unsubscribe {
    this.errorSubs.add(cb);
    return () => this.errorSubs.delete(cb);
  }

  /** Reset engine and all plugins (e.g. when the audio source changes). */
  reset(): void {
    this.engine.reset();
    for (const plugin of this.plugins) plugin.reset();
  }

  /** Detach every plugin and subscriber. A disposed pipeline holds no
   * references into long-lived plugins, so it can be dropped for a rebuilt
   * one without leaking listeners. */
  dispose(): void {
    for (const plugin of [...this.plugins]) this.removePlugin(plugin);
    this.glyphSubs.clear();
    this.frameSubs.clear();
    this.errorSubs.clear();
  }
}
