'use client';

import { useMemo, useState } from 'react';
import { Fft, makeWindow, tones, windowSum, type ToneSpec } from '@sonoglyph/dsp';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Btn, Readout, Segmented, Slider } from '../components/controls';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';
import { samplesPath, spectrumPath } from '../components/svg';

/* Chapter 04 — the overtone stack. One fixed 220 Hz fundamental; the
 * presets are classic harmonic recipes, summed by the real generator
 * (@sonoglyph/dsp's tones) and analyzed by the real FFT. The brightness
 * knob scales harmonic k by brightness^(k−1), so at 0 every recipe
 * collapses to the pure sine. */

const F0 = 220;
const HARMONIC_COUNT = 8;
const RATE = 48_000;
const PLAY_SEC = 0.8;
const VIEW_CYCLES = 3;

const W = 480;
const H = 110;

const FFT_SIZE = 4096;
const MAX_HZ = 2200;
const FFT = new Fft(FFT_SIZE);
const WINDOW = makeWindow('hann', FFT_SIZE);
const NORM = windowSum(WINDOW) / 2;
const BIN_HZ = RATE / FFT_SIZE;

type RecipeId = 'sine' | 'square' | 'saw' | 'triangle' | 'organ';

/** Amplitude of harmonic k (k = 1 is the fundamental) for each recipe. */
const RECIPES: Record<RecipeId, (k: number) => number> = {
  sine: (k) => (k === 1 ? 1 : 0),
  square: (k) => (k % 2 === 1 ? 1 / k : 0),
  saw: (k) => 1 / k,
  triangle: (k) => (k % 2 === 1 ? 1 / (k * k) : 0),
  organ: (k) => [1, 0.6, 0.3, 0.15][k - 1] ?? 0,
};

const RECIPE_OPTIONS: { value: RecipeId; label: string }[] = [
  { value: 'sine', label: 'pure sine' },
  { value: 'square', label: 'square-ish' },
  { value: 'saw', label: 'sawtooth-ish' },
  { value: 'triangle', label: 'triangle-ish' },
  { value: 'organ', label: 'organ' },
];

export function HarmonicsFigure() {
  const [recipe, setRecipe] = useState<RecipeId>('saw');
  const [brightness, setBrightness] = useState(1);
  const play = useAudioPlayback();

  const { buffer, wavePath, specPath, ampReadout } = useMemo(() => {
    const specs: ToneSpec[] = [];
    const amps: number[] = [];
    for (let k = 1; k <= HARMONIC_COUNT; k++) {
      // brightness^0 = 1, so the fundamental never dims.
      const amplitude = RECIPES[recipe](k) * Math.pow(brightness, k - 1);
      if (amplitude >= 0.01) {
        specs.push({ frequencyHz: k * F0, amplitude });
        amps.push(amplitude);
      }
    }
    const buffer = tones(specs, PLAY_SEC, RATE);

    // Normalize to ±0.9 by the buffer's actual extreme, so a tall stack
    // never clips and a lone sine still fills the plot.
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]!));
    const scale = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < buffer.length; i++) buffer[i]! *= scale;

    const wave = buffer.subarray(0, Math.round((VIEW_CYCLES / F0) * RATE));

    const windowed = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) windowed[i] = buffer[i]! * WINDOW[i]!;
    const magnitudes = FFT.magnitudes(windowed, NORM);

    return {
      buffer,
      wavePath: samplesPath(wave, W, H, 1),
      specPath: spectrumPath(magnitudes, BIN_HZ, MAX_HZ, W, H),
      ampReadout: amps.map((a) => a.toFixed(2)).join(' · '),
    };
  }, [recipe, brightness]);

  return (
    <FigureShell
      n={1}
      title="the overtone stack"
      meta={`f₀ = ${F0} Hz · harmonics 1–8 · synth + FFT: @sonoglyph/dsp`}
      caption={
        <>
          (1) three cycles of the summed waveform — every recipe repeats {F0} times per second, so
          the pitch never moves · (2) the same buffer through the real FFT (4,096-sample hann
          window); the faint guides mark k·{F0} Hz · brightness scales harmonic k by
          brightness^(k−1), so at 0 every recipe collapses to the pure sine · press play after each
          switch: same note, different voice
        </>
      }
    >
      <ZoneLabel n={1}>waveform, {VIEW_CYCLES} cycles of the sum</ZoneLabel>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-28 w-full"
        aria-label={`Three cycles of a ${F0} hertz tone built from the ${recipe} harmonic recipe.`}
      >
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--line)" />
        <path d={wavePath} fill="none" stroke="var(--phosphor)" strokeWidth="1.2" />
      </svg>

      <div className="mt-4">
        <ZoneLabel n={2}>spectrum, dB to {MAX_HZ.toLocaleString()} Hz</ZoneLabel>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-28 w-full"
        aria-label={`Spectrum of the same tone: one spike per harmonic at multiples of ${F0} hertz, heights following the ${recipe} recipe.`}
      >
        {Array.from({ length: HARMONIC_COUNT }, (_, i) => {
          const k = i + 1;
          const x = ((k * F0) / MAX_HZ) * W;
          return (
            <g key={k}>
              <line x1={x} y1={12} x2={x} y2={H} stroke="var(--grid-major)" />
              <text
                x={x}
                y={8}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="8.5"
                fill="var(--ink-dim)"
              >
                {k}
              </text>
            </g>
          );
        })}
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
        <path d={specPath} fill="none" stroke="var(--phosphor)" strokeWidth="1" />
      </svg>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <Segmented label="recipe" value={recipe} options={RECIPE_OPTIONS} onChange={setRecipe} />
        <Slider
          label="brightness"
          value={brightness}
          min={0}
          max={1}
          step={0.05}
          onChange={setBrightness}
          format={(v) => v.toFixed(2)}
        />
        <Btn primary onClick={() => play(fadeInPlace(new Float32Array(buffer), RATE), RATE)}>
          ♪ play the stack
        </Btn>
        <div aria-live="polite">
          <Readout label="stack · relative amplitudes" value={ampReadout} />
        </div>
      </div>
    </FigureShell>
  );
}
