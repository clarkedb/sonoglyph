import { describe, expect, it } from 'vitest';
import type { EnvelopeData, PeaksData, SpectrumData } from '@sonoglyph/core';
import { STREAM_ENVELOPE, STREAM_PEAKS, STREAM_SPECTRUM } from '@sonoglyph/core';
import { TsDspEngine } from './engine.js';
import { silence, sine } from './generate.js';

const SAMPLE_RATE = 48_000;

describe('TsDspEngine', () => {
  it('emits one frame per configured stream per hop', () => {
    const engine = new TsDspEngine({ sampleRate: SAMPLE_RATE, windowSize: 1024, hopSize: 512 });
    // 2048 samples: windows start at 0, 512, 1024 → 3 hops × 3 streams.
    const frames = engine.push(silence(2048 / SAMPLE_RATE, SAMPLE_RATE));
    expect(frames.length).toBe(9);
    expect(frames.map((f) => f.stream)).toEqual([
      STREAM_SPECTRUM,
      STREAM_PEAKS,
      STREAM_ENVELOPE,
      STREAM_SPECTRUM,
      STREAM_PEAKS,
      STREAM_ENVELOPE,
      STREAM_SPECTRUM,
      STREAM_PEAKS,
      STREAM_ENVELOPE,
    ]);
  });

  it('is chunking-invariant: many small pushes equal one big push', () => {
    const signal = sine(440, 0.3, SAMPLE_RATE, 0.8);

    const whole = new TsDspEngine({ sampleRate: SAMPLE_RATE });
    const wholeFrames = whole.push(signal);

    const chunked = new TsDspEngine({ sampleRate: SAMPLE_RATE });
    const chunkedFrames = [];
    for (let i = 0; i < signal.length; i += 128) {
      chunkedFrames.push(...chunked.push(signal.subarray(i, Math.min(i + 128, signal.length))));
    }

    expect(chunkedFrames.length).toBe(wholeFrames.length);
    for (let i = 0; i < wholeFrames.length; i++) {
      expect(chunkedFrames[i]!.time).toBeCloseTo(wholeFrames[i]!.time, 9);
      expect(chunkedFrames[i]!.stream).toBe(wholeFrames[i]!.stream);
    }
    const wholePeaks = wholeFrames.find((f) => f.stream === STREAM_PEAKS)!.data as PeaksData;
    const chunkedPeaks = chunkedFrames.find((f) => f.stream === STREAM_PEAKS)!.data as PeaksData;
    expect(chunkedPeaks.peaks[0]!.frequencyHz).toBeCloseTo(wholePeaks.peaks[0]!.frequencyHz, 6);
  });

  it('frame times advance by hopSize/sampleRate', () => {
    const engine = new TsDspEngine({ sampleRate: SAMPLE_RATE, windowSize: 1024, hopSize: 256 });
    const frames = engine
      .push(silence(0.1, SAMPLE_RATE))
      .filter((f) => f.stream === STREAM_ENVELOPE);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.time - frames[i - 1]!.time).toBeCloseTo(256 / SAMPLE_RATE, 9);
    }
  });

  it('computes only requested streams', () => {
    const engine = new TsDspEngine({ sampleRate: SAMPLE_RATE, streams: [STREAM_ENVELOPE] });
    const frames = engine.push(sine(440, 0.2, SAMPLE_RATE));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.stream === STREAM_ENVELOPE)).toBe(true);
  });

  it('reports a full-scale sine as ~1.0 in the spectrum and ~0.707 RMS', () => {
    const engine = new TsDspEngine({ sampleRate: SAMPLE_RATE });
    const frames = engine.push(sine(1000, 0.2, SAMPLE_RATE, 1));
    const spectrum = frames.find((f) => f.stream === STREAM_SPECTRUM)!.data as SpectrumData;
    const maxMag = Math.max(...spectrum.magnitudes);
    expect(maxMag).toBeGreaterThan(0.9);
    expect(maxMag).toBeLessThan(1.1);

    const envelope = frames.find((f) => f.stream === STREAM_ENVELOPE)!.data as EnvelopeData;
    expect(envelope.rms).toBeCloseTo(Math.SQRT1_2, 2);
    expect(envelope.peak).toBeCloseTo(1, 2);
  });

  it('reset clears buffered samples and rewinds stream time', () => {
    const engine = new TsDspEngine({ sampleRate: SAMPLE_RATE, windowSize: 1024, hopSize: 512 });
    engine.push(silence(0.05, SAMPLE_RATE));
    engine.reset();
    const frames = engine.push(silence(1024 / SAMPLE_RATE, SAMPLE_RATE));
    expect(frames[0]!.time).toBe(0);
  });

  it('rejects invalid configuration', () => {
    expect(() => new TsDspEngine({ windowSize: 1000 })).toThrow(/power of two/);
    expect(() => new TsDspEngine({ windowSize: 1024, hopSize: 2048 })).toThrow(/hopSize/);
  });
});
