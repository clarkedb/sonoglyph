/**
 * The Eridian recognizer — polyphonic recognition of the chord-language
 * Rocky speaks in *Project Hail Mary*.
 *
 * It is the DTMF plugin's structure applied to a harder signal. Per frame,
 * `classify` matches the spectrum's peaks to one syllable *and* the register
 * it was voiced in (`chords.ts`); the plugin SDK's segmentation machine
 * turns those per-frame judgments into one glyph per chord — a machine "run"
 * IS one sounded syllable here, exactly as it is one key press for DTMF.
 * `finalize` averages the detected pitches across the run and reports the
 * register on the glyph payload.
 *
 * What makes it more than DTMF-with-more-tones is the timing. Eridian voices
 * syllables 60 ms apart *within* a word and 300 ms apart *between* words
 * (docs/eridian.md#timing); the recognizer only has to segment the
 * syllables — grouping them into words and sentences is the translator's job
 * (`translator.ts`). Splitting same-syllable repeats like `S3-S3` ("human")
 * therefore hinges on the inter-syllable gap out-lasting the analysis
 * window's smear: see `minGapMs`.
 */
import type { FeatureFrame, PeaksData, PluginMetadata } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import { MIN_CHORD_DURATION_SEC, type Register, type SyllableCode } from '@sonoglyph/eridian';
import type { FrameMatch, Run } from '@sonoglyph/plugin-sdk';
import { SegmentingRecognizer } from '@sonoglyph/plugin-sdk';
import {
  ALL_REGISTERS,
  DEFAULT_CHORD_MATCH_OPTIONS,
  matchChord,
  type ChordMatchOptions,
} from './chords.ts';

export interface EridianOptions {
  /** See {@link ChordMatchOptions.freqTolerance}. */
  freqTolerance: number;
  /** See {@link ChordMatchOptions.bandHz}. */
  bandHz: readonly [number, number];
  /** See {@link ChordMatchOptions.dominanceRatio}. */
  dominanceRatio: number;
  /** Octave registers to search for (the emotion channel). */
  registers: readonly Register[];
  /**
   * A chord must persist at least this long to count as a syllable. The
   * language's own `MIN_CHORD_DURATION_SEC` (120 ms) is the default: Eridian's
   * scale-degree spacing is tighter than DTMF's tone groups, so a detection
   * needs a longer minimum than DTMF's ~40 ms to be trusted.
   */
  minChordMs: number;
  /**
   * Silence (or a different syllable) this long ends the current chord.
   *
   * This is the delicate knob. Consecutive syllables of one word are only
   * 60 ms apart, and the analysis window smears each chord's apparent span
   * by roughly half a window on each side (~21 ms at the 2048-sample
   * default), eating into that gap from both ends. The default of 20 ms is
   * small enough that the ~2 fully-silent frames a 60 ms gap still leaves
   * end the run — so `S3-S3` becomes two glyphs, not one — while a solid,
   * un-interrupted chord never produces two silent frames back to back. A
   * larger analysis window narrows this margin; that is the
   * window-size-vs-time-resolution tradeoff, live.
   */
  minGapMs: number;
}

export const DEFAULT_ERIDIAN_OPTIONS: EridianOptions = {
  freqTolerance: DEFAULT_CHORD_MATCH_OPTIONS.freqTolerance,
  bandHz: DEFAULT_CHORD_MATCH_OPTIONS.bandHz,
  dominanceRatio: DEFAULT_CHORD_MATCH_OPTIONS.dominanceRatio,
  registers: ALL_REGISTERS,
  minChordMs: MIN_CHORD_DURATION_SEC * 1000,
  minGapMs: 20,
};

/** Payload attached to every Eridian chord glyph. */
export interface EridianChordPayload {
  /** The syllable code, e.g. "S3" or "Q" (mirrors the glyph's `symbol`). */
  code: SyllableCode;
  /** The octave register the chord was voiced in — the emotion channel. */
  register: Register;
  /** True for a content-word triad, false for a grammar-particle dyad. */
  content: boolean;
  /** Mean detected note frequencies across the run, in nominal order, Hz. */
  detectedHz: number[];
  /** Nominal note frequencies for `code` at `register`, in order, Hz. */
  nominalHz: number[];
}

