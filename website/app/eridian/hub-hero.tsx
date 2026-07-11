'use client';

import type { SyllableCode } from '@sonoglyph/eridian';
import { FigureShell, ZoneLabel } from '../learn/components/figure-shell';
import { Btn } from '../learn/components/controls';
import { ChordDiagram } from './components/chord-diagram';
import { chordAudio, entriesFromCodes, useEridianAudio, wordsAudio } from './lib/audio';

/* The hub's live moment: press play and a real Eridian sentence sounds — the
 * same synthesis the recognizer decodes, so the first thing a visitor does is
 * hear the language, not read about it. */

const GREETING: SyllableCode[][] = [['S2'], ['S5']]; // "you good" → "You are good."
const GREETING_SYLLABLES: SyllableCode[] = ['S2', 'S5'];

export function HubHero() {
  const play = useEridianAudio();

  return (
    <FigureShell
      n={1}
      title="first contact"
      meta="synth: @sonoglyph/eridian · pure tones · 48 kHz"
      caption={
        <>
          A whole sentence in two chords: <span className="text-ink">S2</span> (you) then{' '}
          <span className="text-ink">S5</span> (good) — no copula needed. Press play, then click
          either column to hear that chord alone.
        </>
      }
    >
      <ZoneLabel n={1}>&ldquo;you are good&rdquo;</ZoneLabel>
      <div className="mt-3">
        <ChordDiagram
          syllables={GREETING_SYLLABLES}
          register={0}
          onPlaySyllable={(code) => play(chordAudio(code, 0))}
          ariaLabel="Chord diagram for the sentence you good"
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Btn primary onClick={() => play(wordsAudio(entriesFromCodes(GREETING), 0))}>
          ▶ hear it
        </Btn>
        <span className="font-mono text-[11px] text-ink-dim">
          S2 S5 — &ldquo;You are good.&rdquo;
        </span>
      </div>
    </FigureShell>
  );
}
