'use client';

import { useMemo, useState } from 'react';
import {
  chordFor,
  LEXICON,
  search,
  wordOf,
  type LexiconEntry,
  type Register,
  type SyllableCode,
  type WordCategory,
} from '@sonoglyph/eridian';
import { FigureShell, ZoneLabel } from '../../learn/components/figure-shell';
import { Btn } from '../../learn/components/controls';
import { ChordDiagram } from '../components/chord-diagram';
import { CategoryBadge, WordCard } from '../components/word-card';
import { RegisterControl } from '../components/register-control';
import { chordAudio, useEridianAudio, wordAudio } from '../lib/audio';

/* The dictionary browser: search or scan the starter lexicon by word class,
 * pick an entry, and it sounds its chord and breaks down the exact pitches it
 * is built from — the "see a word, hear its chord, see the notes" loop. */

/** Word classes in teaching order, with the headings the grid groups under. */
const CATEGORY_ORDER: { category: WordCategory; label: string }[] = [
  { category: 'pronoun', label: 'pronouns' },
  { category: 'noun', label: 'nouns' },
  { category: 'adjective', label: 'adjectives' },
  { category: 'verb', label: 'verbs' },
  { category: 'interjection', label: 'interjections' },
  { category: 'conjunction', label: 'conjunctions' },
  { category: 'particle', label: 'grammar particles' },
];

export function DictionaryExplorer() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LexiconEntry>(LEXICON.entries[6]!); // "good" (S5)
  const [register, setRegister] = useState<Register>(0);
  const play = useEridianAudio();

  const matches = useMemo(() => {
    const entries = query.trim() === '' ? LEXICON.entries : search(query);
    return CATEGORY_ORDER.map(({ category, label }) => ({
      label,
      entries: entries.filter((e) => e.category === category),
    })).filter((group) => group.entries.length > 0);
  }, [query]);

  function select(entry: LexiconEntry) {
    setSelected(entry);
    play(wordAudio(entry, register));
  }

  const notesHz = selected.syllables.flatMap((code) => chordFor(code, register).notesHz);

  return (
    <FigureShell
      n={1}
      title="lexicon browser"
      meta="lexicon: @sonoglyph/eridian · synth: pure tones"
      caption={
        <>
          (1) search or scan the starter dictionary by word class · (2) the selected word&rsquo;s
          chord — each syllable is a column of notes on a log-frequency ladder; click a column to
          hear just that chord · (3) octave register is the emotion channel, orthogonal to which
          word this is. Reduplicated roots (S3-S3 &ldquo;human&rdquo;) and compounds (S1-S2
          &ldquo;friend&rdquo;) show as two columns.
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* (1) The lexicon */}
        <div className="min-w-0">
          <ZoneLabel n={1}>lexicon</ZoneLabel>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search glosses & notes…"
            aria-label="Search the Eridian lexicon"
            className="mt-2 w-full rounded-sm border border-line bg-void px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-ink-dim"
          />
          <div className="mt-3 max-h-[26rem] space-y-4 overflow-y-auto pr-1">
            {matches.length === 0 && (
              <p className="font-mono text-[12px] text-ink-dim">
                no words match &ldquo;{query}&rdquo;.
              </p>
            )}
            {matches.map((group) => (
              <div key={group.label}>
                <p className="font-mono text-[10px] tracking-widest text-ink-dim uppercase">
                  {group.label}
                </p>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                  {group.entries.map((entry) => (
                    <WordCard
                      key={wordOf(entry)}
                      entry={entry}
                      selected={wordOf(entry) === wordOf(selected)}
                      onSelect={() => select(entry)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* (2)+(3) The selected word */}
        <div className="min-w-0">
          <ZoneLabel n={2}>selected word</ZoneLabel>
          <div className="mt-2 rounded-sm border border-line bg-void p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xl font-semibold tracking-wide text-phosphor">
                {wordOf(selected)}
              </span>
              <CategoryBadge category={selected.category} />
            </div>
            <p className="mt-1.5 text-ink">{selected.gloss}</p>
            {selected.notes && (
              <p className="mt-2 border-l-2 border-phosphor-dim pl-2.5 text-[13px] leading-relaxed text-ink-dim">
                {selected.notes}
              </p>
            )}

            <div className="mt-4">
              <ChordDiagram
                syllables={selected.syllables as SyllableCode[]}
                register={register}
                onPlaySyllable={(code) => play(chordAudio(code, register))}
                ariaLabel={`Chord for ${wordOf(selected)}`}
              />
            </div>

            <p className="mt-1 font-mono text-[11px] text-ink-dim">
              {notesHz.map((hz) => `${hz.toFixed(1)}`).join(' · ')} Hz
            </p>

            <div className="mt-4 flex items-end justify-between gap-4">
              <RegisterControl value={register} onChange={setRegister} />
              <Btn primary onClick={() => play(wordAudio(selected, register))}>
                ▶ play
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </FigureShell>
  );
}
