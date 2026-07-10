'use client';

import { useMemo, useState } from 'react';
import { sine } from '@sonoglyph/dsp';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Btn, Slider } from '../components/controls';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';
import { samplesPath } from '../components/svg';

/* Chapter 02 — the folding ceiling. A fixed 8 kHz converter samples a tone
 * you control; past fs/2 a second, lower sine fits the same dots exactly,
 * and playback (synthesized at 48 kHz, then decimated with deliberately no
 * anti-alias filter) lets you hear the pitch fold back down. */

const FS = 8_000; // telephone-grade
const NYQUIST = FS / 2;
const VIEW_SEC = 0.0025; // 8 kHz over 2.5 ms → 20 sample dots
const W = 480;
const H = 170;
const MID = H / 2;
const AMP = 0.8;

const PLAY_SEC = 0.6;
const SYNTH_RATE = 48_000;
const DECIMATE = SYNTH_RATE / FS; // keep every 6th sample

function aliasOf(frequencyHz: number): number {
  return Math.abs(frequencyHz - FS * Math.round(frequencyHz / FS));
}

/** One sine over the fixed view, drawn dense enough to pass for continuous.
 * `sign` flips it: a tone folded around fs/2 comes back phase-inverted, so
 * the alias must be drawn negated to genuinely pass through the dots. */
function densePath(frequencyHz: number, sign: 1 | -1): string {
  const wave = sine(frequencyHz, VIEW_SEC, Math.round(1024 / VIEW_SEC), AMP);
  return samplesPath(sign === 1 ? wave : wave.map((v) => -v), W, H);
}

/** The demo, made audible: synthesize at 48 kHz, then throw away five of
 * every six samples with no low-pass first — exactly the mistake a real
 * converter's anti-alias filter exists to prevent. */
function decimate(frequencyHz: number): Float32Array {
  const src = sine(frequencyHz, PLAY_SEC, SYNTH_RATE, AMP);
  const out = new Float32Array(Math.floor(src.length / DECIMATE));
  for (let i = 0; i < out.length; i++) out[i] = src[i * DECIMATE] ?? 0;
  return fadeInPlace(out, FS);
}

export function NyquistFigure() {
  const [freq, setFreq] = useState(3_000);
  const play = useAudioPlayback();

  const aliasHz = aliasOf(freq);
  const folded = aliasHz < freq;

  const dots = useMemo(() => {
    const count = Math.floor(VIEW_SEC * FS) + 1;
    const points: { x: number; y: number }[] = [];
    for (let k = 0; k < count; k++) {
      const t = k / FS;
      points.push({
        x: (t / VIEW_SEC) * W,
        y: MID - Math.sin(2 * Math.PI * freq * t) * AMP * (H / 2) * 0.9,
      });
    }
    return points;
  }, [freq]);

  const truePath = useMemo(() => densePath(freq, 1), [freq]);
  const aliasPath = useMemo(() => (folded ? densePath(aliasHz, -1) : null), [folded, aliasHz]);

  return (
    <FigureShell
      n={1}
      title="the folding ceiling"
      meta={`converter: ${FS.toLocaleString()} Hz, telephone-grade · generator: @sonoglyph/dsp`}
      caption={
        <>
          (1) the tone as generated · (2) its samples: one measurement every 1/
          {FS.toLocaleString()} s, 20 dots in this 2.5 ms view · (3) past fs/2 = 4,000 Hz a second,
          lower sine — dashed — passes through the same dots exactly; nothing in the numbers says
          which wave was real · the play button synthesizes the tone at 48 kHz, then keeps every 6th
          sample with no anti-alias filter, so sweeping past 4 kHz audibly folds the pitch back down
        </>
      }
    >
      <ZoneLabel n={1}>the tone, 2.5 ms · (2) its 8 kHz samples · (3) the alias</ZoneLabel>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-44 w-full"
        aria-label={
          folded
            ? `A ${freq.toLocaleString()} hertz sine sampled at 8 kilohertz. A dashed ${aliasHz.toLocaleString()} hertz sine passes through the same sample dots.`
            : `A ${freq.toLocaleString()} hertz sine sampled at 8 kilohertz, below the 4 kilohertz ceiling.`
        }
      >
        <line x1="0" y1={MID} x2={W} y2={MID} stroke="var(--line)" />
        <path d={truePath} fill="none" stroke="var(--ink-dim)" strokeWidth="1" opacity="0.55" />
        {aliasPath && (
          <path
            d={aliasPath}
            fill="none"
            stroke="var(--danger)"
            strokeWidth="1.2"
            strokeDasharray="5 3"
          />
        )}
        {dots.map((p, i) => (
          <g key={i}>
            <line
              x1={p.x}
              y1={MID}
              x2={p.x}
              y2={p.y}
              stroke="var(--phosphor-dim)"
              strokeWidth="0.8"
              opacity="0.5"
            />
            <circle cx={p.x} cy={p.y} r={2.4} fill="var(--phosphor)" />
          </g>
        ))}
      </svg>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <Slider
          label="tone frequency"
          value={freq}
          min={200}
          max={7_800}
          step={100}
          onChange={setFreq}
          format={(v) => `${v.toLocaleString()} Hz`}
        />
        <Btn primary onClick={() => play(decimate(freq), FS)}>
          ♪ play the samples
        </Btn>
      </div>

      <p aria-live="polite" className="mt-3 font-mono text-[11px] text-ink-dim">
        f = {freq.toLocaleString()} Hz · ceiling fs/2 = {NYQUIST.toLocaleString()} Hz
        {folded && (
          <span className="text-danger">
            {' '}
            · folded — sampled at 8 kHz this is indistinguishable from {aliasHz.toLocaleString()} Hz
          </span>
        )}
      </p>
    </FigureShell>
  );
}
