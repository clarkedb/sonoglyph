'use client';

import { useEffect, useRef, useState } from 'react';
import type { Glyph } from '@sonoglyph/core';
import {
  concat,
  DEFAULT_ENGINE_OPTIONS,
  Pipeline,
  silence,
  sine,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { MorseTranscript } from '@sonoglyph/plugin-morse';
import {
  MorseRecognizer,
  MorseTextTranslator,
  morseTiming,
  textToMorse,
} from '@sonoglyph/plugin-morse';
import { GlyphTimeline, MeaningView, WaveformView } from '@sonoglyph/react';
import { FigureShell, ZoneLabel } from '../../learn/components/figure-shell';
import { Btn, Segmented } from '../../learn/components/controls';
import { fadeInPlace, useAudioPlayback } from '../../learn/components/use-audio';

/* The focused Morse decoder. Two ways in, one pipeline out:
 *
 * - "key a message": the text is keyed by the plugin's own timing table
 *   (morseTiming), decoded offline through the real pipeline, then revealed
 *   in sync with playback — every glyph appears at the stream time the
 *   recognizer emitted it.
 * - "straight key": hold Space (or the key button) and the session streams
 *   tone/silence chunks into a live pipeline in real time — dots, dashes,
 *   and letters close as you pause, exactly like the playground's keyer.
 *
 * The recognizer reads only the amplitude envelope; 600 Hz is convention,
 * not requirement. */

const SAMPLE_RATE = DEFAULT_ENGINE_OPTIONS.sampleRate;
const TONE_HZ = 600;
const KEYER_UNIT_SEC = 0.08; // matches the recognizer's default seed
const STRAIGHT_UNIT_MS = 120; // hand keying is slower; adaptive from there
const RING_SEC = 0.5;
const MAX_GLYPHS = 24;

const EMPTY: MorseTranscript = { text: '', letters: [] };

function transcriptOf(glyphs: Glyph[], flush: boolean): MorseTranscript {
  const translator = new MorseTextTranslator();
  let out = EMPTY;
  translator.onMeaning((m) => (out = m));
  for (const glyph of glyphs) translator.push(glyph);
  if (flush) translator.flush();
  return out;
}

/** Key `text` as audio via the plugin's timing table, then decode the whole
 * buffer offline through the real pipeline. Deterministic, like decode.ts. */
function keyAndDecode(text: string): { buffer: Float32Array; glyphs: Glyph[] } {
  const lead = (2 * DEFAULT_ENGINE_OPTIONS.windowSize) / SAMPLE_RATE;
  const parts: Float32Array[] = [silence(lead, SAMPLE_RATE)];
  for (const segment of morseTiming(text)) {
    const sec = segment.units * KEYER_UNIT_SEC;
    parts.push(
      segment.on
        ? fadeInPlace(sine(TONE_HZ, sec, SAMPLE_RATE, 0.5), SAMPLE_RATE)
        : silence(sec, SAMPLE_RATE),
    );
  }
  parts.push(silence(7 * KEYER_UNIT_SEC, SAMPLE_RATE));
  const buffer = concat(...parts);

  const pipeline = new Pipeline(new TsDspEngine());
  pipeline.addPlugin(new MorseRecognizer());
  const glyphs: Glyph[] = [];
  pipeline.onGlyph((g) => glyphs.push(g));
  pipeline.push(buffer);
  pipeline.flush();
  pipeline.dispose();
  return { buffer, glyphs };
}

/** Live straight-key session: wall-clock chunks into a persistent pipeline. */
interface LiveSession {
  pipeline: Pipeline;
  translator: MorseTextTranslator;
  ring: Float32Array;
  ringAt: number;
  snapshot: Float32Array;
  interval: ReturnType<typeof setInterval>;
  lastTick: number;
  keyDown: boolean;
  lastSound: number;
  letterClosed: boolean;
  unitSec: number;
  audio: { ctx: AudioContext; gain: GainNode };
}

export function MorseDemo() {
  const [mode, setMode] = useState<'message' | 'straight'>('message');
  const [text, setText] = useState('SOS');
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);
  const [transcript, setTranscript] = useState<MorseTranscript>(EMPTY);
  const [armed, setArmed] = useState(false);
  const [keyLit, setKeyLit] = useState(false);
  const play = useAudioPlayback();

  const liveRef = useRef<LiveSession | null>(null);
  const revealRaf = useRef(0);
  const staticWave = useRef<Float32Array | null>(null);

  function clearTape() {
    setGlyphs([]);
    setTranscript(EMPTY);
    staticWave.current = null;
  }

  /* -------------------------- message keyer -------------------------- */

  function keyMessage() {
    cancelAnimationFrame(revealRaf.current);
    const { buffer, glyphs: all } = keyAndDecode(text);
    staticWave.current = buffer;
    clearTapeKeepWave();
    play(buffer, SAMPLE_RATE);

    const t0 = performance.now();
    let shown = 0;
    const step = () => {
      const elapsed = (performance.now() - t0) / 1000;
      let count = 0;
      while (count < all.length && all[count]!.start + all[count]!.duration <= elapsed) count++;
      if (count !== shown) {
        shown = count;
        const visible = all.slice(0, count);
        setGlyphs(visible.slice(-MAX_GLYPHS));
        setTranscript(transcriptOf(visible, false));
      }
      if (shown < all.length) {
        revealRaf.current = requestAnimationFrame(step);
      } else {
        setTranscript(transcriptOf(all, true));
      }
    };
    revealRaf.current = requestAnimationFrame(step);

    function clearTapeKeepWave() {
      setGlyphs([]);
      setTranscript(EMPTY);
    }
  }

  /* -------------------------- straight key --------------------------- */

  function arm() {
    if (liveRef.current) return;
    const pipeline = new Pipeline(new TsDspEngine());
    pipeline.addPlugin(new MorseRecognizer({ unitMs: STRAIGHT_UNIT_MS }));
    const translator = new MorseTextTranslator();
    translator.onMeaning((m) => setTranscript(m));

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.frequency.value = TONE_HZ;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    const session: LiveSession = {
      pipeline,
      translator,
      ring: new Float32Array(Math.round(RING_SEC * SAMPLE_RATE)),
      ringAt: 0,
      snapshot: new Float32Array(Math.round(RING_SEC * SAMPLE_RATE)),
      interval: setInterval(tick, 30),
      lastTick: performance.now(),
      keyDown: false,
      lastSound: performance.now(),
      letterClosed: true,
      unitSec: STRAIGHT_UNIT_MS / 1000,
      audio: { ctx, gain },
    };

    pipeline.onGlyph((glyph) => {
      setGlyphs((g) => [...g, glyph].slice(-MAX_GLYPHS));
      translator.push(glyph);
      const units = (glyph.payload as { units?: number } | undefined)?.units;
      if (units && glyph.duration > 0) session.unitSec = glyph.duration / units;
      session.letterClosed = false;
    });

    liveRef.current = session;
    staticWave.current = null;
    clearTape();
    setArmed(true);

    function tick() {
      const s = liveRef.current;
      if (!s) return;
      const now = performance.now();
      const dt = Math.min((now - s.lastTick) / 1000, 0.2);
      s.lastTick = now;
      const n = Math.round(dt * SAMPLE_RATE);
      if (n === 0) return;
      const chunk = s.keyDown
        ? sine(TONE_HZ, n / SAMPLE_RATE, SAMPLE_RATE, 0.5)
        : new Float32Array(n);
      s.pipeline.push(chunk);
      // Ring buffer for the scope.
      for (let i = 0; i < n; i++) {
        s.ring[s.ringAt] = chunk[i]!;
        s.ringAt = (s.ringAt + 1) % s.ring.length;
      }
      s.snapshot.set(s.ring.subarray(s.ringAt));
      s.snapshot.set(s.ring.subarray(0, s.ringAt), s.ring.length - s.ringAt);

      if (s.keyDown) {
        s.lastSound = now;
      } else if (!s.letterClosed && now - s.lastSound > 2.2 * s.unitSec * 1000) {
        // A letter gap has passed with no new element: commit the letter,
        // the same live closing the playground's keyer does.
        s.translator.closePending();
        s.letterClosed = true;
      }
    }
  }

  function disarm() {
    const s = liveRef.current;
    if (!s) return;
    liveRef.current = null;
    clearInterval(s.interval);
    s.pipeline.flush();
    s.translator.flush();
    s.pipeline.dispose();
    void s.audio.ctx.close();
    setArmed(false);
    setKeyLit(false);
  }

  function setKey(down: boolean) {
    const s = liveRef.current;
    if (!s || s.keyDown === down) return;
    s.keyDown = down;
    setKeyLit(down);
    const g = s.audio.gain.gain;
    const t = s.audio.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(down ? 0.25 : 0, t, 0.005);
  }

  useEffect(() => {
    if (!armed) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      setKey(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      setKey(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [armed]);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(revealRaf.current);
      const s = liveRef.current;
      if (s) {
        liveRef.current = null;
        clearInterval(s.interval);
        s.pipeline.dispose();
        void s.audio.ctx.close();
      }
    };
  }, []);

  const code = textToMorse(text);

  return (
    <FigureShell
      n={1}
      title="morse decoder"
      meta="engine: @sonoglyph/dsp · recognizer: plugin-morse (envelope only) · 48 kHz"
      caption={
        <>
          (1) key a message with the plugin’s own timing table, or send it by hand · (2) the
          amplitude envelope is everything the recognizer reads — pitch is irrelevant · (3) each
          glyph is one element, dot or dash, named by its duration · (4) letters assemble one stage
          later, in the translator, from the <em>silences</em> between elements.
        </>
      }
    >
      {/* (1) Input */}
      <ZoneLabel n={1}>input</ZoneLabel>
      <div className="mt-2">
        <Segmented
          label="mode"
          value={mode}
          options={[
            { value: 'message', label: 'key a message' },
            { value: 'straight', label: 'straight key' },
          ]}
          onChange={(m) => {
            cancelAnimationFrame(revealRaf.current);
            if (m === 'message') disarm();
            setMode(m);
            clearTape();
          }}
        />
      </div>

      {mode === 'message' ? (
        <div className="mt-4">
          <label htmlFor="morse-text" className="block font-mono text-[11px] text-ink-dim">
            message to key
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              id="morse-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 24))}
              onKeyDown={(e) => e.key === 'Enter' && text.trim() && keyMessage()}
              className="w-44 rounded-sm border border-line bg-void px-2 py-1 font-mono text-xs text-ink"
            />
            <Btn primary onClick={keyMessage} disabled={!code}>
              ♪ key it
            </Btn>
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-dim" aria-live="polite">
            {code ? <>as code: {code}</> : 'nothing encodable yet'}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {!armed ? (
            <Btn primary onClick={arm}>
              arm the straight key
            </Btn>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onPointerDown={() => setKey(true)}
                onPointerUp={() => setKey(false)}
                onPointerLeave={() => setKey(false)}
                onKeyDown={(e) => {
                  if (e.code === 'Enter' && !e.repeat) setKey(true);
                }}
                onKeyUp={(e) => {
                  if (e.code === 'Enter') setKey(false);
                }}
                className={`h-14 w-36 cursor-pointer rounded-sm border font-mono text-sm transition-colors ${
                  keyLit
                    ? 'glyph-glow border-phosphor bg-accent-dim text-phosphor'
                    : 'border-line bg-void text-ink hover:border-phosphor-dim'
                }`}
              >
                {keyLit ? '● sounding' : 'hold to key'}
              </button>
              <Btn onClick={disarm}>disarm</Btn>
              <p className="max-w-[34ch] font-mono text-[11px] leading-relaxed text-ink-dim">
                hold Space or the key · short = dot, 3× = dash · pause to close a letter
              </p>
            </div>
          )}
        </div>
      )}

      {/* (2) Scope */}
      <div className="mt-6">
        <ZoneLabel n={2}>
          scope · {mode === 'straight' ? `last ${RING_SEC} s` : 'the keyed signal'}
        </ZoneLabel>
        <WaveformView
          read={() =>
            mode === 'straight' ? (liveRef.current?.snapshot ?? null) : staticWave.current
          }
          className="mt-2 block h-[110px] w-full rounded-sm bg-canvas"
          ariaLabel="Waveform of the keyed Morse signal — bursts of tone separated by silence."
        />
      </div>

      {/* (3) Glyphs + (4) Meaning */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <ZoneLabel n={3}>glyph timeline · elements</ZoneLabel>
            {glyphs.length > 0 && <Btn onClick={clearTape}>clear</Btn>}
          </div>
          <div className="mt-2">
            <GlyphTimeline
              glyphs={glyphs}
              showPair={false}
              decoderLabel={() => 'Morse'}
              emptyMessage="Key something — dots and dashes land here as the recognizer closes them."
            />
          </div>
        </div>
        <div className="min-w-0">
          <ZoneLabel n={4}>meaning · letters</ZoneLabel>
          <div className="mt-2">
            <MeaningView
              transcript={transcript}
              emptyMessage="Letters assemble here from the gaps between elements."
            />
          </div>
        </div>
      </div>
    </FigureShell>
  );
}
