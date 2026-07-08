/**
 * The docs/plugins.md walkthrough, verbatim — the chirp recognizer a
 * stranger builds by following the doc. If a framework change breaks
 * this file, the walkthrough is lying; fix the doc in the same PR.
 */
import { describe, expect, it } from 'vitest';
import type { FeatureFrame, Glyph, PeaksData, RecognizerPlugin } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import { mix } from '@sonoglyph/dsp';
import { defineRecognizer } from '@sonoglyph/plugin-sdk';
import { decode, fanRumble, symbols, toneSequence } from './index.js';

// --- docs/plugins.md step 2: the classifier -------------------------------

interface ChirpOptions {
  /** The chirp's nominal frequency. Smoke alarms sit near 3.2 kHz. */
  frequencyHz: number;
  /** Accepted deviation from nominal, in Hz. */
  toleranceHz: number;
  /** A chirp must persist at least this long. */
  minChirpMs: number;
  /** Silence this long ends the chirp. */
  minGapMs: number;
}

const DEFAULT_CHIRP_OPTIONS: ChirpOptions = {
  frequencyHz: 3200,
  toleranceHz: 150,
  minChirpMs: 60,
  minGapMs: 40,
};

/** Payload on every chirp glyph: why the recognizer said yes. */
interface ChirpPayload {
  /** Mean detected frequency across the chirp, in Hz. */
  meanHz: number;
}

function createChirpRecognizer(options: Partial<ChirpOptions> = {}): RecognizerPlugin {
  const opts = { ...DEFAULT_CHIRP_OPTIONS, ...options };
  return defineRecognizer<{ frequencyHz: number }, ChirpPayload>({
    metadata: {
      id: 'chirp',
      name: 'Smoke-alarm chirp',
      version: '0.1.0',
      requiredStreams: [STREAM_PEAKS],
    },
    segmentation: { minDurationMs: opts.minChirpMs, minGapMs: opts.minGapMs },

    // The per-frame judgment. Return a match, or null.
    classify: (frame: FeatureFrame) => {
      const { peaks } = frame.data as PeaksData; // sorted by magnitude
      const loudest = peaks[0];
      if (!loudest) return null;
      const offHz = Math.abs(loudest.frequencyHz - opts.frequencyHz);
      if (offHz > opts.toleranceHz) return null;
      return {
        symbol: '!',
        confidence: 1 - offHz / opts.toleranceHz,
        payload: { frequencyHz: loudest.frequencyHz },
      };
    },

    // Optional: turn the finished press into the emitted glyph. This is
    // where per-frame payloads aggregate into one story.
    finalize: (press) => ({
      payload: {
        meanHz:
          press.matches.reduce((sum, m) => sum + m.payload!.frequencyHz, 0) / press.matches.length,
      },
    }),
  });
}

// --- docs/plugins.md step 4: the tests -------------------------------------

describe('chirp recognizer', () => {
  const threeChirps = () =>
    toneSequence(
      Array.from({ length: 3 }, () => ({ tones: [{ frequencyHz: 3210, amplitude: 0.3 }] })),
      { toneMs: 100, gapMs: 150 },
    );

  it('hears three chirps and reports the measured frequency', () => {
    const glyphs = decode(threeChirps(), createChirpRecognizer()) as Glyph<ChirpPayload>[];
    expect(symbols(glyphs)).toBe('!!!');
    expect(glyphs[0]!.payload!.meanHz).toBeCloseTo(3210, -1);
  });

  it('still hears them over fan rumble', () => {
    const chirps = threeChirps();
    const noisy = mix(chirps, fanRumble(chirps.length / 48_000, 48_000, 0.2));
    expect(symbols(decode(noisy, createChirpRecognizer()))).toBe('!!!');
  });

  it('ignores tones at other frequencies', () => {
    const wrong = toneSequence([{ tones: [{ frequencyHz: 1000, amplitude: 0.3 }] }]);
    expect(decode(wrong, createChirpRecognizer())).toHaveLength(0);
  });
});
