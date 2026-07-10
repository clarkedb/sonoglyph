/**
 * Eridian grammar: fixed word order plus a handful of particles — just
 * enough structure that a sequence of chords is *parseable* into meaning,
 * not merely a lookup table of isolated words. See docs/eridian.md#grammar
 * for the rationale.
 *
 * Sentence order is fixed Subject–Object–Verb:
 *
 *   [NEG] Subject (Object) Predicate[-Tense] [Q]
 *
 * - `NEG` and `Q` are independent words (their own gap-separated slot).
 * - A tense marker is not independent: it is one more syllable appended to
 *   the predicate's own word, the "syllable added to the verb" pattern
 *   Mandarin uses for aspect instead of conjugation.
 * - Adjectives and verbs need no copula ("you good" = "you are good").
 *   `BE` fills the predicate slot only for noun-to-noun identity statements
 *   ("me human BE" = "I am human").
 * - A bare single word — most famously `Q` alone, "Question?" — is a
 *   complete utterance in its own right; see `parseTokens`.
 */
import { byWord, type LexiconEntry } from './lexicon.ts';
import type { SyllableCode } from './phonology.ts';

export type Tense = 'past' | 'future';

const TENSE_CODE: Record<Tense, SyllableCode> = { past: 'PST', future: 'FUT' };
const CODE_TENSE: Partial<Record<SyllableCode, Tense>> = { PST: 'past', FUT: 'future' };

export interface Sentence {
  negated?: boolean;
  subject: LexiconEntry;
  /** The direct object (transitive verbs) or the complement noun of a `BE`
   * identity statement — the same Subject-Object-Verb slot either way. */
  object?: LexiconEntry;
  /** A verb, an adjective (used predicatively, no copula needed), or the
   * `BE` particle for a noun-to-noun identity statement. */
  predicate: LexiconEntry;
  /** Only meaningful when `predicate` is a verb. */
  tense?: Tense;
  question?: boolean;
}

/** A parsed utterance: a full sentence, or a single word spoken alone
 * (e.g. bare "Question?", or a one-word exclamation like "amaze"). */
export type Utterance =
  { kind: 'sentence'; sentence: Sentence } | { kind: 'word'; entry: LexiconEntry };

/** One chord in the rendered stream, with the silence that follows it. */
export interface SyllableToken {
  code: SyllableCode;
  /** 'syllable': another syllable of the same word follows (small gap).
   * 'word': a new word follows (larger gap). 'final': nothing follows. */
  boundary: 'syllable' | 'word' | 'final';
}

function tokensForWord(codes: SyllableCode[]): SyllableToken[] {
  return codes.map((code, i) => ({
    code,
    boundary: i < codes.length - 1 ? 'syllable' : 'word',
  }));
}

function finalize(tokens: SyllableToken[]): SyllableToken[] {
  if (tokens.length === 0) return tokens;
  return [...tokens.slice(0, -1), { ...tokens[tokens.length - 1]!, boundary: 'final' }];
}

/** Flatten a sentence into its ordered, gap-annotated chord sequence. */
export function sentenceToTokens(sentence: Sentence): SyllableToken[] {
  const words: SyllableToken[][] = [];
  if (sentence.negated) words.push(tokensForWord(['NEG']));
  words.push(tokensForWord(sentence.subject.syllables));
  if (sentence.object) words.push(tokensForWord(sentence.object.syllables));
  const predicateCodes = sentence.tense
    ? [...sentence.predicate.syllables, TENSE_CODE[sentence.tense]]
    : sentence.predicate.syllables;
  words.push(tokensForWord(predicateCodes));
  if (sentence.question) words.push(tokensForWord(['Q']));
  return finalize(words.flat());
}

/** Flatten a single word (or bare utterance) into a gap-annotated chord sequence. */
export function wordToTokens(entry: LexiconEntry): SyllableToken[] {
  return finalize(tokensForWord(entry.syllables));
}

/** Flatten any utterance — sentence or bare word — into a chord sequence. */
export function utteranceToTokens(utterance: Utterance): SyllableToken[] {
  return utterance.kind === 'sentence'
    ? sentenceToTokens(utterance.sentence)
    : wordToTokens(utterance.entry);
}

/** Group tokens back into words, splitting at every 'word'/'final' boundary. */
function groupWords(tokens: SyllableToken[]): SyllableCode[][] {
  const words: SyllableCode[][] = [];
  let current: SyllableCode[] = [];
  for (const token of tokens) {
    current.push(token.code);
    if (token.boundary !== 'syllable') {
      words.push(current);
      current = [];
    }
  }
  return words;
}

/**
 * Recover the utterance a chord sequence encodes — the round trip that
 * proves this is a grammar and not just a word list. Throws if a word
 * doesn't match any lexicon entry.
 */
export function parseTokens(tokens: SyllableToken[]): Utterance {
  const words = groupWords(tokens);

  let question = false;
  if (
    words.length > 0 &&
    words[words.length - 1]!.length === 1 &&
    words[words.length - 1]![0] === 'Q'
  ) {
    question = true;
    words.pop();
  }

  let negated = false;
  if (words.length > 0 && words[0]!.length === 1 && words[0]![0] === 'NEG') {
    negated = true;
    words.shift();
  }

  if (words.length === 0) {
    // The whole utterance was just NEG and/or Q — Q alone is "Question?".
    return { kind: 'word', entry: lookupWord(['Q']) };
  }

  if (words.length === 1 && !negated && !question) {
    return { kind: 'word', entry: lookupWord(words[0]!) };
  }

  const predicateWord = words[words.length - 1]!;
  let predicateCodes = predicateWord;
  let tense: Tense | undefined;
  const trailing = predicateWord[predicateWord.length - 1]!;
  if (predicateWord.length > 1 && CODE_TENSE[trailing]) {
    tense = CODE_TENSE[trailing];
    predicateCodes = predicateWord.slice(0, -1);
  }
  const predicate = lookupWord(predicateCodes);

  const contentWords = words.slice(0, -1);
  if (contentWords.length < 1 || contentWords.length > 2) {
    throw new Error(`Not a well-formed sentence: ${words.length + 1} word(s)`);
  }
  const subject = lookupWord(contentWords[0]!);
  const object = contentWords[1] ? lookupWord(contentWords[1]) : undefined;

  const sentence: Sentence = {
    subject,
    predicate,
    ...(object ? { object } : {}),
    ...(tense ? { tense } : {}),
    ...(negated ? { negated } : {}),
    ...(question ? { question } : {}),
  };
  return { kind: 'sentence', sentence };
}

function lookupWord(codes: SyllableCode[]): LexiconEntry {
  const entry = byWord(codes);
  if (!entry) throw new Error(`Unknown word: ${codes.join('-')}`);
  return entry;
}
