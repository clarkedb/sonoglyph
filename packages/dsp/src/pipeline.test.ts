import { describe, expect, it, vi } from 'vitest';
import type { DspEngine, FeatureFrame, RecognizerPlugin } from '@sonoglyph/core';
import { Pipeline } from './pipeline.ts';

function fakeEngine(frames: FeatureFrame[], flushFrames: FeatureFrame[] = []): DspEngine {
  return {
    options: {
      sampleRate: 48_000,
      windowSize: 1024,
      hopSize: 512,
      window: 'hann',
      streams: ['test'],
    },
    push: () => frames,
    flush: () => flushFrames,
    reset: () => {},
  };
}

function frame(overrides: Partial<FeatureFrame> = {}): FeatureFrame {
  return { stream: 'test', version: 1, time: 0, span: 0.02, hop: 0.01, data: {}, ...overrides };
}

function stubPlugin(id: string, process: (frame: FeatureFrame) => void): RecognizerPlugin {
  return {
    metadata: { id, name: id, version: '0.0.0', requiredStreams: ['test'] },
    process,
    onGlyph: () => () => {},
    reset: () => {},
  };
}

describe('Pipeline error isolation', () => {
  it('does not let a throwing plugin abort push()', () => {
    const thrower = stubPlugin('bad', () => {
      throw new Error('boom');
    });
    const pipeline = new Pipeline(fakeEngine([frame()]));
    pipeline.addPlugin(thrower);
    expect(() => pipeline.push(new Float32Array(0))).not.toThrow();
  });

  it('keeps delivering to sibling plugins after one throws', () => {
    const seen: string[] = [];
    const thrower = stubPlugin('bad', () => {
      throw new Error('boom');
    });
    const good = stubPlugin('good', (f) => seen.push(f.stream));
    const pipeline = new Pipeline(fakeEngine([frame()]));
    pipeline.addPlugin(thrower);
    pipeline.addPlugin(good);
    pipeline.push(new Float32Array(0));
    expect(seen).toEqual(['test']);
  });

  it('keeps processing the rest of the batch after one frame throws', () => {
    const frames = [frame(), frame()];
    let calls = 0;
    const thrower = stubPlugin('bad', () => {
      calls++;
      if (calls === 1) throw new Error('boom');
    });
    const pipeline = new Pipeline(fakeEngine(frames));
    pipeline.addPlugin(thrower);
    pipeline.push(new Float32Array(0));
    expect(calls).toBe(2);
  });

  it('reports the plugin, frame, and error through onError', () => {
    const error = new Error('boom');
    const thrower = stubPlugin('bad', () => {
      throw error;
    });
    const f = frame();
    const pipeline = new Pipeline(fakeEngine([f]));
    pipeline.addPlugin(thrower);
    const onError = vi.fn();
    pipeline.onError(onError);
    pipeline.push(new Float32Array(0));
    expect(onError).toHaveBeenCalledWith({ plugin: thrower, frame: f, error });
  });

  it('stops reporting to a listener removed via the returned unsubscribe', () => {
    const thrower = stubPlugin('bad', () => {
      throw new Error('boom');
    });
    const pipeline = new Pipeline(fakeEngine([frame(), frame()]));
    pipeline.addPlugin(thrower);
    const onError = vi.fn();
    const unsubscribe = pipeline.onError(onError);
    unsubscribe();
    pipeline.push(new Float32Array(0));
    expect(onError).not.toHaveBeenCalled();
  });

  it('isolates a throwing flush(): siblings still flush, error reported with no frame', () => {
    const flushed: string[] = [];
    const error = new Error('boom');
    const thrower: RecognizerPlugin = {
      ...stubPlugin('bad', () => {}),
      flush: () => {
        throw error;
      },
    };
    const good: RecognizerPlugin = {
      ...stubPlugin('good', () => {}),
      flush: () => flushed.push('good'),
    };
    const pipeline = new Pipeline(fakeEngine([]));
    pipeline.addPlugin(thrower);
    pipeline.addPlugin(good);
    const onError = vi.fn();
    pipeline.onError(onError);
    expect(() => pipeline.flush()).not.toThrow();
    expect(flushed).toEqual(['good']);
    expect(onError).toHaveBeenCalledWith({ plugin: thrower, error });
  });
});
