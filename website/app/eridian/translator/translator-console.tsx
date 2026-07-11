'use client';

import { SpectrumView, WaveformView } from '@sonoglyph/react';
import type { Register, SyllableCode } from '@sonoglyph/eridian';
import type { EridianChordPayload, EridianUtterance } from '@sonoglyph/plugin-eridian';
import { FigureShell, ZoneLabel } from '../../learn/components/figure-shell';
import { Btn, Select } from '../../learn/components/controls';
import { useTranslatorEngine, WINDOW_SIZES, type TranslatorStatus } from './translator-engine';

/* Grace's translator console — the live instrument. Arm the microphone and
 * speak Eridian at it (or press a phrase to hear one), and watch it flow
 * through the same recognizer + translator the composer proves offline: chord
 * glyphs light up as syllables sound, and the reading resolves as words
 * complete. Every panel is the real pipeline, not a mockup. */

interface Preset {
  label: string;
  words: SyllableCode[][];
  register: Register;
}

/** The same phrases the composer voices — Rocky's opening vocabulary. */
const PRESETS: Preset[] = [
  { label: 'you good', words: [['S2'], ['S5']], register: 0 },
  { label: 'are you good?', words: [['S2'], ['S5'], ['Q']], register: 0 },
  { label: 'I am not good', words: [['NEG'], ['S1'], ['S5']], register: 0 },
  { label: 'I am human', words: [['S1'], ['S3', 'S3'], ['BE']], register: 0 },
  { label: 'I will hear you', words: [['S1'], ['S2'], ['S3', 'S6'], ['FUT']], register: 0 },
  { label: 'Eridian amaze!', words: [['S4', 'S4'], ['S7']], register: 2 },
];

const STATUS_LABEL: Record<TranslatorStatus, string> = {
  idle: 'standby',
  starting: 'starting…',
  listening: 'listening',
  playing: 'decoding',
  error: 'error',
};

export function TranslatorConsole() {
  const engine = useTranslatorEngine();
  const { status, errorMessage, glyphs, translation, sampleRate, windowSize } = engine;
  const listening = status === 'listening';
  const busy = status === 'starting' || status === 'playing';
  const live = listening || status === 'starting';

  return (
    <FigureShell
      n={1}
      title="translator console"
      meta="engine: @sonoglyph/dsp · recognizer: plugin-eridian · live mic"
      caption={
        <>
          (1) arm the microphone and speak Eridian at it — or press a phrase to hear one · (2) the
          waveform and spectrum show what the pipeline hears · (3) each sounded chord resolves to a
          glyph · (4) syllables group into words and the reading lands in the log. It is the real
          recognition pipeline end to end — the same one the composer round-trips.
        </>
      }
    >
      {/* (1) Transport + status */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (listening ? void engine.disarm() : void engine.arm())}
            disabled={status === 'starting'}
            aria-pressed={live}
            className={`cursor-pointer rounded-sm border px-4 py-2 font-display text-sm font-semibold tracking-wide uppercase transition-colors disabled:cursor-default disabled:opacity-60 ${
              live
                ? 'border-phosphor bg-phosphor/10 text-phosphor'
                : 'border-phosphor-dim text-phosphor hover:border-phosphor'
            }`}
          >
            {status === 'starting'
              ? 'Starting…'
              : listening
                ? '● Stop listening'
                : 'Arm microphone'}
          </button>
          <StatusLamp status={status} />
        </div>
        <Select
          label="resolution (window)"
          value={String(windowSize)}
          onChange={(v) => engine.setWindowSize(Number(v))}
          options={WINDOW_SIZES.map((size) => ({
            value: String(size),
            label: `${size} · ${(sampleRate / size).toFixed(0)} Hz/bin`,
          }))}
        />
      </div>

      {errorMessage && (
        <p className="mt-3 rounded-sm border border-danger/40 bg-danger/5 px-3 py-2 font-mono text-[12px] text-danger">
          {errorMessage.includes('Permission') || errorMessage.toLowerCase().includes('denied')
            ? 'Microphone access was blocked. Allow it in your browser and try again — or press a phrase below to decode without a mic.'
            : errorMessage}
        </p>
      )}

      {/* (2) The readouts — what the pipeline hears */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <ZoneLabel n={2}>waveform</ZoneLabel>
          <div className="mt-1.5">
            <WaveformView
              read={() => engine.sampleHistory.peekLatest(Math.floor(engine.sampleRate * 0.5))}
              ariaLabel="Live waveform of what the microphone hears, most recent half second."
            />
          </div>
        </div>
        <div>
          <ZoneLabel n={2}>spectrum · peaks</ZoneLabel>
          <div className="mt-1.5">
            <SpectrumView
              read={() => ({
                spectrum: engine.latest.spectrum?.data ?? null,
                peaks: engine.latest.peaks?.data ?? null,
                sampleRate: engine.sampleRate,
              })}
              maxFreq={2600}
              ariaLabel="Live frequency spectrum with the detected chord peaks marked."
            />
          </div>
        </div>
      </div>

      {/* (3) Recognized chords */}
      <div className="mt-6">
        <ZoneLabel n={3}>recognized chords</ZoneLabel>
        <ChordStrip glyphs={glyphs} live={live} />
      </div>

      {/* (4) The reading */}
      <div className="mt-6">
        <ZoneLabel n={4}>translation log</ZoneLabel>
        <TranslationLog utterances={translation.utterances} status={status} />
      </div>

      {/* Play Rocky */}
      <div className="mt-7 border-t border-line pt-5">
        <p className="font-mono text-[11px] tracking-wide text-ink-dim">
          <span className="text-phosphor-dim">play Rocky</span> — speak a phrase at the mic
          {listening ? ' (heard acoustically)' : ', or decode it directly'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Btn
              key={preset.label}
              disabled={busy}
              onClick={() => void engine.playPhrase(preset.words, preset.register)}
            >
              ▶ {preset.label}
            </Btn>
          ))}
        </div>
        <details className="mt-3 rounded-sm border border-dashed border-line px-3 py-2 text-[12px] text-ink-dim">
          <summary className="cursor-pointer">Use a second device as Rocky</summary>
          <p className="mt-1.5 leading-relaxed">
            Arm the microphone here, then open the{' '}
            <a
              href="/eridian/compose"
              className="text-phosphor underline decoration-line underline-offset-4 hover:decoration-phosphor"
            >
              composer
            </a>{' '}
            on a phone, build a sentence, and play it near this device’s mic. The chords travel
            through the air — exactly the acoustic path a real translator would decode.
          </p>
        </details>
      </div>
    </FigureShell>
  );
}

