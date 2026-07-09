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

/**
 * Payload of every Morse glyph. A glyph here is one keyed element — a dot
 * or a dash — and nothing more: assembling elements into letters and words
 * is meaning, and lives in `MorseTextTranslator`, not in the glyph stream.
 */
export interface MorseElementPayload {
  /** Element length in (estimated) timing units — ~1 for a dot, ~3 for a
   * dash. Divide `duration` by this to recover the unit length the
   * recognizer was using, which the translator needs to size the gaps
   * between elements. */
  units: number;
}

// Frozen: shared by every instance and by the inner element machine.
const METADATA: PluginMetadata = Object.freeze({
  id: 'morse',
  name: 'Morse (envelope)',
  version: '0.1.0',
  requiredStreams: Object.freeze([STREAM_ENVELOPE]) as unknown as string[],
  description: 'Decodes on/off keyed Morse from the amplitude envelope — no spectra involved',
});

/**
 * Morse recognizer — time-domain recognition off the `envelope` stream,
 * the plugin that proves feature streams aren't DTMF-shaped: it never
 * sees a spectrum, only "how loud is the signal right now".
 *
 * It emits exactly one kind of glyph: an element, "." or "-", named by its
 * duration. That is the whole job of the Glyphs stage here. The per-frame
 * judgment (`rms ≥ threshold`) and the segmentation (key-down runs, gap
 * debouncing, dot-vs-dash by duration) are the plugin-SDK machine; the
 * recognizer only adds speed adaptation, since what counts as "long" drifts
 * with the sender.
 *
 * Letters and words are NOT glyphs — a dot is a recognized signal, but an
 * "S" is three dots *interpreted*, which is meaning. That assembly lives in
 * `MorseTextTranslator` (the Meaning layer), which reads the silences
 * between these element glyphs. Keeping it out of here is what makes the
 * glyph timeline a clean stream of dots and dashes.
 */
export class MorseRecognizer implements RecognizerPlugin {
  readonly metadata = METADATA;
  readonly options: MorseOptions;

  private readonly elements: RecognizerPlugin;
  private readonly listeners = new Set<(glyph: Glyph) => void>();

  /** Current estimate of the sender's unit (dot) length, in seconds. */
  private unitSec: number;

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
      finalize: (run) => {
        const units = run.duration / this.unitSec;
        this.adapt(run.duration);
        // A dot is 1 unit, a dash 3: the boundary sits at 2.
        return {
          symbol: units < 2 ? '.' : '-',
          payload: { units },
        };
      },
    });

    // Forward every element glyph straight through — no accumulation.
    this.elements.onGlyph((glyph) => {
      for (const cb of this.listeners) cb(glyph);
    });
  }

  process(frame: FeatureFrame): void {
    if (frame.stream !== STREAM_ENVELOPE) return;
    this.elements.process(frame);
  }

  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.elements.reset();
    this.unitSec = this.options.unitMs / 1000;
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
}
