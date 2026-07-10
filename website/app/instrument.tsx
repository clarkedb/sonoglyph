'use client';

import { useEffect, useRef, useState } from 'react';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import { ALL_KEYS, frequenciesFor } from '@sonoglyph/plugin-dtmf';
import { decodeKey } from './decode';

/* Fig. 1 — the dual-tone decoder. A real 16-key DTMF keypad wired through
 * the real pipeline (see decode.ts): press a key, hear the tone, watch the
 * scope and spectrum, read the glyph. Pre-hydration it renders the idle
 * instrument; every animation is CSS so reduced-motion flattens it. */

const SCOPE_W = 240;
const SCOPE_H = 88;
const SPEC_MAX_HZ = 1700;
const TRAIL_MAX = 10;

interface Bar {
  x: number;
  w: number;
  h: number;
  peak: boolean;
}

interface Shot {
  id: number;
  wavePath: string;
  bars: Bar[];
  symbol: string | null;
  confidence: number;
  lowHz: number;
  highHz: number;
  nominalLowHz: number;
  nominalHighHz: number;
}

/** ~7 ms of the tone, mid-buffer (past the fade), mapped to a path. */
function wavePathFrom(tone: Float32Array, sampleRate: number): string {
  const n = Math.round(sampleRate * 0.007);
  const start = Math.min(Math.round(sampleRate * 0.04), Math.max(0, tone.length - n));
  const mid = SCOPE_H / 2;
  const amp = SCOPE_H * 0.46;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * SCOPE_W;
    const y = mid - (tone[start + i] ?? 0) * amp;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Real FFT magnitudes, 0..1.7 kHz, normalized; the key's two bins flagged. */
function barsFrom(spectrum: Float32Array, binHz: number, key: DtmfKey): Bar[] {
  const { lowHz, highHz } = frequenciesFor(key);
  const count = Math.min(spectrum.length, Math.ceil(SPEC_MAX_HZ / binHz));
  let max = 0;
  for (let i = 0; i < count; i++) max = Math.max(max, spectrum[i]!);
  if (max === 0) return [];
  const bw = SCOPE_W / count;
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const centerHz = i * binHz;
    bars.push({
      x: i * bw + bw * 0.2,
      w: bw * 0.6,
      h: Math.max(1.5, (spectrum[i]! / max) * (SCOPE_H - 18)),
      peak: Math.abs(centerHz - lowHz) < binHz * 1.5 || Math.abs(centerHz - highHz) < binHz * 1.5,
    });
  }
  return bars;
}

/** Idle trace: a faint resting sine, same on server and client. */
function idlePath(): string {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * SCOPE_W;
    const y = SCOPE_H / 2 - Math.sin((i / 120) * Math.PI * 4) * 3;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}
const IDLE_PATH = idlePath();

const KEY_ROWS: DtmfKey[][] = [0, 1, 2, 3].map((r) => ALL_KEYS.slice(r * 4, r * 4 + 4));

