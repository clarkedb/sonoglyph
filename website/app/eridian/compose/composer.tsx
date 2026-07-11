'use client';

import { useState } from 'react';
import type { Glyph } from '@sonoglyph/core';
import { Pipeline, TsDspEngine } from '@sonoglyph/dsp';
import {
  byWord,
  LEXICON,
  renderTokens,
  wordOf,
  type LexiconEntry,
  type Register,
  type SyllableCode,
  type WordCategory,
} from '@sonoglyph/eridian';
import {
  EridianRecognizer,
  EridianTranslator,
  type EridianChordPayload,
  type EridianTranslation,
} from '@sonoglyph/plugin-eridian';
import { FigureShell, ZoneLabel } from '../../learn/components/figure-shell';
import { Btn } from '../../learn/components/controls';
import { RegisterControl } from '../components/register-control';
import { ERIDIAN_SAMPLE_RATE, useEridianAudio, wordsToTokens } from '../lib/audio';

/* The composer — the round-trip proof. You assemble words into an utterance;
 * "play & decode" synthesizes it to audio, plays it, and pushes the very same
 * buffer through a real EridianRecognizer + EridianTranslator pipeline. The
 * decoded reading appears beside the one you intended: when they match, you
 * have watched the language go text → audio → chords → text and come back. */

/** The palette, grouped by word class in teaching order. */
const PALETTE: { label: string; category: WordCategory }[] = [
  { label: 'pronouns', category: 'pronoun' },
  { label: 'nouns', category: 'noun' },
  { label: 'adjectives', category: 'adjective' },
  { label: 'verbs', category: 'verb' },
  { label: 'interjections', category: 'interjection' },
  { label: 'conjunctions', category: 'conjunction' },
  { label: 'particles', category: 'particle' },
];

interface Preset {
  label: string;
  words: SyllableCode[][];
  register: Register;
}

const PRESETS: Preset[] = [
  { label: 'you good', words: [['S2'], ['S5']], register: 0 },
  { label: 'are you good?', words: [['S2'], ['S5'], ['Q']], register: 0 },
  { label: 'I am not good', words: [['NEG'], ['S1'], ['S5']], register: 0 },
  { label: 'I am human', words: [['S1'], ['S3', 'S3'], ['BE']], register: 0 },
  { label: 'I will hear you', words: [['S1'], ['S2'], ['S3', 'S6'], ['FUT']], register: 0 },
  { label: 'Eridian amaze!', words: [['S4', 'S4'], ['S7']], register: 2 },
];

/** The leading sense of a gloss — "good, fine, correct" → "good". */
function shortGloss(entry: LexiconEntry): string {
  return entry.gloss.split(/[,;/]/)[0]!.trim();
}

interface Decoded {
  /** The syllable codes actually composed, in order — the round-trip target. */
  composed: SyllableCode[];
  glyphs: Glyph[];
  translation: EridianTranslation;
}

