import type { Register, SyllableCode } from '@sonoglyph/eridian';

/**
 * The guided tour's content — a deliberate teaching sequence through the
 * starter language, one idea per stop, starting where Rocky starts in the
 * book: good and bad. Data only; learn/guided-tour.tsx renders it, resolving
 * every code against the shared lexicon so a typo here fails loudly.
 */

export interface TourExample {
  /** The utterance, as ordered words (each an array of syllable codes). */
  words: SyllableCode[][];
  literal: string;
  english: string;
}

export interface TourStep {
  title: string;
  /** Body paragraphs, in the manual's plain voice. */
  body: string[];
  /** Words introduced at this stop, shown with a pitch diagram and a play button. */
  words: SyllableCode[][];
  /** A sentence that uses the new words, playable in full. */
  example?: TourExample;
  /** Register the stop is voiced in — 0 everywhere except the emotion stop. */
  register?: Register;
}

export const TOUR: TourStep[] = [
  {
    title: 'Two chords, one apart',
    body: [
      'Every sound in Eridian is a chord, not a single note. A content word is a triad — three pure tones struck together — and the shape of that chord is the word.',
      'The first two words to learn are good and bad. They sit one scale degree apart, the smallest possible move: a language where the difference between right and wrong is a single step up the scale. Play them back to back and listen for it.',
    ],
    words: [['S5'], ['S6']],
  },
  {
    title: 'You and me',
    body: [
      'Pronouns are triads too — one chord each. And Eridian needs no verb "to be" for a quality: you good already means "you are good", the adjective standing on its own as the predicate.',
      'Word order is fixed Subject–Object–Verb, so a whole first sentence is just two chords in a row.',
    ],
    words: [['S1'], ['S2']],
    example: { words: [['S2'], ['S5']], literal: 'you good', english: 'You are good.' },
  },
  {
    title: 'Ask a question',
    body: [
      'Grammar particles are dyads — two notes, not three — so your ear knows it is hearing structure, not a content word, before it even identifies the chord. It is the same trick DTMF uses to keep its control tones apart from its digits.',
      'The question particle Q closes a sentence to turn it into a question — and spoken entirely alone, it simply means "Question?", exactly how Rocky uses it.',
    ],
    words: [['Q']],
    example: { words: [['S2'], ['S5'], ['Q']], literal: 'you good [?]', english: 'Are you good?' },
  },
  {
    title: 'Say no',
    body: [
      'Negation is another dyad, NEG, and it opens the sentence — the mirror of Q, which closes it.',
    ],
    words: [['NEG']],
    example: {
      words: [['NEG'], ['S1'], ['S5']],
      literal: 'not me good',
      english: 'I am not good.',
    },
  },
  {
    title: 'Build a noun',
    body: [
      'The seven triads are not seven unrelated words. Double a quality root and it names a being that has that quality: S3 "earthly" reduplicated becomes S3-S3, "human". The same rule turns S4 "native" into S4-S4, "Eridian".',
      'To equate two nouns — "I am human" — you do need the copula BE, the one place a verb "to be" appears. Notice the word is two chords, spoken close together with only a short gap.',
    ],
    words: [['S3'], ['S3', 'S3']],
    example: {
      words: [['S1'], ['S3', 'S3'], ['BE']],
      literal: 'me human [is]',
      english: 'I am human.',
    },
  },
  {
    title: 'Verbs and time',
    body: [
      'Verbs are multi-chord words as well: hear is S3-S6. Eridian never conjugates — instead a tense marker glues straight onto the verb as one more syllable, the way Mandarin marks aspect with a particle. FUT makes it future.',
      'Listen for the tense chord riding on the end of the verb with no gap before it, while the words around it stay a beat apart.',
    ],
    words: [['S3', 'S6'], ['FUT']],
    example: {
      words: [['S1'], ['S2'], ['S3', 'S6'], ['FUT']],
      literal: 'me you hear[-will]',
      english: 'I will hear you.',
    },
  },
  {
    title: 'Octave as emotion',
    body: [
      'One channel is left. Transpose a whole word or sentence up or down by octaves and it is still the same word — only where it sits changes. That spare octave is the language’s entire emotional register: down for grief, up for excitement.',
      'amaze (S7) is the word most often shouted an octave or two up. Here it is at register +2 — elated, awed — the book’s most famous exclamation.',
    ],
    words: [['S7']],
    register: 2,
    example: {
      words: [['S4', 'S4'], ['S7']],
      literal: 'Eridian amaze',
      english: 'The Eridian is amazing!',
    },
  },
];
