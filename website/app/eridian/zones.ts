/**
 * The three interactive zones of the Eridian explorer — the single source of
 * truth for the hub cards, the sub-route headers, and the cross-links between
 * them. Mirrors how learn/articles.ts registers the Learn section.
 */
export interface EridianZone {
  slug: 'dictionary' | 'compose' | 'learn';
  title: string;
  /** One-line summary for the hub card and cross-links. */
  blurb: string;
  /** The imperative promise, shown under the zone's own header. */
  lede: string;
}

export const ZONES: EridianZone[] = [
  {
    slug: 'dictionary',
    title: 'Dictionary',
    blurb: 'Every word in the starter lexicon — hear its chord, see the pitches that compose it.',
    lede: 'Browse the starter lexicon. Pick a word to hear its chord and see the exact scale degrees and frequencies it is built from.',
  },
  {
    slug: 'compose',
    title: 'Composer',
    blurb: 'Build an utterance, play it aloud, and watch the real recognizer decode it back.',
    lede: 'Assemble words into an utterance, play it, and feed the audio straight back through the real Eridian pipeline — recognizer and translator — to watch it decode live.',
  },
  {
    slug: 'learn',
    title: 'Guided tour',
    blurb: 'Meet the vocabulary in teaching order, starting where Rocky did: good and bad.',
    lede: 'A short walk through the language, one idea at a time — from a single good/bad chord to a whole sentence.',
  },
];

export function getZone(slug: string): EridianZone | undefined {
  return ZONES.find((zone) => zone.slug === slug);
}
