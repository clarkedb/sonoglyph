/**
 * The Eridian translator — the Meaning layer's first structural resident.
 *
 * Where the Morse translator groups elements into letters by the silence
 * between them, this does the same one level up: chord glyphs in, and the
 * silences between them say whether the next syllable continues the current
 * word (a short intra-word gap), starts a new word (a longer inter-word
 * gap), or ends the utterance entirely (a longer pause still, or the stream
 * flushing). See docs/eridian.md#timing for the gaps it reads.
 *
 * Grouped words are looked up in the shared `@sonoglyph/eridian` lexicon and
 * the whole utterance is handed to the language's own `parseTokens` grammar.
 * This is the first translator that exercises the Meaning layer with real
 * structure: exact dictionary lookup, tense-suffix stripping, graceful
 * handling of words that aren't in the dictionary, and the octave register
 * read back as the utterance's emotional affect.
 */
import type { Glyph, Translator, Unsubscribe } from '@sonoglyph/core';
import {
  byWord,
  parseTokens,
  REGISTER_AFFECT,
  type LexiconEntry,
  type Register,
  type Sentence,
  type SyllableCode,
  type SyllableToken,
  type Tense,
  type Utterance,
} from '@sonoglyph/eridian';
import type { EridianChordPayload } from './eridian.ts';

/** The tense suffixes, so a word breakdown can strip them the way the grammar
 * does (`grammar.ts` keeps the canonical mapping private). */
const TENSE_OF: Partial<Record<SyllableCode, Tense>> = { PST: 'past', FUT: 'future' };

/** One word of an utterance, resolved against the dictionary — the "why did
 * it read that" view, and the seam a teaching mode later writes through. */
export interface EridianWord {
  /** The syllable codes grouped into this word, e.g. ["S3", "S3"]. */
  syllables: SyllableCode[];
  /** The dictionary entry, or null when the word isn't in the lexicon. */
  entry: LexiconEntry | null;
  /** A tense suffix stripped off before lookup, if any (verbs only). */
  tense?: Tense;
  /** Short English gloss, or "?" for an unknown word. */
  gloss: string;
}

/** One decoded utterance: a sentence, a lone word, or an unparseable run. */
export interface EridianUtterance {
  /** The raw syllable sequence, gap-annotated — the recognizer's output as
   * this translator grouped it. */
  tokens: SyllableToken[];
  /** Per-word dictionary breakdown, always present and best-effort. */
  words: EridianWord[];
  /** A literal English gloss of the whole utterance. */
  gloss: string;
  /** The grammar parse, when the utterance is well-formed and fully known;
   * null when a word is unknown or the structure isn't a valid sentence. */
  parsed: Utterance | null;
  /** The octave register the utterance was voiced in (majority vote), and
   * its conventional affect (docs/eridian.md#register). */
  register: Register;
  affect: string;
  /** True if any word wasn't in the dictionary. */
  hasUnknown: boolean;
}

/** The running translation: every utterance decoded so far. */
export interface EridianTranslation {
  utterances: EridianUtterance[];
  /** The utterances' glosses joined with " | " — the running conversation. */
  text: string;
}

export interface EridianTranslatorOptions {
  /** A gap up to this long (seconds) continues the current word; longer
   * starts a new word. Sits between the 60 ms intra-word and 300 ms
   * inter-word gaps the language voices. */
  wordGapSec: number;
  /** A gap this long (seconds) or longer ends the utterance, over and above
   * a word boundary. Comfortably above the 300 ms inter-word gap. */
  utteranceGapSec: number;
}

export const DEFAULT_ERIDIAN_TRANSLATOR_OPTIONS: EridianTranslatorOptions = {
  wordGapSec: 0.15,
  utteranceGapSec: 0.6,
};

const EMPTY: EridianTranslation = { utterances: [], text: '' };

interface PendingSyllable {
  code: SyllableCode;
  register: Register;
}

export class EridianTranslator implements Translator<EridianTranslation> {
  readonly id = 'eridian-text';

  private readonly options: EridianTranslatorOptions;
  private readonly listeners = new Set<(meaning: EridianTranslation) => void>();

  /** Completed utterances. */
  private done: EridianUtterance[] = [];
  /** Syllables of the utterance currently accumulating. */
  private pending: PendingSyllable[] = [];
  /** Boundary that followed each pending syllable except the last — 'syllable'
   * within a word, 'word' between words. Length is `pending.length - 1`. */
  private boundaries: ('syllable' | 'word')[] = [];
  /** Stream time the last chord ended; null before the first / after a break. */
  private lastEnd: number | null = null;

  constructor(options: Partial<EridianTranslatorOptions> = {}) {
    this.options = { ...DEFAULT_ERIDIAN_TRANSLATOR_OPTIONS, ...options };
  }

