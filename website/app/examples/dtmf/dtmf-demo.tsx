'use client';

import { useEffect, useRef, useState } from 'react';
import type { FeatureFrame, Glyph, SpectrumData } from '@sonoglyph/core';
import { STREAM_SPECTRUM } from '@sonoglyph/core';
import {
  concat,
  DEFAULT_ENGINE_OPTIONS,
  Pipeline,
  silence,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { ToneSpec } from '@sonoglyph/dsp';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import {
  ALL_KEYS,
  DtmfRecognizer,
  frequenciesFor,
  HIGH_GROUP,
  LOW_GROUP,
} from '@sonoglyph/plugin-dtmf';
import type { SpectrumInput } from '@sonoglyph/react';
import { GlyphTimeline, SpectrumView } from '@sonoglyph/react';
import { FigureShell, ZoneLabel } from '../../learn/components/figure-shell';
import { Btn } from '../../learn/components/controls';
import { fadeInPlace, useAudioPlayback } from '../../learn/components/use-audio';

/* The focused DTMF decoder: one long-lived pipeline (TsDspEngine +
 * DtmfRecognizer), fed synthesized presses. Unlike the landing page's
 * one-shot instrument, the session persists — the glyph timeline reads
 * like a tape, and stream time keeps counting between presses. */

const SAMPLE_RATE = DEFAULT_ENGINE_OPTIONS.sampleRate;
const TONE_SEC = 0.16;
const AMPLITUDE = 0.4;
const MAX_GLYPHS = 18;
const KEY_ROWS: DtmfKey[][] = [0, 1, 2, 3].map((r) => ALL_KEYS.slice(r * 4, r * 4 + 4));

interface Session {
  pipeline: Pipeline;
  /** Hottest spectrum frame of the most recent push, for the analyzer. */
  hottest: { frame: FeatureFrame<SpectrumData> | null; energy: number };
}

export function DtmfDemo() {
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);
  const [trail, setTrail] = useState('');
  const [custom, setCustom] = useState('697, 1209');
  const [customError, setCustomError] = useState<string | null>(null);
  const play = useAudioPlayback();

  const sessionRef = useRef<Session | null>(null);
  const frameRef = useRef<SpectrumInput | null>(null);

  function session(): Session {
    if (sessionRef.current) return sessionRef.current;
    const s: Session = {
      pipeline: new Pipeline(new TsDspEngine()),
      hottest: { frame: null, energy: -1 },
    };
    s.pipeline.addPlugin(new DtmfRecognizer());
    s.pipeline.onGlyph((glyph) => {
      setGlyphs((g) => [...g, glyph].slice(-MAX_GLYPHS));
      setTrail((t) => (t + glyph.symbol).slice(-32));
    });
    s.pipeline.onFrame((frame) => {
      if (frame.stream !== STREAM_SPECTRUM) return;
      const spectrumFrame = frame as FeatureFrame<SpectrumData>;
      let energy = 0;
      const { magnitudes } = spectrumFrame.data;
      for (let i = 0; i < magnitudes.length; i++) energy += magnitudes[i]!;
      if (energy > s.hottest.energy) {
        s.hottest = { frame: spectrumFrame, energy };
        frameRef.current = {
          spectrum: spectrumFrame.data,
          peaks: null,
          sampleRate: SAMPLE_RATE,
        };
      }
    });
    sessionRef.current = s;
    return s;
  }

  useEffect(() => {
    return () => {
      sessionRef.current?.pipeline.dispose();
      sessionRef.current = null;
    };
  }, []);

  /** Push one press through the live session and play it out loud. */
  function send(specs: ToneSpec[], durationSec = TONE_SEC) {
    const s = session();
    s.hottest = { frame: null, energy: -1 };
    const tone = fadeInPlace(tones(specs, durationSec, SAMPLE_RATE), SAMPLE_RATE);
    play(tone, SAMPLE_RATE);
    // Lead + trailing silence: the gap is what closes the glyph.
    s.pipeline.push(concat(silence(0.05, SAMPLE_RATE), tone, silence(0.1, SAMPLE_RATE)));
  }

  function press(key: DtmfKey) {
    const { lowHz, highHz } = frequenciesFor(key);
    send([
      { frequencyHz: lowHz, amplitude: AMPLITUDE },
      { frequencyHz: highHz, amplitude: AMPLITUDE },
    ]);
  }

  // Physical keyboard drives the keypad, same as the playground's DTMF panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ignore auto-repeat: holding a key should play one tone, not
      // machine-gun press() for as long as it's down.
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toUpperCase();
      if ((ALL_KEYS as string[]).includes(key)) {
        press(key as DtmfKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendCustom() {
    const freqs = custom
      .split(',')
      .map((f) => Number(f.trim()))
      .filter((f) => !Number.isNaN(f));
    if (freqs.length === 0 || freqs.length > 4 || freqs.some((f) => f < 50 || f > 20_000)) {
      setCustomError('enter 1–4 frequencies between 50 and 20,000 Hz');
      return;
    }
    setCustomError(null);
    send(freqs.map((frequencyHz) => ({ frequencyHz, amplitude: AMPLITUDE })));
  }

  return (
    <FigureShell
      n={1}
      title="dual-tone decoder"
      meta="engine: @sonoglyph/dsp · recognizer: plugin-dtmf · 48 kHz"
      caption={
        <>
          (1) each key synthesizes its row + column pair through the live pipeline — click, or type
          it on your keyboard · (2) FFT magnitudes of the loudest frame; the guides are the eight
          DTMF frequencies · (3) glyphs appear when a tone persists ≥40 ms and then ends. Try the
          tone input with 697 + 1209 — the exact pair for key 1 — then detune one by 3% and watch
          the recognizer refuse it.
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {/* (1) Keypad + tone input */}
        <div>
          <ZoneLabel n={1}>keypad</ZoneLabel>
          <div
            className="mt-2 grid w-fit grid-cols-4 gap-1.5"
            role="group"
            aria-label="DTMF keypad"
          >
            {KEY_ROWS.map((row, r) => (
              <div key={r} className="contents">
                {row.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => press(key)}
                    aria-label={`Send DTMF key ${key}`}
                    className="size-11 cursor-pointer rounded-sm border border-line bg-void font-mono text-sm text-ink transition-[border-color,transform] duration-100 hover:border-phosphor-dim active:scale-95"
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4">
            <label htmlFor="dtmf-custom" className="block font-mono text-[11px] text-ink-dim">
              or feed raw tones (Hz, comma-separated)
            </label>
            <div className="mt-1 flex gap-1.5">
              <input
                id="dtmf-custom"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendCustom()}
                className="w-36 rounded-sm border border-line bg-void px-2 py-1 font-mono text-xs text-ink"
              />
              <Btn onClick={sendCustom}>send</Btn>
            </div>
            {customError && (
              <p role="alert" className="mt-1.5 font-mono text-[11px] text-danger">
                {customError}
              </p>
            )}
          </div>
        </div>

        {/* (2) Spectrum */}
        <div className="min-w-0">
          <ZoneLabel n={2}>spectrum · loudest frame · 0–2 kHz</ZoneLabel>
          <SpectrumView
            read={() => frameRef.current}
            guides={[...LOW_GROUP, ...HIGH_GROUP]}
            maxFreq={2_000}
            className="mt-2 block h-[200px] w-full cursor-crosshair rounded-sm bg-canvas"
            ariaLabel="Frequency spectrum of the last press, with the eight DTMF frequencies marked as guides."
          />
        </div>
      </div>

      {/* (3) Glyphs */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <ZoneLabel n={3}>glyph timeline</ZoneLabel>
          {glyphs.length > 0 && (
            <Btn
              onClick={() => {
                setGlyphs([]);
                setTrail('');
              }}
            >
              clear
            </Btn>
          )}
        </div>
        {trail && (
          <p aria-live="polite" className="mt-2 font-mono text-sm text-phosphor">
            dialed: {trail}
          </p>
        )}
        <div className="mt-2">
          <GlyphTimeline
            glyphs={glyphs}
            showPair
            decoderLabel={() => 'FFT peaks'}
            emptyMessage="Press a key — the decoded digit lands here with its confidence and measured pair."
          />
        </div>
      </div>
    </FigureShell>
  );
}
