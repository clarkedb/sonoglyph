'use client';

import { useMemo, useState } from 'react';
import type { SpectrumInput } from '@sonoglyph/react';
import { SpectrumView } from '@sonoglyph/react';
import { detectPeaks, Fft, makeWindow, mix, tones, whiteNoise, windowSum } from '@sonoglyph/dsp';
import type { ToneSpec } from '@sonoglyph/dsp';
import { FigureShell, ZoneLabel } from '../../learn/components/figure-shell';
import { Btn, Slider } from '../../learn/components/controls';
import { fadeInPlace, useAudioPlayback } from '../../learn/components/use-audio';
import { samplesPath } from '../../learn/components/svg';

/* The tone playground: dial in up to three sines and noise, watch the real
 * spectrum respond as you drag. Analysis is one 4096-sample window through
 * the same FFT + peak detector the engine runs; audio is the same recipe,
 * one second long. */

const SAMPLE_RATE = 48_000;
const WINDOW_SIZE = 4096;
const BIN_HZ = SAMPLE_RATE / WINDOW_SIZE;
const MAX_FREQ = 4_500;
const NOISE_SEED = 3;

const HANN = makeWindow('hann', WINDOW_SIZE);
const NORM = windowSum(HANN) / 2;
const FFT = new Fft(WINDOW_SIZE);

interface ToneRow {
  frequencyHz: number;
  amplitude: number;
}

const INITIAL: ToneRow[] = [
  { frequencyHz: 440, amplitude: 0.7 },
  { frequencyHz: 880, amplitude: 0.35 },
  { frequencyHz: 1209, amplitude: 0 },
];

function buildSignal(rows: ToneRow[], noise: number, durationSec: number): Float32Array {
  const specs: ToneSpec[] = rows.filter((r) => r.amplitude > 0);
  const clean = tones(specs, durationSec, SAMPLE_RATE);
  if (noise <= 0) return clean;
  return mix(clean, whiteNoise(durationSec, SAMPLE_RATE, noise, NOISE_SEED));
}

export function ToneDemo() {
  const [rows, setRows] = useState<ToneRow[]>(INITIAL);
  const [noise, setNoise] = useState(0);
  const play = useAudioPlayback();

  const analysis = useMemo(() => {
    const signal = buildSignal(rows, noise, WINDOW_SIZE / SAMPLE_RATE);
    const windowed = new Float32Array(WINDOW_SIZE);
    for (let i = 0; i < WINDOW_SIZE; i++) windowed[i] = signal[i]! * HANN[i]!;
    const magnitudes = FFT.magnitudes(windowed, NORM);
    const peaks = detectPeaks(magnitudes, { binHz: BIN_HZ, maxPeaks: 6 });
    return { signal, magnitudes, peaks };
  }, [rows, noise]);

  // SpectrumView polls read() from its own animation loop; the closure
  // hands it the latest memoized frame.
  const frame: SpectrumInput = useMemo(
    () => ({
      spectrum: { magnitudes: analysis.magnitudes, binHz: BIN_HZ, window: 'hann' },
      peaks: { peaks: analysis.peaks },
      sampleRate: SAMPLE_RATE,
    }),
    [analysis],
  );

  const setRow = (i: number, patch: Partial<ToneRow>) =>
    setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <FigureShell
      n={1}
      title="tone playground"
      meta={`fft: ${WINDOW_SIZE} pt · hann · ${BIN_HZ.toFixed(1)} Hz/bin · @sonoglyph/dsp`}
      caption="(1) three oscillators and a noise source, summed · (2) the first 10 ms of the signal · (3) FFT magnitudes with detected peaks — hover for exact values. An amplitude of zero switches an oscillator off."
    >
      <ZoneLabel n={1}>oscillators</ZoneLabel>
      <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-sm border border-line/60 bg-void/40 p-3">
            <p className="font-mono text-[11px] text-phosphor-dim">osc {i + 1}</p>
            <div className="mt-2 flex flex-col gap-2">
              <Slider
                label="frequency"
                value={row.frequencyHz}
                min={50}
                max={4000}
                step={10}
                onChange={(v) => setRow(i, { frequencyHz: v })}
                format={(v) => `${v} Hz`}
              />
              <Slider
                label="amplitude"
                value={row.amplitude}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setRow(i, { amplitude: v })}
                format={(v) => (v === 0 ? 'off' : v.toFixed(2))}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <Slider
          label="noise"
          value={noise}
          min={0}
          max={0.5}
          step={0.02}
          onChange={setNoise}
          format={(v) => (v === 0 ? 'off' : v.toFixed(2))}
        />
        <Btn
          primary
          onClick={() => play(fadeInPlace(buildSignal(rows, noise, 1), SAMPLE_RATE), SAMPLE_RATE)}
        >
          ♪ play 1 s
        </Btn>
      </div>

      <div className="mt-5">
        <ZoneLabel n={2}>signal · first 10 ms</ZoneLabel>
        <svg
          viewBox="0 0 480 90"
          preserveAspectRatio="none"
          className="mt-2 h-24 w-full rounded-sm bg-canvas"
          aria-hidden
        >
          <line x1="0" y1="45" x2="480" y2="45" stroke="var(--line)" />
          <path
            d={samplesPath(analysis.signal.subarray(0, 480), 480, 90)}
            fill="none"
            stroke="var(--phosphor)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-5">
        <ZoneLabel n={3}>spectrum · 0–{(MAX_FREQ / 1000).toFixed(1)} kHz</ZoneLabel>
        <SpectrumView
          read={() => frame}
          maxFreq={MAX_FREQ}
          className="mt-2 block h-[220px] w-full cursor-crosshair rounded-sm bg-canvas"
          ariaLabel="Frequency spectrum of the generated tones, with detected peaks marked."
        />
      </div>

      <p aria-live="polite" className="mt-3 font-mono text-[11px] text-ink-dim">
        peaks:{' '}
        {analysis.peaks.length === 0
          ? 'none above the floor'
          : analysis.peaks
              .map((p) => `${p.frequencyHz.toFixed(1)} Hz (${p.magnitude.toFixed(2)})`)
              .join(' · ')}
      </p>
    </FigureShell>
  );
}