  push(glyph: Glyph): void {
    if (glyph.pluginId !== 'eridian') return;
    const payload = glyph.payload as EridianChordPayload | undefined;
    if (!payload) return;

    if (this.lastEnd !== null) {
      const gap = glyph.start - this.lastEnd;
      if (gap >= this.options.utteranceGapSec) {
        // A long pause closes the utterance; this chord opens the next.
        this.closeUtterance();
      } else {
        this.boundaries.push(gap < this.options.wordGapSec ? 'syllable' : 'word');
      }
    }

    this.pending.push({ code: payload.code, register: payload.register });
    this.lastEnd = glyph.start + glyph.duration;
    this.notify();
  }

  /**
   * End of stream: close the utterance still accumulating (nothing further
   * will arrive to prove its final gap) and break continuity, so a later
   * chord starts a fresh utterance rather than fusing across the pause.
   */
  flush(): void {
    this.closeUtterance();
    this.lastEnd = null;
    this.notify();
  }

  onMeaning(cb: (meaning: EridianTranslation) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.done = [];
    this.pending = [];
    this.boundaries = [];
    this.lastEnd = null;
    this.notify();
  }

  /** The translation so far, including the in-progress utterance. */
  get value(): EridianTranslation {
    const utterances =
      this.pending.length > 0
        ? [...this.done, buildUtterance(this.pending, this.boundaries)]
        : this.done;
    if (utterances.length === 0) return EMPTY;
    return { utterances, text: utterances.map((u) => u.gloss).join(' | ') };
  }

  private closeUtterance(): void {
    if (this.pending.length === 0) return;
    this.done = [...this.done, buildUtterance(this.pending, this.boundaries)];
    this.pending = [];
    this.boundaries = [];
  }

  private notify(): void {
    const meaning = this.value;
    for (const cb of this.listeners) cb(meaning);
  }
}

/** Turn an accumulated utterance into its decoded form. */
function buildUtterance(
  pending: readonly PendingSyllable[],
  boundaries: readonly ('syllable' | 'word')[],
): EridianUtterance {
  const tokens: SyllableToken[] = pending.map((syl, i) => ({
    code: syl.code,
    boundary: i < pending.length - 1 ? boundaries[i]! : 'final',
  }));

  const words = groupWords(tokens).map(lookupWord);
  const hasUnknown = words.some((w) => w.entry === null);
  const register = majorityRegister(pending);

  // The grammar parse is the structured reading; it throws on any unknown
  // word or malformed sentence, in which case we keep the per-word gloss.
  let parsed: Utterance | null;
  try {
    parsed = parseTokens(tokens);
  } catch {
    parsed = null;
  }

  const gloss = parsed ? describe(parsed) : words.map((w) => w.gloss).join(' ');

  return { tokens, words, gloss, parsed, register, affect: REGISTER_AFFECT[register], hasUnknown };
}

/** Split a token stream into words at every word/final boundary. */
function groupWords(tokens: readonly SyllableToken[]): SyllableCode[][] {
  const words: SyllableCode[][] = [];
  let current: SyllableCode[] = [];
  for (const token of tokens) {
    current.push(token.code);
    if (token.boundary !== 'syllable') {
      words.push(current);
      current = [];
    }
  }
  if (current.length > 0) words.push(current);
  return words;
}

/** Resolve one word against the dictionary, stripping a trailing tense
 * suffix the way the grammar does so "hear-will" still finds "hear". */
function lookupWord(syllables: SyllableCode[]): EridianWord {
  let entry = byWord(syllables);
  let tense: Tense | undefined;
  if (!entry && syllables.length > 1) {
    const last = syllables[syllables.length - 1]!;
    const maybeTense = TENSE_OF[last];
    if (maybeTense) {
      const base = byWord(syllables.slice(0, -1));
      if (base) {
        entry = base;
        tense = maybeTense;
      }
    }
  }
  return {
    syllables,
    entry: entry ?? null,
    ...(tense ? { tense } : {}),
    gloss: entry ? shortGloss(entry) : '?',
  };
}

/** The leading sense of a gloss — "good, fine, correct" -> "good". */
function shortGloss(entry: LexiconEntry): string {
  return entry.gloss.split(/[,;/]/)[0]!.trim();
}

/** A literal, deterministic English gloss of a parsed utterance. */
function describe(utterance: Utterance): string {
  if (utterance.kind === 'word') return shortGloss(utterance.entry);
  return describeSentence(utterance.sentence);
}

function describeSentence(sentence: Sentence): string {
  const parts: string[] = [];
  if (sentence.negated) parts.push('not');
  parts.push(shortGloss(sentence.subject));
  if (sentence.object) parts.push(shortGloss(sentence.object));
  parts.push(shortGloss(sentence.predicate));
  if (sentence.tense) parts.push(`[${sentence.tense}]`);
  let text = parts.join(' ');
  if (sentence.question) text += '?';
  return text;
}

function majorityRegister(pending: readonly PendingSyllable[]): Register {
  const counts = new Map<Register, number>();
  for (const syl of pending) counts.set(syl.register, (counts.get(syl.register) ?? 0) + 1);
  let winner: Register = pending[0]!.register;
  let most = 0;
  for (const [register, count] of counts) {
    if (count > most) {
      most = count;
      winner = register;
    }
  }
  return winner;
}
