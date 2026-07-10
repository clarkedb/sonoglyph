# Eridian

Eridian is the constructed chord-language spoken by Rocky in Andy Weir's
_Project Hail Mary_: an alien who communicates in musical chords rather
than phonemes drawn from a single stream of pitch, and whose species
lacks the human concept of individual musical notes at all — only chords
exist. This document defines a deterministic, learnable version of that
idea: a phonology (what counts as a valid "sound"), a starter lexicon, a
minimal grammar, and the synthesis rules that turn text in the language
into audio.

It is the spec `@sonoglyph/eridian` implements — every rule below has an
executable counterpart in that package, and the package's tests are this
document's correctness check. It is **not** a complete language.
Linguistic completeness is an explicit non-goal (see
[roadmap.md](./roadmap.md#beyond)); the target is _learnable and
demoable_ — enough vocabulary and structure to hold a short conversation,
render it to audio, and eventually (a later milestone item) recognize it
back.

## Phonology

### Syllables are chords

A **syllable** in Eridian is not one frequency — it's a set of two or
three concurrent pure tones. This is the one hard constraint the language
is built around: _every syllable's frequencies must fall within a single
octave_ (the highest note is never more than 11 semitones above the
lowest). Two things follow from that constraint:

- A syllable is voiced **within** an octave, so a listener (human or
  machine) never has to guess which octave a note "belongs to" — the
  whole chord is one unit, heard together.
- **Octave register is left over as its own, orthogonal channel of
  meaning.** Once a syllable's internal shape is pinned to one octave,
  transposing the _whole_ syllable up or down an octave changes nothing
  about which chord it is — only where it sits. That's exactly the free
  parameter register semantics (below) use.

All notes are drawn from one seven-degree major scale, tonic **A3 (220
Hz)** at the neutral register:

| Scale degree           | 1 (tonic) |         2 |         3 |         4 |         5 |         6 | 7 (leading tone) |
| ---------------------- | --------: | --------: | --------: | --------: | --------: | --------: | ---------------: |
| Semitones from tonic   |         0 |         2 |         4 |         5 |         7 |         9 |               11 |
| Frequency (register 0) | 220.00 Hz | 246.94 Hz | 277.18 Hz | 293.66 Hz | 329.63 Hz | 369.99 Hz |        415.30 Hz |

A major scale (rather than the full 12-tone chromatic set) was chosen the
same way DTMF chose its two four-tone groups: for separation a recognizer
can trust. Adjacent scale degrees sit 6–12% apart in frequency (a semitone
to a whole tone) — comparable to DTMF's low-group spacing — while a full
chromatic scale would pack every gap down near that 6% floor for no
vocabulary benefit a plugin could use yet. Synthesis uses pure sine tones (see [Synthesis](#synthesis)), so
integer-ratio harmonics never contaminate a chord the way they would from a
struck or sung fundamental — a deliberate simplification that keeps this
phase's chord math clean; a future acoustic-instrument-timbre synthesis
mode would have to account for it.

### Chord inventory

Two chord shapes exist, and the shape itself is the first thing a listener
learns to key off of — chord size marks word class before a single scale
degree is identified, the same "distinguishable by construction" idea
behind DTMF separating its digit tones from its control tones:

- **Content words — triads.** Three notes: a scale degree stacked with
  the next two thirds above it (`{d, d+2, d+4}` in scale-degree steps).
  Every triad's span is at most 7 semitones (a fifth) — well under an
  octave — so the octave constraint is automatic, not something each word
  has to be checked against. There are exactly seven, one per scale
  degree, named `S1`–`S7`.
- **Grammar particles — dyads.** Two notes: a hand-picked pair of scale
  degrees, one pair per particle. Six exist today (`Q`, `NEG`, `BE`,
  `PST`, `FUT`, `AND`); the space is nowhere near exhausted (21 possible
  dyads total).

| Code                  | Notes (scale degrees)      | Frequencies (register 0)  |
| --------------------- | -------------------------- | ------------------------- |
| `S1`                  | 1, 3, 5                    | 220.00, 277.18, 329.63 Hz |
| `S2`                  | 2, 4, 6                    | 246.94, 293.66, 369.99 Hz |
| `S3`                  | 3, 5, 7                    | 277.18, 329.63, 415.30 Hz |
| `S4`                  | 4, 6, 8 (= 1 + octave)     | 293.66, 369.99, 440.00 Hz |
| `S5`                  | 5, 7, 9 (= 2 + octave)     | 329.63, 415.30, 493.88 Hz |
| `S6`                  | 6, 8, 10 (= 1, 3 + octave) | 369.99, 440.00, 554.37 Hz |
| `S7`                  | 7, 9, 11 (= 2, 4 + octave) | 415.30, 493.88, 587.33 Hz |
| `Q` (question)        | 1, 5                       | 220.00, 329.63 Hz         |
| `NEG` (not)           | 1, 4                       | 220.00, 293.66 Hz         |
| `BE` (copula)         | 2, 6                       | 246.94, 369.99 Hz         |
| `PST` (past suffix)   | 1, 2                       | 220.00, 246.94 Hz         |
| `FUT` (future suffix) | 1, 7                       | 220.00, 415.30 Hz         |
| `AND` (conjunction)   | 2, 4                       | 246.94, 293.66 Hz         |

(`packages/eridian/src/phonology.ts` computes these; the table is the
frozen register-0 reference, not a second source of truth.)

### Register: octave = emotion

A whole word — or a whole utterance — can be transposed by whole octaves
without changing _which_ word it is. That transposition is the language's
entire prosodic/emotional channel, deliberately kept separate from lexical
identity the way pitch contour, not word choice, carries tone of voice in
human speech:

| Register | Reading                                      |
| :------: | -------------------------------------------- |
|    −2    | grief / dread (extreme negative)             |
|    −1    | solemn / sad / serious (negative, subdued)   |
|    0     | neutral / matter-of-fact                     |
|    +1    | excited / eager / alarmed (positive, urgent) |
|    +2    | elated / awed (extreme positive)             |

`amaze` (`S7`) is the word most likely to be spoken outside register 0 —
Rocky's book-famous exclamation reads as excitement precisely because it's
shouted an octave up, not because the word itself changes.

### Timing

| Interval                               | Duration |
| -------------------------------------- | -------- |
| One syllable (chord)                   | 200 ms   |
| Gap between syllables of the same word | 60 ms    |
| Gap between words                      | 300 ms   |

No recognizer exists yet (see [Beyond](./roadmap.md#beyond)), but the
numbers above are chosen with one in mind: Eridian's scale-degree spacing
within a register is tighter than DTMF's absolute-Hz gaps, so a future
decoder needs a longer minimum chord duration than DTMF's ~40 ms to trust a
detection — 120 ms is `phonology.ts`'s `MIN_CHORD_DURATION_SEC`, the same
window-size-vs-frequency-resolution tradeoff `architecture.md` calls out
for DTMF, just with less headroom to spend.

## Lexicon

The dictionary is a flat, versioned JSON file
(`packages/eridian/src/data/lexicon.json`) — not a database, but shaped
like one on purpose, so a real storage layer (IndexedDB, SQLite-WASM) can
sit behind the exact same lookup functions later without callers changing:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "syllables": ["S3", "S3"],
      "gloss": "human, a person of Earth",
      "category": "noun",
      "notes": "…"
    }
  ]
}
```

`packages/eridian/src/lexicon.ts` loads it and exposes the searchable
layer: `byWord` (exact syllable sequence), `byCode` (single-syllable
lookup), `byCategory`, and a free-text `search` over glosses and notes.

### Starter vocabulary

| Word                       | Syllables | Gloss                              |
| -------------------------- | --------- | ---------------------------------- |
| me / I                     | `S1`      | first person pronoun               |
| you                        | `S2`      | second person pronoun              |
| _(earthkind, bound root)_  | `S3`      | earthly, human in nature           |
| **human**                  | `S3-S3`   | a person of Earth                  |
| _(nativekind, bound root)_ | `S4`      | native, Eridian in nature          |
| **Eridian**                | `S4-S4`   | a native of this world             |
| **good**                   | `S5`      | good, fine, correct                |
| **bad**                    | `S6`      | bad, wrong, broken                 |
| **amaze**                  | `S7`      | amazing! / to amaze                |
| friend                     | `S1-S2`   | friend, ally (me + you)            |
| hear                       | `S3-S6`   | to hear, to listen                 |
| go                         | `S4-S5`   | to go, to move                     |
| want                       | `S4-S6`   | to want, to need                   |
| yes                        | `S5-S1`   | yes, affirmed                      |
| no                         | `S6-S1`   | no, negative reply                 |
| **question**               | `Q`       | a question / "Question?"           |
| not                        | `NEG`     | negates the predicate that follows |
| is / am / are              | `BE`      | copula, identity statements only   |
| _-ed_                      | `PST`     | past tense suffix                  |
| _will-_                    | `FUT`     | future tense suffix                |
| and                        | `AND`     | conjunction                        |

Two derivational patterns keep the seven triads from being 21 unrelated
one-shot words:

- **Reduplication nominalizes a property root**: a bare root (`S3`,
  `S4`) describes a quality; doubled, it names "a being characterized by
  that quality" — `S3` "earthly" → `S3-S3` "human"; `S4` "native" →
  `S4-S4` "Eridian". The pattern is open — a future word for any other
  species follows the same shape.
- **Antonym pairs sit one scale degree apart**: `good` (`S5`) and `bad`
  (`S6`) differ by exactly one triad, a small, deliberate mnemonic rather
  than a grammatical rule.
- **Compounding**: `friend` (`S1-S2`) is literally "me" + "you" back to
  back — the simplest possible derivation, kept to a couple of examples
  rather than a productive rule, since the vocabulary is a starter set.

## Grammar

Word order is fixed **Subject–Object–Verb**, with two independent particle
slots and one suffix slot:

```
[NEG] Subject (Object) Predicate[-Tense] [Q]
```

- `NEG` and `Q` are ordinary words in the sequence — negation opens the
  sentence, the question marker closes it (the sentence-final position
  Mandarin's `吗 ma` occupies).
- A tense marker is **not** independent — Mandarin marks aspect with a
  particle glued straight onto the verb instead of conjugating it, and
  Eridian does the same: `PST`/`FUT` is one more syllable of the
  predicate's own word, not a new word. Unmarked = present/timeless; no
  other conjugation exists.
- Adjectives and verbs need no copula — `you good` already means "you are
  good," an adjective standing directly as the predicate. `BE` exists only
  for noun-to-noun identity statements, where nothing else says the two
  nouns are equated: `me human BE` = "I am human."
- A single word spoken alone is a complete utterance in its own right —
  most notably `Q` by itself, "Question?", exactly how Rocky uses it in
  the book.

`packages/eridian/src/grammar.ts` implements this as a small typed AST
(`Sentence`) plus two directions: `sentenceToTokens` flattens a sentence
into its ordered, gap-annotated chord sequence, and `parseTokens` reverses
that — the round trip that proves the language is _parseable_, not just a
word list with a fixed order glued on.

### Examples

| Eridian                  | Literal            | English                   |
| ------------------------ | ------------------ | ------------------------- |
| `S2 S5`                  | you good           | "You are good."           |
| `S2 S5 Q`                | you good [?]       | "Are you good?"           |
| `NEG S1 S5`              | not me good        | "I am not good."          |
| `S1 S3-S3 BE`            | me human [is]      | "I am human."             |
| `S1 S2 S3-S6 FUT`        | me you hear[-will] | "I will hear you."        |
| `Q`                      | [?]                | "Question?"               |
| `S4-S4 S7` (register +1) | Eridian amaze      | "The Eridian is amazing!" |

## Synthesis

`packages/eridian/src/synth.ts` renders any of the above straight to
`Float32Array` PCM — pure functions on `@sonoglyph/dsp`'s existing signal
generators (`tones`, `silence`, `concat`), the same helpers the DSP
engine's own tests use to synthesize DTMF and Morse signals. Nothing here
needs a recording: a chord is `tones()` summing its notes at equal
amplitude (`1 / noteCount`, so a chord never clips regardless of size), a
gap is `silence()`, and a word or sentence is those pieces `concat()`ed in
the order `grammar.ts` produces.

```ts
import { renderSentence } from '@sonoglyph/eridian';
import { byWord } from '@sonoglyph/eridian';

const you = byWord(['S2'])!;
const good = byWord(['S5'])!;
const audio = renderSentence({ subject: you, predicate: good }, { sampleRate: 48_000 });
// audio is a Float32Array: "You are good.", ready to play or feed back
// through the DSP pipeline for testing.
```

Passing `{ register: 1 }` transposes the whole utterance up an octave —
the same excited/urgent reading `S7` conventionally carries — without
touching which words were spoken.

## Package layout

```
packages/eridian/
├── src/
│   ├── phonology.ts   # chords, registers, timing — the physics
│   ├── lexicon.ts      # searchable dictionary, backed by data/lexicon.json
│   ├── data/
│   │   └── lexicon.json
│   ├── grammar.ts      # Sentence AST, tokenize, parse
│   ├── synth.ts         # text -> Float32Array audio
│   └── index.ts         # public exports
```

`@sonoglyph/eridian` depends only on `@sonoglyph/dsp` (for the tone
generators) — it has no opinion about recognition, storage, or UI. Those
are separate, later items under the [Hail Mary
milestone](https://github.com/clarkedb/sonoglyph/milestone/5): a
recognizer plugin (`plugins/eridian`, consuming the `peaks` stream the way
DTMF does, but matching chords instead of tone pairs), a teaching mode, and
persistent dictionary storage. This document and package are the spec
those build against, not a preview of them.
