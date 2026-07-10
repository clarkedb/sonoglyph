'use client';

import { useMemo, useState } from 'react';
import { sine } from '@sonoglyph/dsp';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Btn, Slider } from '../components/controls';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';
import { samplesPath } from '../components/svg';

/* Chapter 01 — a pressure wave becomes a stream of numbers. One 440 Hz
 * tone, a handful of cycles in view; the slider changes how often we
 * measure it. Every buffer is made by the real generator (@sonoglyph/dsp's
 * sine), including the audible reconstruction. */

const TONE_HZ = 440;
const VIEW_CYCLES = 3;
const VIEW_SEC = VIEW_CYCLES / TONE_HZ;
const W = 480;
const H = 170;
const MID = H / 2;

/** Selectable sample rates, coarse → the real thing. */
const RATES = [1_000, 2_000, 4_000, 8_000, 12_000, 24_000, 48_000];

const PLAY_SEC = 0.6;
const OUT_RATE = 48_000;

/** The wave itself, drawn dense enough to pass for continuous. */
const TRUE_WAVE = sine(TONE_HZ, VIEW_SEC, Math.round(480 / VIEW_SEC));

/** Linear reconstruction of a sampled sine back to 48 kHz — what you hear
 * when you press play at a coarse rate: connect-the-dots, made audible. */
function reconstruct(rate: number, amplitude: number): Float32Array {
  const src = sine(TONE_HZ, PLAY_SEC, rate, amplitude);
  const out = new Float32Array(Math.round(PLAY_SEC * OUT_RATE));
  const step = rate / OUT_RATE;
  for (let i = 0; i < out.length; i++) {
    const k = i * step;
    const k0 = Math.floor(k);
    const a = src[k0] ?? 0;
    const b = src[k0 + 1] ?? a;
    out[i] = a + (b - a) * (k - k0);
  }
  return fadeInPlace(out, OUT_RATE);
}

export function SamplingFigure() {
  const [rateIndex, setRateIndex] = useState(2); // 4 kHz — visibly discrete
  const [amplitude, setAmplitude] = useState(0.8);
  const [connect, setConnect] = useState(false);
  const play = useAudioPlayback();

  const rate = RATES[rateIndex]!;
  const dots = useMemo(() => {
    const count = Math.floor(VIEW_SEC * rate) + 1;
    const points: { x: number; y: number }[] = [];
    for (let k = 0; k < count; k++) {
      const t = k / rate;
      points.push({
        x: (t / VIEW_SEC) * W,
        y: MID - Math.sin(2 * Math.PI * TONE_HZ * t) * amplitude * (H / 2) * 0.9,
      });
    }
    return points;
  }, [rate, amplitude]);

  const sparse = dots.length <= 120; // stems only while they're readable
  const perCycle = rate / TONE_HZ;

  return (
    <FigureShell
      n={1}
      title="the measurement"
      meta={`signal: ${TONE_HZ} Hz sine · generator: @sonoglyph/dsp`}
      caption={
        <>
          (1) the pressure wave a microphone diaphragm rides — continuous, no numbers yet · (2) the
          samples: one measurement every 1/{rate.toLocaleString()} s, amplitude{' '}
          {amplitude.toFixed(2)} of full scale · playback reconstructs the tone from exactly these
          samples
        </>
      }
    >
      <ZoneLabel n={1}>air pressure, {VIEW_CYCLES} cycles · (2) its samples</ZoneLabel>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-44 w-full"
        aria-label={`A ${TONE_HZ} hertz sine wave sampled ${rate.toLocaleString()} times per second — ${Math.round(perCycle)} samples per cycle.`}
      >
        <line x1="0" y1={MID} x2={W} y2={MID} stroke="var(--line)" />
        <path
          d={samplesPath(
            TRUE_WAVE.map((v) => v * amplitude),
            W,
            H,
          )}
          fill="none"
          stroke="var(--ink-dim)"
          strokeWidth="1"
          opacity="0.55"
        />
        {connect && (
          <path
            d={dots
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ')}
            fill="none"
            stroke="var(--phosphor-dim)"
            strokeWidth="1.2"
          />
        )}
        {dots.map((p, i) => (
          <g key={i}>
            {sparse && (
              <line
                x1={p.x}
                y1={MID}
                x2={p.x}
                y2={p.y}
                stroke="var(--phosphor-dim)"
                strokeWidth="0.8"
                opacity="0.5"
              />
            )}
            <circle cx={p.x} cy={p.y} r={sparse ? 2.4 : 1.2} fill="var(--phosphor)" />
          </g>
        ))}
      </svg>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <Slider
          label="sample rate"
          value={rateIndex}
          min={0}
          max={RATES.length - 1}
          onChange={setRateIndex}
          format={(i) => `${(RATES[i]! / 1000).toLocaleString()} kHz`}
        />
        <Slider
          label="amplitude"
          value={amplitude}
          min={0.1}
          max={1}
          step={0.05}
          onChange={setAmplitude}
          format={(v) => v.toFixed(2)}
        />
        <Btn onClick={() => setConnect(!connect)}>{connect ? 'hide' : 'show'} connect-the-dots</Btn>
        <Btn primary onClick={() => play(reconstruct(rate, amplitude), OUT_RATE)}>
          ♪ play the samples
        </Btn>
      </div>

      <p className="mt-3 font-mono text-[11px] text-ink-dim">
        {perCycle.toLocaleString(undefined, { maximumFractionDigits: 1 })} samples per cycle ·{' '}
        {rate.toLocaleString()} numbers per second
        {perCycle < 6 && ' · getting coarse — chapter 02 says how coarse is too coarse'}
      </p>
    </FigureShell>
  );
}
