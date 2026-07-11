'use client';

import { chordFor, type Register, type SyllableCode } from '@sonoglyph/eridian';
import { noteName, scaleDegreeOf } from '../lib/notes';

/**
 * The pitch view: a word's syllables laid out left to right, each chord's notes
 * plotted as dots on a shared log-frequency ladder — so a triad reads as three
 * stacked points and a particle dyad as two, the "chord size marks word class"
 * rule made visible. Notes are clickable when `onPlaySyllable` is supplied, so
 * a reader can hear any single chord in isolation. Pure presentation; every
 * frequency comes straight from `chordFor`.
 */

const VIEW_H = 176;
const COL_W = 104;
const PAD_TOP = 22;
const PAD_BOTTOM = 30;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

export function ChordDiagram({
  syllables,
  register,
  onPlaySyllable,
  ariaLabel,
}: {
  syllables: SyllableCode[];
  register: Register;
  /** When set, each syllable column is a button that plays just that chord. */
  onPlaySyllable?: (code: SyllableCode, index: number) => void;
  ariaLabel?: string;
}) {
  const columns = syllables.map((code) => ({ code, notesHz: chordFor(code, register).notesHz }));
  const allHz = columns.flatMap((c) => c.notesHz);
  // Pad the range by two semitones each way so extreme notes aren't glued to
  // the frame; a whole-tone-wide dyad (e.g. PST) still gets breathing room.
  const lo = Math.min(...allHz) * 2 ** (-2 / 12);
  const hi = Math.max(...allHz) * 2 ** (2 / 12);
  const span = Math.log2(hi) - Math.log2(lo);
  const y = (hz: number) => PAD_TOP + (1 - (Math.log2(hz) - Math.log2(lo)) / span) * PLOT_H;

  const width = COL_W * columns.length;
  const interactive = Boolean(onPlaySyllable);

  return (
    <svg
      viewBox={`0 0 ${width} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-44 w-full"
      // A plain graphic when static; when the columns are play buttons it's a
      // labeled group, so `role="img"` doesn't hide those buttons from AT.
      role={interactive ? 'group' : 'img'}
      aria-label={
        ariaLabel ??
        `Pitch ladder for ${syllables.join('-')}, register ${register >= 0 ? '+' : ''}${register}`
      }
    >
      {columns.map((col, i) => {
        const cx = COL_W * (i + 0.5);
        const content = col.notesHz.length === 3;
        const ys = col.notesHz.map(y);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        return (
          <g
            key={i}
            className={interactive ? 'chord-col cursor-pointer' : undefined}
            onClick={interactive ? () => onPlaySyllable!(col.code, i) : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `Play ${col.code}` : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPlaySyllable!(col.code, i);
                    }
                  }
                : undefined
            }
          >
            {/* invisible hit target spanning the column; also the focus ring */}
            {interactive && (
              <rect
                className="chord-hit"
                x={cx - COL_W / 2 + 2}
                y={2}
                width={COL_W - 4}
                height={VIEW_H - 4}
                rx={4}
                fill="transparent"
              />
            )}
            {/* the chord stack: a faint spine joining the notes */}
            <line
              x1={cx}
              y1={top}
              x2={cx}
              y2={bottom}
              stroke="var(--phosphor-dim)"
              strokeWidth={1.5}
              opacity={0.55}
            />
            {col.notesHz.map((hz, n) => {
              const degree = scaleDegreeOf(hz);
              return (
                <g key={n}>
                  <circle cx={cx} cy={y(hz)} r={6} fill="var(--phosphor)" className="trace-glow" />
                  <text
                    x={cx + 12}
                    y={y(hz) + 3.5}
                    fill="var(--ink-dim)"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                  >
                    {noteName(hz)}
                    {degree !== null ? ` · °${degree}` : ''}
                  </text>
                </g>
              );
            })}
            {/* column footer: the syllable code and its chord shape */}
            <text
              x={cx}
              y={VIEW_H - 12}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize={12}
              fontFamily="var(--font-mono)"
              fontWeight={600}
            >
              {col.code}
            </text>
            <text
              x={cx}
              y={VIEW_H - 1}
              textAnchor="middle"
              fill="var(--phosphor-dim)"
              fontSize={8.5}
              fontFamily="var(--font-mono)"
            >
              {content ? 'triad' : 'dyad'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
