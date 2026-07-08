import type {
  EnvelopeData,
  FeatureFrame,
  Glyph,
  PluginMetadata,
  RecognizerPlugin,
  Unsubscribe,
} from '@sonoglyph/core';
import { STREAM_ENVELOPE } from '@sonoglyph/core';
import { defineRecognizer } from '@sonoglyph/plugin-sdk';
import { charFor } from './code.js';

export interface MorseOptions {
  /**
   * RMS level at/above which the key is considered down. The envelope
   * stream is broadband energy, so this is the plugin's noise knob: it
   * must sit above the room and below the tone.
   */
  onThreshold: number;
  /**
   * Expected dot length in milliseconds (~60 ms at 20 WPM, ~80 ms at
   * 15 WPM). This seeds the timing estimate; with `adaptive` on, the
   * recognizer then tracks the sender's actual speed.
   */
  unitMs: number;
  /** Track the sender's unit length from observed elements. */
  adaptive: boolean;
}

export const DEFAULT_MORSE_OPTIONS: MorseOptions = {
  onThreshold: 0.05,
  unitMs: 80,
  adaptive: true,
};

/** Payload of element glyphs ("." and "-"). */
export interface MorseElementPayload {
  /** Element length in (estimated) timing units. */
  units: number;
}

/** Payload of letter glyphs ("A", "7", "?" for unknown codes). */
export interface MorseLetterPayload {
  /** The dot/dash sequence the letter was decoded from. */
  code: string;
  /**
   * Silence before this letter, in timing units — ~3 between letters,
   * ~7 between words. Translators read word boundaries from this.
   */
  gapUnits: number;
}

const METADATA: PluginMetadata = {
  id: 'morse',
  name: 'Morse (envelope)',
  version: '0.1.0',
  requiredStreams: [STREAM_ENVELOPE],
  description: 'Decodes on/off keyed Morse from the amplitude envelope — no spectra involved',
};

/**
 * Morse recognizer — time-domain recognition off the `envelope` stream,
 * the plugin that proves feature streams aren't DTMF-shaped: it never
 * sees a spectrum, only "how loud is the signal right now".
 *
 * Two layers of glyphs come out. Elements ("." / "-") are the plugin-SDK
 * segmentation machine wearing a different classifier: `rms ≥ threshold`
 * is the whole per-frame judgment, and `finalize` names the press by its
 * duration. Letters ("K", "7", "?" when the code is unknown) are
 * aggregated here on top: a gap of ~3 units closes the letter — which is
 * why this is the segmentation stress test; in Morse the *silences* carry
 * as much structure as the tones.
 */
export class MorseRecognizer implements RecognizerPlugin {
  readonly metadata = METADATA;
  readonly options: MorseOptions;

  private readonly elements: RecognizerPlugin;
  private readonly listeners = new Set<(glyph: Glyph) => void>();

  /** Current estimate of the sender's unit (dot) length, in seconds. */
  private unitSec: number;
  /** Elements of the letter being accumulated. */
  private pendingCode = '';
  private letterStart = 0;
  private sumConfidence = 0;
  /** Stream time when the last element ended. */
  private lastElementEnd = 0;
  /** Stream time of the last frame with the key audibly down. Element
   * glyphs only emit after their trailing gap, so this is what stops a
   * letter from closing while its next element is still sounding. */
  private lastKeyDown = 0;
  /** Stream time when the previous letter ended (for gap payloads). */
  private prevLetterEnd: number | null = null;

  constructor(options: Partial<MorseOptions> = {}) {
    this.options = { ...DEFAULT_MORSE_OPTIONS, ...options };
    this.unitSec = this.options.unitMs / 1000;

    this.elements = defineRecognizer<unknown, MorseElementPayload>({
      metadata: METADATA,
      segmentation: {
        // A dot must persist for ~0.4 unit; silence of ~0.4 unit ends
        // the key-down (the true intra-letter gap is a full unit, so
        // this splits elements without splitting dots). Note the
        // envelope smears every edge by the analysis window: at speeds
        // where the 1-unit gap approaches the window length, gaps stop
        // being visible at all — pick a smaller engine window before
        // blaming the keying.
        minDurationMs: 0.4 * this.options.unitMs,
        minGapMs: 0.4 * this.options.unitMs,
      },
      classify: (frame: FeatureFrame) => {
        const { rms } = frame.data as EnvelopeData;
        if (rms < this.options.onThreshold) return null;
        return { symbol: 'key', confidence: Math.min(1, rms / (2 * this.options.onThreshold)) };
      },
      finalize: (press) => {
        const units = press.duration / this.unitSec;
        this.adapt(press.duration);
        // A dot is 1 unit, a dash 3: the boundary sits at 2.
        return {
          symbol: units < 2 ? '.' : '-',
          payload: { units },
        };
      },
    });

    this.elements.onGlyph((glyph) => {
      if (this.pendingCode === '') {
        this.letterStart = glyph.start;
        this.sumConfidence = 0;
      }
      this.pendingCode += glyph.symbol;
      this.sumConfidence += glyph.confidence;
      this.lastElementEnd = glyph.start + glyph.duration;
      this.emit(glyph);
    });
  }

  process(frame: FeatureFrame): void {
    if (frame.stream !== STREAM_ENVELOPE) return;
    this.elements.process(frame);
    if ((frame.data as EnvelopeData).rms >= this.options.onThreshold) {
      this.lastKeyDown = frame.time;
    }
    // A letter closes when the silence since its last element clearly
    // exceeds the 1-unit intra-letter gap (the true letter gap is 3).
    const lastSound = Math.max(this.lastElementEnd, this.lastKeyDown);
    if (this.pendingCode !== '' && frame.time - lastSound >= 2 * this.unitSec) {
      this.closeLetter();
    }
  }

  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.elements.reset();
    this.pendingCode = '';
    this.lastElementEnd = 0;
    this.lastKeyDown = 0;
    this.prevLetterEnd = null;
    this.unitSec = this.options.unitMs / 1000;
  }

  private closeLetter(): void {
    const code = this.pendingCode;
    const gapUnits =
      this.prevLetterEnd === null
        ? Number.POSITIVE_INFINITY
        : (this.letterStart - this.prevLetterEnd) / this.unitSec;
    const glyph: Glyph<MorseLetterPayload> = {
      // "?" keeps unknown codes visible instead of silently dropped —
      // mis-keyed letters are where decoding gets interesting.
      symbol: charFor(code) ?? '?',
      pluginId: this.metadata.id,
      start: this.letterStart,
      duration: this.lastElementEnd - this.letterStart,
      confidence: this.sumConfidence / code.length,
      payload: { code, gapUnits },
    };
    this.prevLetterEnd = this.lastElementEnd;
    this.pendingCode = '';
    this.emit(glyph);
  }

  /**
   * Follow the sender's speed: a short element is a dot (1 unit), a long
   * one a dash (3 units); either way it votes for what one unit is, and
   * the estimate eases a quarter of the way toward each vote.
   */
  private adapt(durationSec: number): void {
    if (!this.options.adaptive) return;
    const vote = durationSec < 2 * this.unitSec ? durationSec : durationSec / 3;
    const eased = this.unitSec + 0.25 * (vote - this.unitSec);
    // Never drift beyond half/double the configured unit: a run of noise
    // must not retune the clock so far that real keying stops parsing.
    const seed = this.options.unitMs / 1000;
    this.unitSec = Math.min(2 * seed, Math.max(0.5 * seed, eased));
  }

  private emit(glyph: Glyph): void {
    for (const cb of this.listeners) cb(glyph);
  }
}
