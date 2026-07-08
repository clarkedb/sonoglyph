import { describe, expect, it } from 'vitest';
import type { FeatureFrame, Glyph, PluginMetadata } from '@sonoglyph/core';
import type { GlyphInit, Press, RecognizerSpec } from './segmenting-recognizer.js';
import { defineRecognizer, SegmentingRecognizer } from './segmenting-recognizer.js';

/**
 * Frames are hand-built: the machine only reads stream/time/span/hop, so
 * these tests need no DSP engine. Timing mirrors the engine defaults
 * (~43 ms span, ~11 ms hop at 48 kHz) to keep the numbers realistic.
 */
const SPAN = 2048 / 48_000;
const HOP = 512 / 48_000;

const METADATA: PluginMetadata = {
  id: 'test',
  name: 'Test recognizer',
  version: '0.0.0',
  requiredStreams: ['symbols'],
};

/** A frame whose data IS the classification, so `classify` is trivial. */
function frame(index: number, symbol: string | null, confidence = 0.9): FeatureFrame {
  return {
    stream: 'symbols',
    version: 1,
    time: index * HOP,
    span: SPAN,
    hop: HOP,
    data: symbol === null ? null : { symbol, confidence },
  };
}

type Data = { symbol: string; confidence: number } | null;

function makeRecognizer(
  overrides: Partial<RecognizerSpec<{ seq: number }, unknown>> = {},
  finalize?: (press: Press<{ seq: number }>) => GlyphInit | null,
) {
  let seq = 0;
  const recognizer = defineRecognizer<{ seq: number }>({
    metadata: METADATA,
    segmentation: { minDurationMs: 40, minGapMs: 25 },
    classify: (f) => {
      const data = f.data as Data;
      return data
        ? { symbol: data.symbol, confidence: data.confidence, payload: { seq: seq++ } }
        : null;
    },
    ...(finalize ? { finalize } : {}),
    ...overrides,
  });
  const glyphs: Glyph[] = [];
  recognizer.onGlyph((g) => glyphs.push(g));
  return { recognizer, glyphs };
}

/** Feed a run of per-frame symbols (null = silence) starting at index 0. */
function feed(recognizer: { process(f: FeatureFrame): void }, sequence: (string | null)[]) {
  sequence.forEach((symbol, i) => recognizer.process(frame(i, symbol)));
}

// 10 matched frames: duration = 10 * HOP - SPAN / 2 ≈ 85 ms > 40 ms.
const PRESS = Array<string>(10).fill('A');
// 4 gap frames ≈ 43 ms > 25 ms: enough to end a press.
const GAP = Array<null>(4).fill(null);

