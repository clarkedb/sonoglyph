/**
 * The Eridian starter dictionary. Data lives in `data/lexicon.json` so the
 * plugin and website can both load it without pulling in TypeScript at
 * runtime; this module is the searchable layer on top — not a formal
 * database, but structured enough to become one later without changing
 * callers.
 */
import lexiconJson from './data/lexicon.json';
import type { SyllableCode } from './phonology.ts';

export type WordCategory =
  'pronoun' | 'noun' | 'adjective' | 'verb' | 'interjection' | 'particle' | 'conjunction';

export interface LexiconEntry {
  /** The word's syllables in order, e.g. ["S3", "S3"] for "human". */
  syllables: SyllableCode[];
  /** English gloss. */
  gloss: string;
  category: WordCategory;
  /** Etymology / usage notes — derivations, register conventions, etc. */
  notes?: string;
}

export interface Lexicon {
  schemaVersion: number;
  entries: LexiconEntry[];
}

/** The dictionary schema version this module was written against. Bump
 * alongside `data/lexicon.json`'s `schemaVersion` on a breaking change. */
export const LEXICON_SCHEMA_VERSION = 1;

export const LEXICON: Lexicon = lexiconJson as Lexicon;

if (LEXICON.schemaVersion !== LEXICON_SCHEMA_VERSION) {
  throw new Error(
    `lexicon.json schemaVersion ${LEXICON.schemaVersion} does not match ` +
      `LEXICON_SCHEMA_VERSION ${LEXICON_SCHEMA_VERSION}`,
  );
}

/** Canonical spelling of a word: its syllable codes joined with "-". */
export function wordOf(entry: LexiconEntry): string {
  return entry.syllables.join('-');
}

const byWordIndex = new Map<string, LexiconEntry>(LEXICON.entries.map((e) => [wordOf(e), e]));

/** Exact lookup by syllable sequence, e.g. `byWord(["S3", "S3"])` -> human. */
export function byWord(syllables: SyllableCode[]): LexiconEntry | undefined {
  return byWordIndex.get(syllables.join('-'));
}

/** Exact lookup by a single-syllable particle or content code. */
export function byCode(code: SyllableCode): LexiconEntry | undefined {
  return byWord([code]);
}

/** Every entry in a given word class. */
export function byCategory(category: WordCategory): LexiconEntry[] {
  return LEXICON.entries.filter((e) => e.category === category);
}

/**
 * Free-text search over gloss and notes (case-insensitive substring match).
 * Not a real index — the dictionary is small enough that a linear scan is
 * plenty — but it is the seam a future storage layer (IndexedDB, SQLite-WASM)
 * would sit behind without changing this function's signature.
 */
export function search(query: string): LexiconEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return LEXICON.entries.filter(
    (e) => e.gloss.toLowerCase().includes(q) || e.notes?.toLowerCase().includes(q),
  );
}
