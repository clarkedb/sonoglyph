import type {
  FeatureFrame,
  Glyph,
  PeaksData,
  PluginMetadata,
  RecognizerPlugin,
  SpectralPeak,
  Unsubscribe,
} from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import type { DtmfKey } from './frequencies.js';
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
}

export const DEFAULT_DTMF_OPTIONS: DtmfOptions = {
  freqTolerance: 0.02,
  minToneMs: 40,
  minGapMs: 25,
  maxTwistDb: 12,
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

/** What one peaks frame looks like when it contains a valid DTMF pair. */
interface FrameMatch {
  key: DtmfKey;
  lowHz: number;
  highHz: number;
  nominalLowHz: number;
  nominalHighHz: number;
  twistDb: number;
  /** 1 at exact nominal frequencies, falling to 0 at the tolerance edge. */
  confidence: number;
}

/** An in-progress key press being accumulated across frames. */
interface Tracking {
  key: DtmfKey;
  startTime: number;
  /** Analysis window length of the frames, in seconds. */
  span: number;
  frameCount: number;
  /** Frames since the key was last seen (silence or another key). */
  gapFrames: number;
  sumConfidence: number;
  sumLowHz: number;
  sumHighHz: number;
  sumTwistDb: number;
  nominalLowHz: number;
  nominalHighHz: number;
}

/**
 * DTMF recognizer — Sonoglyph's reference plugin.
 *
 * Per frame, it looks for one peak near a low-group nominal and one near a
 * high-group nominal (a per-frame classification). Across frames, a
 * debouncing state machine turns those classifications into key presses:
 * a key must persist for `minToneMs` to register, and a `minGapMs` gap must
 * separate two presses of the same key — which is how "55" becomes two
 * glyphs instead of one long one. The glyph is emitted when the press ends,
 * so its duration covers the whole press.
 */
export class DtmfRecognizer implements RecognizerPlugin {
  readonly metadata: PluginMetadata = {
    id: 'dtmf',
    name: 'DTMF (FFT peaks)',
    version: '0.1.0',
    requiredStreams: [STREAM_PEAKS],
    description: 'Recognizes the 16 telephone keypad tones from spectral peak pairs',
  };

  readonly options: DtmfOptions;
  private readonly listeners = new Set<(glyph: Glyph<DtmfPayload>) => void>();
  private tracking: Tracking | null = null;

  constructor(options: Partial<DtmfOptions> = {}) {
    this.options = { ...DEFAULT_DTMF_OPTIONS, ...options };
  }

  process(frame: FeatureFrame): void {
    if (frame.stream !== STREAM_PEAKS) return;
    const match = this.classify((frame.data as PeaksData).peaks);
    const hop = frame.hop;

    if (this.tracking && match && match.key === this.tracking.key) {
      // The press continues (a short dropout within the gap window is
      // forgiven — gapFrames just resets).
      const t = this.tracking;
      t.frameCount++;
      t.gapFrames = 0;
      t.sumConfidence += match.confidence;
      t.sumLowHz += match.lowHz;
      t.sumHighHz += match.highHz;
      t.sumTwistDb += match.twistDb;
      return;
    }

    if (this.tracking) {
      this.tracking.gapFrames++;
      const gapSec = this.tracking.gapFrames * hop;
      // A different key ends the press immediately; silence ends it after
      // the gap threshold.
      if (match || gapSec >= this.options.minGapMs / 1000) {
        this.finish(this.tracking, hop);
        this.tracking = null;
      }
    }

    if (!this.tracking && match) {
      this.tracking = {
        key: match.key,
        startTime: frame.time,
        span: frame.span,
        frameCount: 1,
        gapFrames: 0,
        sumConfidence: match.confidence,
        sumLowHz: match.lowHz,
        sumHighHz: match.highHz,
        sumTwistDb: match.twistDb,
        nominalLowHz: match.nominalLowHz,
        nominalHighHz: match.nominalHighHz,
      };
    }
  }

  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.tracking = null;
  }

  /** Classify one frame's peaks as a DTMF pair, or null. */
  private classify(peaks: SpectralPeak[]): FrameMatch | null {
    const low = this.matchGroup(peaks, LOW_GROUP);
    const high = this.matchGroup(peaks, HIGH_GROUP);
    if (!low || !high) return null;

    const twistDb = 20 * Math.log10(high.peak.magnitude / low.peak.magnitude);
    if (Math.abs(twistDb) > this.options.maxTwistDb) return null;

    // The pair must dominate the frame: any peak that is not one of the two
    // matched tones may not be much louder than the weaker of them.
    const weaker = Math.min(low.peak.magnitude, high.peak.magnitude);
    for (const p of peaks) {
      if (p === low.peak || p === high.peak) continue;
      if (p.magnitude > 2 * weaker) return null;
    }

    const key = keyFor(low.nominal, high.nominal);
    if (!key) return null;

    // Confidence: 1 at nominal frequency, 0 at the tolerance edge.
    const confidence = 1 - (low.deviation + high.deviation) / 2;

    return {
      key,
      lowHz: low.peak.frequencyHz,
      highHz: high.peak.frequencyHz,
      nominalLowHz: low.nominal,
      nominalHighHz: high.nominal,
      twistDb,
      confidence,
    };
  }

  /**
   * Find the strongest peak within tolerance of any nominal in a group.
   * Returns the matched nominal and the deviation as a fraction of the
   * tolerance (0 = exact, 1 = at the edge).
   */
  private matchGroup(
    peaks: SpectralPeak[],
    group: readonly number[],
  ): { peak: SpectralPeak; nominal: number; deviation: number } | null {
    let best: { peak: SpectralPeak; nominal: number; deviation: number } | null = null;
    for (const peak of peaks) {
      for (const nominal of group) {
        const deviation = Math.abs(peak.frequencyHz - nominal) / (nominal * this.options.freqTolerance);
        if (deviation > 1) continue;
        if (!best || peak.magnitude > best.peak.magnitude) {
          best = { peak, nominal, deviation };
        }
      }
    }
    return best;
  }

  /** Emit a glyph for a finished press, if it lasted long enough. */
  private finish(t: Tracking, hop: number): void {
    // A tone shows up in every frame whose analysis window overlaps it, so
    // the raw matched span overstates the tone by roughly half a window;
    // correct for that before judging (and reporting) the duration.
    const duration = t.frameCount * hop - t.span / 2;
    if (duration < this.options.minToneMs / 1000) return;

    const glyph: Glyph<DtmfPayload> = {
      symbol: t.key,
      pluginId: this.metadata.id,
      start: t.startTime,
      duration,
      confidence: Math.max(0, Math.min(1, t.sumConfidence / t.frameCount)),
      payload: {
        lowHz: t.sumLowHz / t.frameCount,
        highHz: t.sumHighHz / t.frameCount,
        nominalLowHz: t.nominalLowHz,
        nominalHighHz: t.nominalHighHz,
        twistDb: t.sumTwistDb / t.frameCount,
      },
    };
    for (const cb of this.listeners) cb(glyph);
  }
}
