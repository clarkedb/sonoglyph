'use client';

import { useState } from 'react';
import { tones } from '@sonoglyph/dsp';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import { ALL_KEYS, frequenciesFor, HIGH_GROUP, LOW_GROUP } from '@sonoglyph/plugin-dtmf';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';

/* Chapter 08 — the frequency grid, playable. Rows are the low group,
 * columns the high group; pressing a key plays the real pair and plots the
 * byproducts a real source would add (2×, 3×, sum), which by 1963 design
 * land between the eight nominals, never on one. */

const SAMPLE_RATE = 48_000;
const TONE_SEC = 0.18;
const AMPLITUDE = 0.4;

const KEY_ROWS: DtmfKey[][] = [0, 1, 2, 3].map((r) => ALL_KEYS.slice(r * 4, r * 4 + 4));
const NOMINALS = [...LOW_GROUP, ...HIGH_GROUP];

/* Harmony-check axis geometry. 3×941 = 2823 and 2×1633 = 3266 must fit. */
const AXIS_MAX = 3_500;
const AW = 480;
const AH = 96;
const AXIS_Y = 58;
const xOf = (hz: number) => (hz / AXIS_MAX) * AW;

interface Byproduct {
  hz: number;
  label: string;
}

function byproductsFor(lowHz: number, highHz: number): Byproduct[] {
  return [
    { hz: 2 * lowHz, label: `2×${lowHz}` },
    { hz: 3 * lowHz, label: `3×${lowHz}` },
    { hz: 2 * highHz, label: `2×${highHz}` },
    { hz: lowHz + highHz, label: `${lowHz}+${highHz}` },
  ].filter((b) => b.hz <= AXIS_MAX);
}

/** Distance from the closest byproduct to the closest nominal — the margin
 * the 1963 frequency plan guarantees (≥ ~58 Hz for every key). */
function nearestMiss(products: Byproduct[]): number {
  let min = Infinity;
  for (const p of products) {
    for (const n of NOMINALS) min = Math.min(min, Math.abs(p.hz - n));
  }
  return min;
}

export function DtmfMatrixFigure() {
  const [pressed, setPressed] = useState<DtmfKey | null>(null);
  const play = useAudioPlayback();

  const pair = pressed !== null ? frequenciesFor(pressed) : null;
  const products = pair ? byproductsFor(pair.lowHz, pair.highHz) : [];

  function press(key: DtmfKey) {
    const { lowHz, highHz } = frequenciesFor(key);
    setPressed(key);
    play(
      fadeInPlace(
        tones(
          [
            { frequencyHz: lowHz, amplitude: AMPLITUDE },
            { frequencyHz: highHz, amplitude: AMPLITUDE },
          ],
          TONE_SEC,
          SAMPLE_RATE,
        ),
        SAMPLE_RATE,
      ),
      SAMPLE_RATE,
    );
  }

  return (
    <FigureShell
      n={1}
      title="the frequency grid"
      meta="8 oscillators · 16 keys · Bell System, 1963"
      caption={
        <>
          (1) row + column names the key: press one to hear its pair · (2) the eight nominals as
          ticks, and the pressed pair’s byproducts — doubled tones, tripled low tone, their sum — as
          diamonds. The 1963 plan guarantees every diamond lands in a gap: this is the arithmetic
          that rejects voices, whose harmonics <em>are</em> integer-related.
        </>
      }
    >
      {/* (1) The annotated matrix */}
      <ZoneLabel n={1}>the grid · low group × high group</ZoneLabel>
      <div className="mt-2 grid w-fit grid-cols-[auto_auto] gap-x-3">
        <div /> {/* corner */}
        <div className="grid grid-cols-4 gap-1.5">
          {HIGH_GROUP.map((hz) => (
            <span
              key={hz}
              className={`w-11 text-center font-mono text-[10px] tabular-nums transition-colors ${
                pair?.highHz === hz ? 'text-phosphor' : 'text-ink-dim'
              }`}
            >
              {hz}
            </span>
          ))}
        </div>
        <div className="grid grid-rows-4 items-center gap-1.5">
          {LOW_GROUP.map((hz) => (
            <span
              key={hz}
              className={`text-right font-mono text-[10px] tabular-nums transition-colors ${
                pair?.lowHz === hz ? 'text-phosphor' : 'text-ink-dim'
              }`}
            >
              {hz}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="DTMF keypad">
          {KEY_ROWS.map((row, r) => (
            <div key={r} className="contents">
              {row.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  aria-pressed={pressed === key}
                  aria-label={`Play DTMF key ${key}`}
                  className={`size-11 cursor-pointer rounded-sm border font-mono text-sm transition-[border-color,transform] duration-100 active:scale-95 ${
                    pressed === key
                      ? 'border-phosphor bg-accent-dim text-phosphor'
                      : 'border-line bg-void text-ink hover:border-phosphor-dim'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* (2) The harmony check */}
      <div className="mt-6">
        <ZoneLabel n={2}>harmony check · 0–3.5 kHz</ZoneLabel>
        <svg
          viewBox={`0 0 ${AW} ${AH}`}
          className="mt-2 w-full rounded-sm bg-canvas"
          aria-label={
            pair
              ? `Frequency axis showing the eight DTMF tones and the byproducts of ${pair.lowHz} plus ${pair.highHz} hertz, all falling between the nominal tones.`
              : 'Frequency axis showing the eight DTMF tones as ticks.'
          }
        >
          <line x1="0" y1={AXIS_Y} x2={AW} y2={AXIS_Y} stroke="var(--line)" />
          {NOMINALS.map((hz, i) => {
            const active = pair !== null && (hz === pair.lowHz || hz === pair.highHz);
            return (
              <g key={hz}>
                <line
                  x1={xOf(hz)}
                  y1={AXIS_Y - 14}
                  x2={xOf(hz)}
                  y2={AXIS_Y}
                  stroke={active ? 'var(--phosphor)' : 'var(--ink-dim)'}
                  strokeWidth={active ? 1.6 : 1}
                />
                <text
                  x={xOf(hz)}
                  y={AXIS_Y - 18 - (i % 2 === 0 ? 0 : 10)}
                  textAnchor="middle"
                  fontSize="8"
                  fontFamily="var(--font-mono)"
                  fill={active ? 'var(--phosphor)' : 'var(--ink-dim)'}
                >
                  {hz}
                </text>
              </g>
            );
          })}
          {products.map((p, i) => (
            <g key={p.label}>
              <path
                d={`M${xOf(p.hz).toFixed(1)} ${AXIS_Y + 4} l4 5 l-4 5 l-4 -5 Z`}
                fill="var(--danger)"
              />
              <text
                x={xOf(p.hz)}
                y={AXIS_Y + 26 + (i % 2 === 0 ? 0 : 10)}
                textAnchor="middle"
                fontSize="8"
                fontFamily="var(--font-mono)"
                fill="var(--danger)"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
        <p aria-live="polite" className="mt-2 font-mono text-[11px] text-ink-dim">
          {pair && pressed !== null ? (
            <>
              key <span className="text-phosphor">{pressed}</span> = {pair.lowHz} + {pair.highHz} Hz
              · nearest byproduct misses every DTMF tone by {Math.round(nearestMiss(products))} Hz
            </>
          ) : (
            'press a key — its byproducts appear below the axis'
          )}
        </p>
      </div>
    </FigureShell>
  );
}
