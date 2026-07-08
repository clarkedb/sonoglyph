import type { FeatureFrame, PeaksData, PluginMetadata, SpectralPeak } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import type { FrameMatch, Press } from '@sonoglyph/plugin-sdk';
import { SegmentingRecognizer } from '@sonoglyph/plugin-sdk';
import { HIGH_GROUP, keyFor, LOW_GROUP } from './frequencies.js';

export interface DtmfOptions {
  /**
   * Accepted deviation from a nominal tone, as a fraction of that tone's
   * frequency. ITU-T Q.24 requires accepting ≤1.5% and rejecting ≥3.5%;
   * the default of 2% sits between them.
   */
  freqTolerance: number;
  /** A key must persist at least this long to count as a press. */
  minToneMs: number;
  /** Silence (or a different key) this long ends the current press. */
  minGapMs: number;
  /** Maximum level difference between the two tones, in dB ("twist"). */
  maxTwistDb: number;
  /**
   * The frequency band the recognizer considers, in Hz. Peaks outside it
   * are invisible to the dominance check — a rumbling fan, a bass line, or
   * speech fundamentals are all louder than a distant phone speaker, but
   * they say nothing about whether a key was pressed. Real DTMF decoders
   * band-limit for the same reason.
   */
  bandHz: readonly [number, number];
}

export const DEFAULT_DTMF_OPTIONS: DtmfOptions = {
  freqTolerance: 0.02,
  minToneMs: 40,
  minGapMs: 25,
  maxTwistDb: 12,
  bandHz: [600, 1750],
};

/** Payload attached to every DTMF glyph. */
export interface DtmfPayload {
  /** Mean detected low-group frequency across the press, in Hz. */
  lowHz: number;
  /** Mean detected high-group frequency across the press, in Hz. */
  highHz: number;
  /** The nominal pair the detection matched. */
  nominalLowHz: number;
  /** The nominal pair the detection matched. */
  nominalHighHz: number;
  /** Mean level difference high−low across the press, in dB. */
  twistDb: number;
}

/** Per-frame detail carried on each match, aggregated in `finalize`. */
interface DtmfMatchDetail {
  lowHz: number;
  highHz: number;
  nominalLowHz: number;
  nominalHighHz: number;
  twistDb: number;
}

/**
 * DTMF recognizer — Sonoglyph's reference plugin.
 *
 * Per frame, `classify` looks for one peak near a low-group nominal and one
 * near a high-group nominal (a per-frame classification). Turning those
 * classifications into key presses — a key must persist for `minToneMs`,
 * a `minGapMs` gap ends the press, single flipped frames are debounced —
 * is entirely the plugin SDK's segmentation machine; this plugin is the
 * machine's reference user. `finalize` averages the detected frequencies
 * across the press into the glyph payload.
 */
export class DtmfRecognizer extends SegmentingRecognizer<DtmfMatchDetail, DtmfPayload> {
  readonly options: DtmfOptions;

  constructor(options: Partial<DtmfOptions> = {}) {
    const opts = { ...DEFAULT_DTMF_OPTIONS, ...options };
    const metadata: PluginMetadata = {
      id: 'dtmf',
      name: 'DTMF (FFT peaks)',
      version: '0.1.0',
      requiredStreams: [STREAM_PEAKS],
      description: 'Recognizes the 16 telephone keypad tones from spectral peak pairs',
    };
    super({
      metadata,
      segmentation: { minDurationMs: opts.minToneMs, minGapMs: opts.minGapMs },
      classify: (frame: FeatureFrame) => classifyPeaks((frame.data as PeaksData).peaks, opts),
      finalize: aggregatePress,
    });
    this.options = opts;
  }
}

/** Classify one frame's peaks as a DTMF pair, or null. */
function classifyPeaks(
  peaks: SpectralPeak[],
  opts: DtmfOptions,
): FrameMatch<DtmfMatchDetail> | null {
  const low = matchGroup(peaks, LOW_GROUP, opts.freqTolerance);
  const high = matchGroup(peaks, HIGH_GROUP, opts.freqTolerance);
  if (!low || !high) return null;

  const twistDb = 20 * Math.log10(high.peak.magnitude / low.peak.magnitude);
  if (Math.abs(twistDb) > opts.maxTwistDb) return null;

  // The pair must dominate the band: any in-band peak that is not one of
  // the two matched tones may not be much louder than the weaker of them.
  // Out-of-band peaks don't get a vote (see `bandHz`).
  const [bandLow, bandHigh] = opts.bandHz;
  const weaker = Math.min(low.peak.magnitude, high.peak.magnitude);
  for (const p of peaks) {
    if (p === low.peak || p === high.peak) continue;
    if (p.frequencyHz < bandLow || p.frequencyHz > bandHigh) continue;
    if (p.magnitude > 2 * weaker) return null;
  }

  const key = keyFor(low.nominal, high.nominal);
  if (!key) return null;

  return {
    symbol: key,
    // Confidence: 1 at nominal frequency, 0 at the tolerance edge.
    confidence: 1 - (low.deviation + high.deviation) / 2,
    payload: {
      lowHz: low.peak.frequencyHz,
      highHz: high.peak.frequencyHz,
      nominalLowHz: low.nominal,
      nominalHighHz: high.nominal,
      twistDb,
    },
  };
}

/**
 * Find the strongest peak within tolerance of any nominal in a group.
 * Returns the matched nominal and the deviation as a fraction of the
 * tolerance (0 = exact, 1 = at the edge).
 */
function matchGroup(
  peaks: SpectralPeak[],
  group: readonly number[],
  tolerance: number,
): { peak: SpectralPeak; nominal: number; deviation: number } | null {
  let best: { peak: SpectralPeak; nominal: number; deviation: number } | null = null;
  for (const peak of peaks) {
    for (const nominal of group) {
      const deviation = Math.abs(peak.frequencyHz - nominal) / (nominal * tolerance);
      if (deviation > 1) continue;
      if (!best || peak.magnitude > best.peak.magnitude) {
        best = { peak, nominal, deviation };
      }
    }
  }
  return best;
}

/** Average the per-frame detail into the glyph payload. */
function aggregatePress(press: Press<DtmfMatchDetail>): { payload: DtmfPayload } {
  let lowHz = 0;
  let highHz = 0;
  let twistDb = 0;
  for (const m of press.matches) {
    lowHz += m.payload!.lowHz;
    highHz += m.payload!.highHz;
    twistDb += m.payload!.twistDb;
  }
  const n = press.matches.length;
  const first = press.matches[0]!.payload!;
  return {
    payload: {
      lowHz: lowHz / n,
      highHz: highHz / n,
      nominalLowHz: first.nominalLowHz,
      nominalHighHz: first.nominalHighHz,
      twistDb: twistDb / n,
    },
  };
}