function StatusLamp({ status }: { status: TranslatorStatus }) {
  const live = status === 'listening' || status === 'starting' || status === 'playing';
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-dim">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${
          status === 'error' ? 'bg-danger' : live ? 'anim-idle bg-phosphor' : 'bg-ink-dim/50'
        }`}
      />
      <span aria-live="polite">{STATUS_LABEL[status]}</span>
    </span>
  );
}

function ChordStrip({
  glyphs,
  live,
}: {
  glyphs: { symbol: string; confidence: number; payload?: unknown }[];
  live: boolean;
}) {
  if (glyphs.length === 0) {
    return (
      <p className="mt-1.5 font-mono text-[12px] text-faint">
        {live
          ? 'Listening — speak Eridian and each sounded chord appears here.'
          : 'No chords yet. Arm the mic, or press a phrase below to try it.'}
      </p>
    );
  }
  // Keep the strip bounded; the newest chords are what matter live.
  const shown = glyphs.slice(-48);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {shown.map((glyph, i) => {
        const payload = glyph.payload as EridianChordPayload | undefined;
        const register = payload ? `${payload.register >= 0 ? '+' : ''}${payload.register}` : '';
        return (
          <span
            key={i}
            title={`${(glyph.confidence * 100).toFixed(0)}% confidence${payload ? ` · register ${register}` : ''}`}
            className="glyph-glow anim-glyph flex flex-col items-center rounded-sm border border-accent bg-accent-dim px-2 py-1 leading-none"
          >
            <span className="text-[15px] font-bold text-phosphor">{glyph.symbol}</span>
            {payload && (
              <span className="mt-1 font-mono text-[9px] text-phosphor-dim">
                {payload.content ? 'triad' : 'dyad'}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TranslationLog({
  utterances,
  status,
}: {
  utterances: EridianUtterance[];
  status: TranslatorStatus;
}) {
  if (utterances.length === 0) {
    return (
      <p className="mt-1.5 text-[13px] leading-normal text-faint">
        {status === 'listening'
          ? 'Waiting for the first chord…'
          : 'The decoded reading lands here — gloss, grammar, and the emotional register behind it.'}
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-col gap-2.5" aria-live="polite">
      {utterances.map((utterance, u) => (
        <UtteranceCard key={u} utterance={utterance} />
      ))}
    </div>
  );
}

function UtteranceCard({ utterance }: { utterance: EridianUtterance }) {
  const register = `${utterance.register >= 0 ? '+' : ''}${utterance.register}`;
  return (
    <div className="rounded-sm border border-line bg-void p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {utterance.words.map((word, w) => (
          <span
            key={w}
            title={word.syllables.join('-')}
            className={`font-mono text-[12px] ${word.entry ? 'text-ink-dim' : 'text-danger'}`}
          >
            {word.gloss}
            {word.tense ? ` [${word.tense}]` : ''}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-base text-phosphor">“{utterance.gloss}”</p>
      <p className="mt-1 font-mono text-[11px] text-ink-dim">
        {utterance.parsed
          ? 'parsed as a well-formed sentence'
          : 'literal gloss (not a full sentence)'}{' '}
        · register {register} — {utterance.affect}
      </p>
    </div>
  );
}
