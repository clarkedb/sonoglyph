import type {
  DspEngine,
  FeatureFrame,
  Glyph,
  RecognizerPlugin,
  Unsubscribe,
} from '@sonoglyph/core';

/**
 * A plugin threw instead of returning — from `process(frame)` while a frame
 * was in flight, or from `flush()` at end of stream. Reported through
 * `Pipeline.onError`; the offending plugin is skipped and every other plugin
 * keeps going — one broken recognizer must not starve its siblings.
 */
export interface PipelineError {
  /** The plugin whose `process` or `flush` call threw. */
  plugin: RecognizerPlugin;
  /** The frame it was processing when it threw; absent for a `flush` error,
   * which is not tied to a frame. */
  frame?: FeatureFrame;
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
    this.dispatch(frames);
    return frames;
  }

  /**
   * End of stream: drain the engine's final frame(s) and flush every
   * plugin, so recognition still in flight — a key held with no trailing
   * silence, a press cut off when a recording stops — emits instead of
   * being dropped. Returns the drained frames.
   *
   * Translators are not owned by the pipeline (they subscribe via
   * `onGlyph`); the driver flushes them AFTER this call, so any glyph a
   * plugin emits here reaches them first.
   *
   * A plugin whose `flush` throws is reported via `onError` and skipped,
   * exactly like a throwing `process` — one broken recognizer must not
   * stop the others from emitting their final glyph.
   */
  flush(): FeatureFrame[] {
    const frames = this.engine.flush();
    this.dispatch(frames);
    for (const plugin of this.plugins) {
      try {
        plugin.flush?.();
      } catch (error) {
        for (const cb of this.errorSubs) cb({ plugin, error });
      }
    }
    return frames;
  }

  /** Fan a batch of frames out to frame subscribers and matching plugins. */
  private dispatch(frames: FeatureFrame[]): void {
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