/** Per-frame detail carried on each match, aggregated in `finalize`. */
interface EridianMatchDetail {
  code: SyllableCode;
  register: Register;
  content: boolean;
  detectedHz: number[];
  nominalHz: number[];
}

/**
 * Eridian chord recognizer. Consumes the `peaks` stream — the same
 * FFT-derived stream DTMF uses — because the language is synthesized from
 * pure sine tones, so its chords show up as clean, unambiguous peaks with no
 * harmonic clutter to fold away. (A `chroma` stream, floated in the roadmap,
 * would actively *lose* the octave register the payload reports.)
 */
export class EridianRecognizer extends SegmentingRecognizer<
  EridianMatchDetail,
  EridianChordPayload
> {
  readonly options: EridianOptions;

  constructor(options: Partial<EridianOptions> = {}) {
    const opts = { ...DEFAULT_ERIDIAN_OPTIONS, ...options };
    const metadata: PluginMetadata = {
      id: 'eridian',
      name: 'Eridian (chord-language)',
      version: '0.1.0',
      requiredStreams: [STREAM_PEAKS],
      description:
        'Recognizes the Project Hail Mary chord-language: 2- and 3-note chords as syllable glyphs',
    };
    const matchOptions: ChordMatchOptions = {
      freqTolerance: opts.freqTolerance,
      bandHz: opts.bandHz,
      dominanceRatio: opts.dominanceRatio,
      registers: opts.registers,
    };
    super({
      metadata,
      segmentation: { minDurationMs: opts.minChordMs, minGapMs: opts.minGapMs },
      classify: (frame: FeatureFrame) =>
        classifyPeaks((frame.data as PeaksData).peaks, matchOptions),
      finalize: aggregateRun,
    });
    this.options = opts;
  }
}

/** Classify one frame's peaks as an Eridian syllable, or null. */
function classifyPeaks(
  peaks: PeaksData['peaks'],
  options: ChordMatchOptions,
): FrameMatch<EridianMatchDetail> | null {
  const match = matchChord(peaks, options);
  if (!match) return null;
  return {
    symbol: match.code,
    // 1 at nominal frequencies, 0 with every note at the tolerance edge.
    confidence: 1 - match.deviation,
    payload: {
      code: match.code,
      register: match.register,
      content: match.content,
      detectedHz: match.detectedHz,
      nominalHz: match.nominalHz,
    },
  };
}

/** Average the per-frame detail into the glyph payload. Register is taken by
 * majority vote across the run — noise can flip a single frame to a
 * neighboring octave, but the sustained chord decides. */
function aggregateRun(run: Run<EridianMatchDetail>): { payload: EridianChordPayload } {
  const first = run.matches[0]!.payload!;
  const noteCount = first.detectedHz.length;

  const register = majorityRegister(run.matches);
  // Average only the frames voiced in the winning register, so a stray
  // octave flip doesn't drag the reported pitches between octaves.
  const inRegister = run.matches.filter((m) => m.payload!.register === register);
  const detectedHz = new Array<number>(noteCount).fill(0);
  for (const m of inRegister) {
    for (let i = 0; i < noteCount; i++) detectedHz[i]! += m.payload!.detectedHz[i]!;
  }
  for (let i = 0; i < noteCount; i++) detectedHz[i]! /= inRegister.length;

  const nominalHz = inRegister[0]!.payload!.nominalHz;
  return {
    payload: { code: first.code, register, content: first.content, detectedHz, nominalHz },
  };
}

function majorityRegister(matches: readonly FrameMatch<EridianMatchDetail>[]): Register {
  const counts = new Map<Register, number>();
  for (const m of matches) {
    const r = m.payload!.register;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let winner: Register = matches[0]!.payload!.register;
  let most = 0;
  for (const [register, count] of counts) {
    if (count > most) {
      most = count;
      winner = register;
    }
  }
  return winner;
}
