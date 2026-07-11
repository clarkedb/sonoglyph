'use client';

import { useState } from 'react';
import { wordOf, type SyllableCode } from '@sonoglyph/eridian';
import { FigureShell } from '../../learn/components/figure-shell';
import { Btn } from '../../learn/components/controls';
import { ChordDiagram } from '../components/chord-diagram';
import { CategoryBadge } from '../components/word-card';
import { chordAudio, entriesFromCodes, useEridianAudio, wordAudio, wordsAudio } from '../lib/audio';
import { TOUR, type TourStep } from './tour';

/* The guided tour: a stepped walk through the language, one idea per stop.
 * Nothing is saved — it is a linear reader, not a graded course — but every
 * word and every example sentence is playable, synthesized the same way the
 * recognizer decodes it. */

export function GuidedTour() {
  const [index, setIndex] = useState(0);
  const step = TOUR[index]!;
  const atStart = index === 0;
  const atEnd = index === TOUR.length - 1;

  return (
    <FigureShell
      n={1}
      title="guided tour"
      meta={`stop ${index + 1} / ${TOUR.length}`}
      caption={
        <>
          A linear walk through the starter language. Each stop introduces a word or two — play the
          chords, then hear them in a full sentence. Nothing here is saved; wander freely, or jump
          into the{' '}
          <a
            href="/eridian/dictionary"
            className="text-phosphor underline decoration-line underline-offset-4 hover:decoration-phosphor"
          >
            dictionary
          </a>{' '}
          and{' '}
          <a
            href="/eridian/compose"
            className="text-phosphor underline decoration-line underline-offset-4 hover:decoration-phosphor"
          >
            composer
          </a>
          .
        </>
      }
    >
      {/* Progress dots */}
      <div className="flex items-center gap-1.5" aria-hidden>
        {TOUR.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= index ? 'bg-phosphor-dim' : 'bg-line'
            }`}
          />
        ))}
      </div>

      <StepView step={step} />

      <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
        <Btn disabled={atStart} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          ← back
        </Btn>
        <span className="font-mono text-[11px] text-ink-dim">{step.title.toLowerCase()}</span>
        {atEnd ? (
          <Btn primary onClick={() => setIndex(0)}>
            start over
          </Btn>
        ) : (
          <Btn primary onClick={() => setIndex((i) => Math.min(TOUR.length - 1, i + 1))}>
            next →
          </Btn>
        )}
      </div>
    </FigureShell>
  );
}

function StepView({ step }: { step: TourStep }) {
  const play = useEridianAudio();
  const register = step.register ?? 0;
  const featured = entriesFromCodes(step.words);

  return (
    <div className="mt-6">
      <h2 className="font-display text-2xl font-semibold tracking-wide text-ink uppercase">
        {step.title}
      </h2>
      {step.body.map((paragraph, i) => (
        <p key={i} className="mt-3 max-w-[64ch] leading-relaxed text-ink-dim">
          {paragraph}
        </p>
      ))}

      {/* The words introduced here */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {featured.map((entry) => (
          <div key={wordOf(entry)} className="rounded-sm border border-line bg-void p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-base font-semibold tracking-wide text-phosphor">
                {wordOf(entry)}
              </span>
              <CategoryBadge category={entry.category} />
            </div>
            <p className="mt-1 text-sm text-ink-dim">{entry.gloss}</p>
            <div className="mt-3">
              <ChordDiagram
                syllables={entry.syllables as SyllableCode[]}
                register={register}
                onPlaySyllable={(code) => play(chordAudio(code, register))}
                ariaLabel={`Chord for ${wordOf(entry)}`}
              />
            </div>
            <div className="mt-2">
              <Btn onClick={() => play(wordAudio(entry, register))}>▶ hear {wordOf(entry)}</Btn>
            </div>
          </div>
        ))}
      </div>

      {/* The example sentence */}
      {step.example && (
        <div className="mt-4 rounded-sm border border-phosphor-dim/50 bg-phosphor/5 p-3">
          <p className="font-mono text-[11px] text-ink-dim">try it in a sentence</p>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="font-mono text-sm text-ink">
                {step.example.words.map((w) => w.join('-')).join(' ')}
              </p>
              <p className="mt-0.5 text-sm text-ink-dim">
                <span className="font-mono text-[12px]">{step.example.literal}</span> —{' '}
                <span className="text-phosphor">&ldquo;{step.example.english}&rdquo;</span>
              </p>
            </div>
            <Btn
              primary
              onClick={() => play(wordsAudio(entriesFromCodes(step.example!.words), register))}
            >
              ▶ play sentence
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
