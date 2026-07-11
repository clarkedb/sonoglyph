'use client';

import { useState } from 'react';
import {
  LEXICON,
  wordOf,
  type LexiconEntry,
  type Register,
  type SyllableCode,
  type WordCategory,
} from '@sonoglyph/eridian';
import { RegisterControl } from '../components/register-control';
import { ShareButton } from '../components/share';
import { entriesFromCodes, useEridianAudio, wordsAudio } from '../lib/audio';

/*
 * The Rocky transmitter — a phone-first "speaker" you hold up to the
 * translator console's microphone. It only emits: tap a phrase (or build one)
 * and it plays the chords aloud, no decoding here. The console across the room
 * does the listening. This is the acoustic Play-Rocky path, the way the
 * phone-dialer demo works for DTMF.
 */

interface Preset {
  label: string;
  words: SyllableCode[][];
}

const PRESETS: Preset[] = [
  { label: 'you good', words: [['S2'], ['S5']] },
  { label: 'are you good?', words: [['S2'], ['S5'], ['Q']] },
  { label: 'I am not good', words: [['NEG'], ['S1'], ['S5']] },
  { label: 'I am human', words: [['S1'], ['S3', 'S3'], ['BE']] },
  { label: 'I will hear you', words: [['S1'], ['S2'], ['S3', 'S6'], ['FUT']] },
  { label: 'Eridian amaze!', words: [['S4', 'S4'], ['S7']] },
];

/** The custom-builder palette, grouped by word class in teaching order. */
const PALETTE: { label: string; category: WordCategory }[] = [
  { label: 'pronouns', category: 'pronoun' },
  { label: 'nouns', category: 'noun' },
  { label: 'adjectives', category: 'adjective' },
  { label: 'verbs', category: 'verb' },
  { label: 'interjections', category: 'interjection' },
  { label: 'conjunctions', category: 'conjunction' },
  { label: 'particles', category: 'particle' },
];

/** The leading sense of a gloss — "good, fine, correct" → "good". */
function shortGloss(entry: LexiconEntry): string {
  return entry.gloss.split(/[,;/]/)[0]!.trim();
}

export function RockyTransmitter() {
  const [register, setRegister] = useState<Register>(0);
  const [words, setWords] = useState<LexiconEntry[]>([]);
  const play = useEridianAudio();

  function speak(entries: LexiconEntry[]) {
    if (entries.length > 0) play(wordsAudio(entries, register));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Register — the tone of voice for everything sent */}
      <RegisterControl value={register} onChange={setRegister} />

      {/* Presets — the fast path: one tap, one phrase, played aloud */}
      <div>
        <p className="font-mono text-[11px] tracking-wide text-ink-dim">
          <span className="text-phosphor-dim">tap to transmit</span> — hold the phone near the
          console’s mic
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => speak(entriesFromCodes(preset.words))}
              className="glyph-glow cursor-pointer rounded-sm border border-accent bg-accent-dim px-3 py-3 text-center font-mono text-sm text-phosphor transition-transform active:scale-[0.97]"
            >
              ▶ {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Build your own */}
      <details className="rounded-sm border border-line bg-panel/50 px-3 py-2.5">
        <summary className="cursor-pointer font-mono text-[12px] text-ink-dim">
          Build your own phrase
        </summary>

        <div className="mt-3 space-y-3">
          {PALETTE.map(({ label, category }) => {
            const entries = LEXICON.entries.filter((e) => e.category === category);
            if (entries.length === 0) return null;
            return (
              <div key={label}>
                <p className="font-mono text-[10px] tracking-widest text-ink-dim uppercase">
                  {label}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {entries.map((entry) => (
                    <button
                      key={wordOf(entry)}
                      type="button"
                      onClick={() => setWords((w) => [...w, entry])}
                      title={entry.gloss}
                      className="cursor-pointer rounded-sm border border-line bg-void px-2 py-1.5 font-mono text-[12px] text-ink transition-colors hover:border-phosphor-dim hover:text-phosphor"
                    >
                      <span className="font-semibold">{wordOf(entry)}</span>{' '}
                      <span className="text-ink-dim">{shortGloss(entry)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* The assembled utterance */}
        <div className="mt-4 rounded-sm border border-line bg-void p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-ink-dim">your phrase</p>
            {words.length > 0 && (
              <button
                type="button"
                onClick={() => setWords([])}
                className="cursor-pointer font-mono text-[11px] text-ink-dim hover:text-ink"
              >
                clear
              </button>
            )}
          </div>
          {words.length === 0 ? (
            <p className="mt-2 font-mono text-[12px] text-ink-dim">
              Tap words above to build a phrase.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {words.map((entry, i) => (
                <button
                  key={`${wordOf(entry)}-${i}`}
                  type="button"
                  onClick={() => setWords((w) => w.filter((_, j) => j !== i))}
                  title="remove"
                  className="flex items-center gap-1.5 rounded-sm border border-line bg-panel px-2 py-1 font-mono text-[12px] text-ink hover:border-phosphor-dim"
                >
                  <span className="font-semibold">{wordOf(entry)}</span>
                  <span aria-hidden className="text-ink-dim">
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={words.length === 0}
          onClick={() => speak(words)}
          className="mt-3 w-full cursor-pointer rounded-sm border border-phosphor-dim py-2.5 text-center font-display text-sm font-semibold tracking-wide text-phosphor uppercase transition-colors hover:border-phosphor disabled:cursor-default disabled:opacity-50"
        >
          ▶ Transmit phrase
        </button>
      </details>

      {/* Pass it on */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <ShareButton
          path="/eridian/transmitter"
          title="Rocky transmitter"
          label="Share this transmitter"
        />
        <p className="font-mono text-[11px] text-ink-dim">hand it to someone else to be Rocky</p>
      </div>
    </div>
  );
}