describe('SegmentingRecognizer', () => {
  it('emits one glyph per press, after the gap threshold', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, [...PRESS, ...GAP]);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.symbol).toBe('A');
    expect(glyphs[0]!.pluginId).toBe('test');
    expect(glyphs[0]!.start).toBe(0);
    expect(glyphs[0]!.confidence).toBeCloseTo(0.9);
  });

  it('span-corrects the reported duration', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, [...PRESS, ...GAP]);
    expect(glyphs[0]!.duration).toBeCloseTo(10 * HOP - SPAN / 2);
  });

  it('discards presses shorter than minDurationMs', () => {
    const { recognizer, glyphs } = makeRecognizer();
    // 5 frames ≈ 53 ms raw, ~32 ms span-corrected: under the 40 ms floor.
    feed(recognizer, [...Array<string>(5).fill('A'), ...GAP]);
    expect(glyphs).toHaveLength(0);
  });

  it('absorbs dropouts shorter than the gap threshold and credits them to the duration', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, [...PRESS, null, ...PRESS, ...GAP]);
    expect(glyphs).toHaveLength(1);
    // 21 frames total (10 + 1 absorbed + 10).
    expect(glyphs[0]!.duration).toBeCloseTo(21 * HOP - SPAN / 2);
  });

  it('debounces single-frame symbol flips instead of ending the press', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, [...PRESS, 'B', ...PRESS, ...GAP]);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.symbol).toBe('A');
  });

  it('separates presses split by a long enough gap', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, [...PRESS, ...GAP, ...PRESS, ...GAP]);
    expect(glyphs).toHaveLength(2);
    expect(glyphs[1]!.start).toBeGreaterThan(glyphs[0]!.start);
  });

  it('emits both symbols when the signal changes for good', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, [...PRESS, ...Array<string>(10).fill('B'), ...GAP]);
    expect(glyphs.map((g) => g.symbol)).toEqual(['A', 'B']);
  });

  it('ignores frames of other streams', () => {
    const { recognizer, glyphs } = makeRecognizer();
    recognizer.process({
      stream: 'other',
      version: 1,
      time: 0,
      span: SPAN,
      hop: HOP,
      data: { symbol: 'A', confidence: 1 },
    });
    feed(recognizer, GAP);
    expect(glyphs).toHaveLength(0);
  });

  it('reset clears an in-progress press without emitting', () => {
    const { recognizer, glyphs } = makeRecognizer();
    feed(recognizer, PRESS);
    recognizer.reset();
    feed(recognizer, GAP);
    expect(glyphs).toHaveLength(0);
  });

  it('unsubscribing stops delivery', () => {
    const { recognizer } = makeRecognizer();
    const received: Glyph[] = [];
    const unsub = recognizer.onGlyph((g) => received.push(g));
    unsub();
    feed(recognizer, [...PRESS, ...GAP]);
    expect(received).toHaveLength(0);
  });

  it('finalize sees every match and can aggregate payloads', () => {
    const presses: Press<{ seq: number }>[] = [];
    const { recognizer, glyphs } = makeRecognizer({}, (press) => {
      presses.push(press);
      return { payload: { first: press.matches[0]!.payload!.seq } };
    });
    feed(recognizer, [...PRESS, null, ...PRESS, ...GAP]);
    expect(glyphs[0]!.payload).toEqual({ first: 0 });
    expect(presses).toHaveLength(1);
    expect(presses[0]!.matches).toHaveLength(20); // the absorbed dropout did not match
    expect(presses[0]!.frameCount).toBe(21); // but it counts toward the duration
  });

  it('finalize can override symbol and confidence (duration-dependent symbols)', () => {
    const { recognizer, glyphs } = makeRecognizer({}, (press) => ({
      symbol: press.duration > 0.06 ? 'long' : 'short',
      confidence: 1,
    }));
    feed(recognizer, [...PRESS, ...GAP]);
    expect(glyphs[0]!.symbol).toBe('long');
    expect(glyphs[0]!.confidence).toBe(1);
  });

  it('finalize can veto a press by returning null', () => {
    const { recognizer, glyphs } = makeRecognizer({}, () => null);
    feed(recognizer, [...PRESS, ...GAP]);
    expect(glyphs).toHaveLength(0);
  });

  it('clamps mean confidence to 0..1', () => {
    const recognizer = defineRecognizer({
      metadata: METADATA,
      segmentation: { minDurationMs: 40, minGapMs: 25 },
      classify: (f) => ((f.data as Data) ? { symbol: 'A', confidence: 1.5 } : null),
    });
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    feed(recognizer, [...PRESS, ...GAP]);
    expect(glyphs[0]!.confidence).toBe(1);
  });

  it('throws when the metadata declares no streams and none is given', () => {
    expect(() =>
      defineRecognizer({
        metadata: { ...METADATA, requiredStreams: [] },
        segmentation: { minDurationMs: 40, minGapMs: 25 },
        classify: () => null,
      }),
    ).toThrow(/no stream/);
  });

  it('is subclassable for plugins that want a class of their own', () => {
    class Custom extends SegmentingRecognizer {
      constructor() {
        super({
          metadata: METADATA,
          segmentation: { minDurationMs: 40, minGapMs: 25 },
          classify: (f) => {
            const data = f.data as Data;
            return data ? { symbol: data.symbol, confidence: data.confidence } : null;
          },
        });
      }
    }
    const recognizer = new Custom();
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    feed(recognizer, [...PRESS, ...GAP]);
    expect(glyphs).toHaveLength(1);
  });
});