export function Composer() {
  const [words, setWords] = useState<LexiconEntry[]>([byWord(['S2'])!, byWord(['S5'])!]);
  const [register, setRegister] = useState<Register>(0);
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const play = useEridianAudio();

  const intended = words.map(shortGloss).join(' ');

  function append(entry: LexiconEntry) {
    setWords((w) => [...w, entry]);
    setDecoded(null);
  }
  function removeAt(index: number) {
    setWords((w) => w.filter((_, i) => i !== index));
    setDecoded(null);
  }
  function clear() {
    setWords([]);
    setDecoded(null);
  }
  function loadPreset(preset: Preset) {
    setWords(preset.words.map((codes) => byWord(codes)!));
    setRegister(preset.register);
    setDecoded(null);
  }

  /** Synthesize, play, and round-trip the utterance through the real pipeline. */
  function playAndDecode() {
    if (words.length === 0) return;
    const tokens = wordsToTokens(words);
    const audio = renderTokens(tokens, { sampleRate: ERIDIAN_SAMPLE_RATE, register });
    play(audio);

    // A fresh pipeline per decode: each run reports clean timestamps from zero
    // and nothing carries over from the previous composition. The utterance is
    // pushed starting at sample 0 (no lead silence — a silence→chord onset
    // straddles the first analysis window and can smear the opening chord below
    // the minimum-duration threshold); flush() drains the trailing chord.
    const glyphs: Glyph[] = [];
    const translator = new EridianTranslator();
    const pipeline = new Pipeline(new TsDspEngine());
    pipeline.addPlugin(new EridianRecognizer());
    pipeline.onGlyph((glyph) => {
      glyphs.push(glyph);
      translator.push(glyph);
    });
    pipeline.push(audio);
    pipeline.flush();
    translator.flush();
    pipeline.dispose();

    setDecoded({ composed: tokens.map((t) => t.code), glyphs, translation: translator.value });
  }

  return (
    <FigureShell
      n={1}
      title="compose & round-trip"
      meta="engine: @sonoglyph/dsp · recognizer: plugin-eridian · 48 kHz"
      caption={
        <>
          (1) pick words to build an utterance — tense particles (PST/FUT) glue onto the verb before
          them, as the grammar does · (2) play &amp; decode synthesizes the chords, plays them, and
          pushes the same audio through the live recognizer and translator · (3) the decoded reading
          appears beside the one you intended. When they match, the language has gone text → audio →
          chords → text and back.
        </>
      }
    >
      {/* (1) Build */}
      <ZoneLabel n={1}>build an utterance</ZoneLabel>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="self-center font-mono text-[11px] text-ink-dim">presets:</span>
        {PRESETS.map((preset) => (
          <Btn key={preset.label} onClick={() => loadPreset(preset)}>
            {preset.label}
          </Btn>
        ))}
      </div>

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
                    onClick={() => append(entry)}
                    title={entry.gloss}
                    className="cursor-pointer rounded-sm border border-line bg-void px-2 py-1 font-mono text-[11px] text-ink transition-colors hover:border-phosphor-dim hover:text-phosphor"
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

      {/* Composition strip */}
      <div className="mt-5 rounded-sm border border-line bg-void p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-ink-dim">your utterance</p>
          {words.length > 0 && <Btn onClick={clear}>clear</Btn>}
        </div>
        {words.length === 0 ? (
          <p className="mt-2 font-mono text-[12px] text-ink-dim">
            pick words above, or load a preset, to build an utterance.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {words.map((entry, i) => (
                <button
                  key={`${wordOf(entry)}-${i}`}
                  type="button"
                  onClick={() => removeAt(i)}
                  title="remove"
                  className="glyph-glow flex items-center gap-1.5 rounded-sm border border-accent bg-accent-dim px-2 py-1 font-mono text-[13px] text-phosphor transition-transform hover:scale-[0.97]"
                >
                  <span className="font-bold">{wordOf(entry)}</span>
                  <span aria-hidden className="text-phosphor-dim">
                    ✕
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-dim">
              intended: <span className="text-ink">{intended}</span>
            </p>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <RegisterControl value={register} onChange={setRegister} />
        <Btn primary disabled={words.length === 0} onClick={playAndDecode}>
          ▶ play &amp; decode
        </Btn>
      </div>

      {/* (2)+(3) Decode */}
      <div className="mt-6">
        <ZoneLabel n={2}>live decode</ZoneLabel>
        <div className="mt-2">
          {decoded ? (
            <DecodeView decoded={decoded} />
          ) : (
            <p className="text-[12.5px] leading-normal text-faint">
              Press play &amp; decode — the recognized chords and the translator&rsquo;s reading
              land here.
            </p>
          )}
        </div>
      </div>
    </FigureShell>
  );
}

function DecodeView({ decoded }: { decoded: Decoded }) {
  const { composed, glyphs, translation } = decoded;
  // The honest round-trip test is at the chord level: did the syllables I
  // composed come back as the syllables the recognizer heard? (The gloss is a
  // downstream rendering — "?" vs "a question" — and not what we synthesized.)
  const recognized = glyphs.map((g) => g.symbol);
  const composedStr = composed.join(' ');
  const recognizedStr = recognized.join(' ');
  const match = composedStr === recognizedStr;

  return (
    <div className="space-y-4">
      {/* Recognized chord glyphs */}
      <div>
        <p className="font-mono text-[11px] text-ink-dim">recognized chords</p>
        {glyphs.length === 0 ? (
          <p className="mt-1 font-mono text-[12px] text-ink-dim">no chords detected.</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {glyphs.map((glyph, i) => {
              const payload = glyph.payload as EridianChordPayload;
              return (
                <span
                  key={i}
                  title={`${(glyph.confidence * 100).toFixed(0)}% confidence · register ${
                    payload.register >= 0 ? '+' : ''
                  }${payload.register}`}
                  className="glyph-glow flex flex-col items-center rounded-sm border border-accent bg-accent-dim px-2 py-1 leading-none"
                >
                  <span className="text-[15px] font-bold text-phosphor">{glyph.symbol}</span>
                  <span className="mt-1 font-mono text-[9px] text-phosphor-dim">
                    {payload.content ? 'triad' : 'dyad'}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* The translator's reading */}
      {translation.utterances.map((utterance, u) => (
        <div key={u} className="rounded-sm border border-line bg-void p-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {utterance.words.map((word, w) => (
              <span
                key={w}
                className={`font-mono text-[12px] ${word.entry ? 'text-ink' : 'text-danger'}`}
              >
                {word.gloss}
                {word.tense ? ` [${word.tense}]` : ''}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-phosphor">&ldquo;{utterance.gloss}&rdquo;</p>
          <p className="mt-1.5 font-mono text-[11px] text-ink-dim">
            {utterance.parsed
              ? 'parsed as a well-formed sentence'
              : 'literal gloss (not a full sentence)'}{' '}
            · register {utterance.register >= 0 ? '+' : ''}
            {utterance.register} — {utterance.affect}
          </p>
        </div>
      ))}

      {/* Round-trip verdict — chord level */}
      <p
        className={`font-mono text-[12px] ${match ? 'text-phosphor' : 'text-ink-dim'}`}
        aria-live="polite"
      >
        {match
          ? `✓ round-trip clean — every chord came back: ${composedStr}`
          : `composed ${composedStr} · recognized ${recognizedStr} — the pipeline reports what it hears.`}
      </p>
    </div>
  );
}
