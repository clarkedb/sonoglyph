import { describe, expect, it } from 'vitest';
import type { EnvelopeData, FeatureFrame } from '@sonoglyph/core';
import { STREAM_ENVELOPE } from '@sonoglyph/core';
import { defineRecognizer } from '@sonoglyph/plugin-sdk';
import { decode, symbols } from './decode.ts';
import { toneSequence } from './signals.ts';

/**
 * A deliberately dumb plugin — "is anything sounding?" — built with the
 * SDK exactly the way docs/plugins.md tells a stranger to. If this test
 * gets longer than a screen, the testing module has failed its issue.
 */
const beepDetector = () =>
  defineRecognizer({
    metadata: {
      id: 'beep',
      name: 'Beep detector',
      version: '0.0.0',
      requiredStreams: [STREAM_ENVELOPE],
    },
    segmentation: { minDurationMs: 40, minGapMs: 25 },
    classify: (frame: FeatureFrame) =>
      (frame.data as EnvelopeData).rms > 0.05 ? { symbol: 'B', confidence: 1 } : null,
  });

const beeps = (count: number) =>
  toneSequence(
    Array.from({ length: count }, () => ({ tones: [{ frequencyHz: 440, amplitude: 0.5 }] })),
  );

describe('decode', () => {
  it('runs a signal through the default pipeline and collects glyphs', () => {
    const glyphs = decode(beeps(3), beepDetector());
    expect(symbols(glyphs)).toBe('BBB');
    expect(glyphs[0]!.pluginId).toBe('beep');
    expect(glyphs[0]!.duration).toBeGreaterThan(0.04);
  });

  it('feeds worklet-sized chunks by default, and chunking does not change the result', () => {
    const signal = beeps(2);
    const byQuantum = decode(signal, beepDetector());
    const bySecond = decode(signal, beepDetector(), { chunkSize: 48_000 });
    expect(symbols(byQuantum)).toBe(symbols(bySecond));
    byQuantum.forEach((glyph, i) => {
      // Same glyphs, up to float accumulation differences in stream time.
      expect(glyph.start).toBeCloseTo(bySecond[i]!.start, 9);
      expect(glyph.duration).toBeCloseTo(bySecond[i]!.duration, 9);
    });
  });

  it('fans frames out to multiple plugins', () => {
    const glyphs = decode(beeps(1), [beepDetector(), beepDetector()]);
    expect(symbols(glyphs)).toBe('BB');
  });

  it('honors engine overrides', () => {
    const glyphs = decode(beeps(1), beepDetector(), {
      engineOptions: { windowSize: 1024, hopSize: 256 },
    });
    expect(symbols(glyphs)).toBe('B');
  });
});