export function Instrument() {
  const [shot, setShot] = useState<Shot | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const idRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== 'closed') void ctx.close();
    };
  }, []);

  function play(samples: Float32Array, sampleRate: number) {
    const ctx = (audioRef.current ??= new AudioContext());
    void ctx.resume();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.start();
  }

  function press(key: DtmfKey) {
    const d = decodeKey(key);
    play(d.tone, d.sampleRate);
    const nominal = frequenciesFor(key);
    const g = d.glyph;
    setShot({
      id: idRef.current++,
      wavePath: wavePathFrom(d.tone, d.sampleRate),
      bars: barsFrom(d.spectrum, d.binHz, key),
      symbol: g?.symbol ?? null,
      confidence: g?.confidence ?? 0,
      lowHz: g?.payload?.lowHz ?? nominal.lowHz,
      highHz: g?.payload?.highHz ?? nominal.highHz,
      nominalLowHz: nominal.lowHz,
      nominalHighHz: nominal.highHz,
    });
    if (g) setTrail((t) => [...t, g.symbol].slice(-TRAIL_MAX));
  }

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-2 font-mono text-xs text-ink-dim">
        <span>
          <span className="font-medium text-ink">FIG. 1</span> — DUAL-TONE DECODER
        </span>
        <span>engine: @sonoglyph/dsp · recognizer: plugin-dtmf · 48 kHz</span>
      </figcaption>

      <div className="graph-grid mt-4 grid gap-6 rounded-sm border border-line bg-panel/60 p-5 sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto]">
        {/* (1) Keypad */}
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
                    aria-label={`Play DTMF key ${key}`}
                    className="size-11 cursor-pointer rounded-sm border border-line bg-void font-mono text-sm text-ink transition-[border-color,transform] duration-100 hover:border-phosphor-dim active:scale-95"
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-dim">press a key · ♪</p>
        </div>

        {/* (2)+(3) Scope and spectrum */}
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <ZoneLabel n={2}>scope · time domain</ZoneLabel>
            <svg
              viewBox={`0 0 ${SCOPE_W} ${SCOPE_H}`}
              preserveAspectRatio="none"
              className="mt-2 h-22 w-full"
              aria-hidden
            >
              <line x1="0" y1={SCOPE_H / 2} x2={SCOPE_W} y2={SCOPE_H / 2} stroke="var(--line)" />
              {shot ? (
                <path
                  key={shot.id}
                  d={shot.wavePath}
                  pathLength={1}
                  fill="none"
                  stroke="var(--phosphor)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  className="anim-trace trace-glow"
                />
              ) : (
                <path
                  d={IDLE_PATH}
                  fill="none"
                  stroke="var(--phosphor)"
                  strokeWidth="1.2"
                  className="anim-idle"
                />
              )}
            </svg>
          </div>
          <div>
            <ZoneLabel n={3}>spectrum · 0–1.7 kHz</ZoneLabel>
            <svg
              viewBox={`0 0 ${SCOPE_W} ${SCOPE_H}`}
              preserveAspectRatio="none"
              className="mt-2 h-22 w-full"
              aria-hidden
            >
              <line x1="0" y1={SCOPE_H - 2} x2={SCOPE_W} y2={SCOPE_H - 2} stroke="var(--line)" />
              {shot && (
                <g key={shot.id}>
                  {shot.bars.map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={SCOPE_H - 2 - b.h}
                      width={b.w}
                      height={b.h}
                      fill={b.peak ? 'var(--phosphor)' : 'var(--ink-dim)'}
                      opacity={b.peak ? 1 : 0.4}
                      className="anim-bar"
                      style={{ '--i': i } as React.CSSProperties}
                    />
                  ))}
                  <text
                    x={(shot.nominalLowHz / SPEC_MAX_HZ) * SCOPE_W}
                    y="10"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    fill="var(--phosphor-dim)"
                  >
                    {shot.nominalLowHz}
                  </text>
                  <text
                    x={(shot.nominalHighHz / SPEC_MAX_HZ) * SCOPE_W}
                    y="10"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    fill="var(--phosphor-dim)"
                  >
                    {shot.nominalHighHz}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* (4) Glyph out */}
        <div className="sm:col-span-2 lg:col-span-1 lg:w-44">
          <ZoneLabel n={4}>glyph</ZoneLabel>
          <div aria-live="polite" className="mt-2 flex items-start gap-4 lg:flex-col">
            {shot?.symbol ? (
              <span
                key={shot.id}
                className="anim-glyph glyph-glow flex size-14 items-center justify-center rounded-sm border border-phosphor-dim bg-phosphor/10 font-display text-3xl text-phosphor"
              >
                {shot.symbol}
              </span>
            ) : (
              <span className="flex size-14 items-center justify-center rounded-sm border border-dashed border-line font-display text-3xl text-ink-dim">
                ?
              </span>
            )}
            <div className="font-mono text-[11px] leading-relaxed text-ink-dim">
              {shot?.symbol ? (
                <>
                  <p className="text-ink">
                    dtmf:{shot.symbol} · conf {shot.confidence.toFixed(2)}
                  </p>
                  <p>
                    meas {shot.lowHz.toFixed(1)} + {shot.highHz.toFixed(1)} Hz
                  </p>
                  <p>
                    sent {shot.nominalLowHz} + {shot.nominalHighHz} Hz
                  </p>
                </>
              ) : (
                <p>awaiting signal</p>
              )}
              {trail.length > 0 && (
                <p className="mt-1.5 text-phosphor-dim">trail {trail.join(' ')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-dim">
        (1) a key press synthesizes its two tones — row + column · (2) the raw samples, exactly what
        a microphone would hear · (3) FFT magnitudes; the two peaks are the key&rsquo;s coordinates
        · (4) the recognized glyph, with its confidence and measured frequencies
      </p>
    </figure>
  );
}

function ZoneLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-wide text-ink-dim">
      <span className="text-phosphor-dim">({n})</span> {children}
    </p>
  );
}
