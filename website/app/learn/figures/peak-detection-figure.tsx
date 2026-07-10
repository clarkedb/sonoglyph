'use client';

import { useMemo, useState } from 'react';
import type { SpectrumInput } from '@sonoglyph/react';
import { SpectrumView } from '@sonoglyph/react';
import { detectPeaks, Fft, makeWindow, mix, tones, whiteNoise, windowSum } from '@sonoglyph/dsp';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Slider } from '../components/controls';
import { toDb } from '../components/svg';

/* Chapter 05 — a spectrum becomes a decision. One deliberately off-bin
 * tone plus a fixed 1209 Hz partner (a DTMF-shaped pair) and seeded noise,
 * analyzed by the real FFT and the real detectPeaks; the inset replays the
 * parabola fit the detector performs internally. */

const SAMPLE_RATE = 48_000;
const WINDOW_SIZE = 2048;
const BIN_HZ = SAMPLE_RATE / WINDOW_SIZE; // 23.4375 Hz per bin
const DUR = WINDOW_SIZE / SAMPLE_RATE;
const FIXED_HZ = 1209;
const MAX_FREQ = 1600;
const NOISE_SEED = 7;

const HANN = makeWindow('hann', WINDOW_SIZE);
const NORM = windowSum(HANN) / 2;
const FFT = new Fft(WINDOW_SIZE);

/** Natural-log magnitude → dB (the fit runs in ln; the plot reads in dB). */
const LN_TO_DB = 20 / Math.LN10;

/* Zoom inset geometry. */
const ZW = 480;
const ZH = 132;
const Z_TOP = 22;
const Z_BOT = 102;

interface ZoomData {
  k: number;
  binCenterHz: number;
  fitHz: number;
  bars: { bin: number; x: number; y: number }[];
  /** The three bins the parabola is fitted through (subset of bars). */
  fitDots: { x: number; y: number }[];
  curve: string;
  xBin: number;
  xFit: number;
}

export function PeaksFigure() {
  const [trueHz, setTrueHz] = useState(700.5); // between bin centers on purpose
  const [noiseAmp, setNoiseAmp] = useState(0.06);

  const analysis = useMemo(() => {
    const signal = mix(
      tones([{ frequencyHz: trueHz }, { frequencyHz: FIXED_HZ, amplitude: 0.5 }], DUR, SAMPLE_RATE),
      whiteNoise(DUR, SAMPLE_RATE, noiseAmp, NOISE_SEED),
    );
    const windowed = new Float32Array(WINDOW_SIZE);
    for (let i = 0; i < WINDOW_SIZE; i++) windowed[i] = signal[i]! * HANN[i]!;
    const magnitudes = FFT.magnitudes(windowed, NORM);
    const peaks = detectPeaks(magnitudes, { binHz: BIN_HZ, maxPeaks: 6 });

    // Which detected peak is the slider's tone? Nearest one, within a bin.
    let tracked = -1;
    let bestDist = BIN_HZ;
    peaks.forEach((p, i) => {
      const d = Math.abs(p.frequencyHz - trueHz);
      if (d < bestDist) {
        bestDist = d;
        tracked = i;
      }
    });

    // Rebuild the detector's parabola fit around the strongest low peak so
    // the inset can draw what detectPeaks only reports the vertex of.
    let zoom: ZoomData | null = null;
    const low = peaks.find((p) => p.frequencyHz < 1000);
    if (low && low.bin >= 2 && low.bin + 2 < magnitudes.length) {
      const k = low.bin;
      const ln = (i: number) => Math.log(Math.max(magnitudes[i] ?? 0, 1e-12));
      const a = ln(k - 1);
      const b = ln(k);
      const c = ln(k + 1);

      const fLo = (k - 2.5) * BIN_HZ;
      const xOf = (hz: number) => ((hz - fLo) / (5 * BIN_HZ)) * ZW;
      const bins = [k - 2, k - 1, k, k + 1, k + 2];
      const dbs = bins.map((j) => toDb(magnitudes[j] ?? 0));
      const vertexDb = toDb(low.magnitude);
      const top = Math.max(...dbs, vertexDb) + 3;
      const bot = Math.max(Math.min(...dbs) - 4, top - 60);
      const yOf = (db: number) =>
        Math.min(Z_BOT, Math.max(Z_TOP, Z_TOP + ((top - db) / (top - bot)) * (Z_BOT - Z_TOP)));

      const bars = bins.map((j, i) => ({ bin: j, x: xOf(j * BIN_HZ), y: yOf(dbs[i]!) }));

      // y(x) = b + ((c−a)/2)x + ((a+c)/2 − b)x², the parabola through
      // (−1, a), (0, b), (1, c) in ln magnitude; its vertex is the fit.
      const pts: string[] = [];
      for (let i = 0; i <= 32; i++) {
        const x = -1 + i / 16;
        const lnY = b + 0.5 * (c - a) * x + ((a + c) / 2 - b) * x * x;
        pts.push(
          `${i === 0 ? 'M' : 'L'}${xOf((k + x) * BIN_HZ).toFixed(1)} ${yOf(lnY * LN_TO_DB).toFixed(1)}`,
        );
      }

      zoom = {
        k,
        binCenterHz: k * BIN_HZ,
        fitHz: low.frequencyHz,
        bars,
        fitDots: bars.slice(1, 4).map(({ x, y }) => ({ x, y })),
        curve: pts.join(' '),
        xBin: xOf(k * BIN_HZ),
        xFit: xOf(low.frequencyHz),
      };
    }

    return { magnitudes, peaks, tracked, zoom };
  }, [trueHz, noiseAmp]);

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

  const { zoom } = analysis;

  return (
    <FigureShell
      n={1}
      title="sub-bin sight"
      meta={`fft: ${WINDOW_SIZE} pt · hann · ${BIN_HZ.toFixed(1)} Hz/bin · detector: @sonoglyph/dsp`}
      caption={
        <>
          (1) the spectrum of one off-bin tone near 700 Hz plus a fixed 1209 Hz partner, with the
          real detector’s peaks marked — hover for exact values · (2) the five bins around the low
          peak: bars are what the FFT reports, the curve is the parabola fitted through the top
          three in log magnitude. Drag the true frequency and watch the interpolated readout track
          it between bin centers; raise the noise until false peaks appear.
        </>
      }
    >
      <ZoneLabel n={1}>
        spectrum · 0–{(MAX_FREQ / 1000).toFixed(1)} kHz · detected peaks marked
      </ZoneLabel>
      <SpectrumView
        read={() => frame}
        guides={[]}
        maxFreq={MAX_FREQ}
        className="mt-2 block h-[200px] w-full cursor-crosshair rounded-sm bg-canvas"
        ariaLabel="Frequency spectrum of the two tones plus noise, with detected peaks marked."
      />

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <Slider
          label="true frequency"
          value={trueHz}
          min={690}
          max={710}
          step={0.5}
          onChange={setTrueHz}
          format={(v) => `${v.toFixed(1)} Hz`}
        />
        <Slider
          label="noise"
          value={noiseAmp}
          min={0}
          max={0.4}
          step={0.02}
          onChange={setNoiseAmp}
          format={(v) => (v === 0 ? 'off' : v.toFixed(2))}
        />
      </div>

      {zoom && (
        <div className="mt-5">
          <ZoneLabel n={2}>zoom · five bins around the low peak</ZoneLabel>
          <svg
            viewBox={`0 0 ${ZW} ${ZH}`}
            className="mt-2 w-full rounded-sm bg-canvas"
            aria-label={`Zoom on five FFT bins: the raw peak bin ${zoom.k} centers on ${zoom.binCenterHz.toFixed(1)} hertz, and the parabola fit places the peak at ${zoom.fitHz.toFixed(1)} hertz.`}
          >
            <line x1="0" y1={Z_BOT} x2={ZW} y2={Z_BOT} stroke="var(--line)" />
            {zoom.bars.map((bar) => (
              <g key={bar.bin}>
                <rect
                  x={bar.x - 6}
                  y={bar.y}
                  width={12}
                  height={Math.max(0, Z_BOT - bar.y)}
                  fill="var(--ink-dim)"
                  opacity="0.45"
                />
                <text
                  x={bar.x}
                  y={Z_BOT + 12}
                  textAnchor="middle"
                  fill="var(--ink-dim)"
                  fontSize="8.5"
                  fontFamily="var(--font-mono)"
                >
                  {bar.bin}
                </text>
              </g>
            ))}
            <path d={zoom.curve} fill="none" stroke="var(--phosphor)" strokeWidth="1.4" />
            {zoom.fitDots.map((dot, i) => (
              <circle key={i} cx={dot.x} cy={dot.y} r="2" fill="var(--phosphor-dim)" />
            ))}
            <line
              x1={zoom.xBin}
              y1={Z_TOP - 6}
              x2={zoom.xBin}
              y2={Z_BOT}
              stroke="var(--danger)"
              strokeDasharray="1.5 3"
            />
            <line
              x1={zoom.xFit}
              y1={Z_TOP - 6}
              x2={zoom.xFit}
              y2={Z_BOT}
              stroke="var(--phosphor)"
              strokeDasharray="5 3"
            />
            <text x="4" y="10" fill="var(--danger)" fontSize="8.5" fontFamily="var(--font-mono)">
              bin {zoom.k} · {zoom.binCenterHz.toFixed(1)} Hz
            </text>
            <text
              x={ZW - 4}
              y="10"
              textAnchor="end"
              fill="var(--phosphor)"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
            >
              fit → {zoom.fitHz.toFixed(1)} Hz
            </text>
          </svg>
        </div>
      )}

      <div aria-live="polite" className="mt-4 overflow-x-auto">
        <table className="w-full max-w-xl border-collapse font-mono text-xs">
          <thead>
            <tr className="text-left text-ink-dim">
              <th className="border-b border-line py-1 pr-4 font-normal">bin</th>
              <th className="border-b border-line py-1 pr-4 font-normal">bin center</th>
              <th className="border-b border-line py-1 pr-4 font-normal">interpolated</th>
              <th className="border-b border-line py-1 font-normal">error vs true</th>
            </tr>
          </thead>
          <tbody className="text-ink tabular-nums">
            {analysis.peaks.map((p, i) => (
              <tr key={p.bin}>
                <td className="py-1 pr-4">{p.bin}</td>
                <td className="py-1 pr-4">{(p.bin * BIN_HZ).toFixed(1)} Hz</td>
                <td className="py-1 pr-4 text-phosphor">{p.frequencyHz.toFixed(1)} Hz</td>
                <td className="py-1">
                  {i === analysis.tracked
                    ? `${p.frequencyHz - trueHz >= 0 ? '+' : ''}${(p.frequencyHz - trueHz).toFixed(2)} Hz`
                    : '—'}
                </td>
              </tr>
            ))}
            {analysis.peaks.length === 0 && (
              <tr>
                <td colSpan={4} className="py-1 text-ink-dim">
                  no peaks above the floor
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </FigureShell>
  );
}
