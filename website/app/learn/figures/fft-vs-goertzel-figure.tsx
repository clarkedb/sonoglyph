'use client';

import { useMemo, useState } from 'react';
import {
  detectPeaks,
  Fft,
  goertzelMagnitude,
  makeWindow,
  mix,
  tones,
  whiteNoise,
  windowSum,
} from '@sonoglyph/dsp';
import type { SpectralPeak } from '@sonoglyph/core';
import { HIGH_GROUP, keyFor, LOW_GROUP } from '@sonoglyph/plugin-dtmf';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Btn, Slider } from '../components/controls';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';
import { spectrumPath } from '../components/svg';

/* Chapter 09 — the same 2048-sample block asked two ways. The pair for
 * key '5' plays under an increasingly loud chord; the FFT side keeps a
 * ranked 4-peak shortlist (what a busy decoder pares down to), the
 * Goertzel side just measures the eight frequencies it cares about. The
 * failure mode this demonstrates is architectural: ranking loses to loud
 * neighbors, probing doesn't. (Verified against the real code — see the
 * chapter text for the honest caveats.) */

const SAMPLE_RATE = 48_000;
const N = 2048;
const DUR = N / SAMPLE_RATE;
const BIN_HZ = SAMPLE_RATE / N;
const TOL = 0.02;
const MAX_PEAKS = 4;
const NOISE_AMP = 0.05;
const NOISE_SEED = 3;
const PAIR = { lowHz: 770, highHz: 1336, symbol: '5' };
/** A C-major stack — loud, musical, integer-related, and none of it DTMF. */
const CHORD = [523, 1046, 1568, 2093];
const NOMINALS = [...LOW_GROUP, ...HIGH_GROUP];

const HANN = makeWindow('hann', N);
const NORM = windowSum(HANN) / 2;
const FFT = new Fft(N);

const MAX_FREQ = 2_400;
const PW = 232;
const PH = 130;

function buildBlock(interferers: number): Float32Array {
  return mix(
    tones(
      [
        { frequencyHz: PAIR.lowHz, amplitude: 0.35 },
        { frequencyHz: PAIR.highHz, amplitude: 0.35 },
        ...CHORD.slice(0, interferers).map((frequencyHz) => ({ frequencyHz, amplitude: 1 })),
      ],
      DUR,
      SAMPLE_RATE,
    ),
    whiteNoise(DUR, SAMPLE_RATE, NOISE_AMP, NOISE_SEED),
  );
}

/** The FFT strategy's pair test over its ranked shortlist. */
function decodeFromPeaks(peaks: SpectralPeak[]): string | null {
  const find = (group: readonly number[]) => {
    for (const peak of peaks) {
      for (const nominal of group) {
        if (Math.abs(peak.frequencyHz - nominal) <= nominal * TOL) return nominal;
      }
    }
    return null;
  };
  const low = find(LOW_GROUP);
  const high = find(HIGH_GROUP);
  return low !== null && high !== null ? (keyFor(low, high) ?? null) : null;
}

/** The Goertzel strategy: strongest probe per group, with 2× dominance. */
function decodeFromProbes(probes: { hz: number; magnitude: number }[]): string | null {
  const rank = (group: readonly number[]) => {
    const ranked = probes
      .filter((p) => (group as number[]).includes(p.hz))
      .sort((a, b) => b.magnitude - a.magnitude);
    return ranked[0]!.magnitude >= 2 * ranked[1]!.magnitude ? ranked[0]!.hz : null;
  };
  const low = rank(LOW_GROUP);
  const high = rank(HIGH_GROUP);
  return low !== null && high !== null ? (keyFor(low, high) ?? null) : null;
}

export function GoertzelFigure() {
  const [interferers, setInterferers] = useState(0);
  const play = useAudioPlayback();

  const run = useMemo(() => {
    const block = buildBlock(interferers);

    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) windowed[i] = block[i]! * HANN[i]!;
    const magnitudes = FFT.magnitudes(windowed, NORM);
    const peaks = detectPeaks(magnitudes, { binHz: BIN_HZ, maxPeaks: MAX_PEAKS });
    const fftReads = decodeFromPeaks(peaks);

    const probes = NOMINALS.map((hz) => ({
      hz,
      magnitude: goertzelMagnitude(block, hz, SAMPLE_RATE),
    }));
    const goertzelReads = decodeFromProbes(probes);

    return { magnitudes, peaks, fftReads, probes, goertzelReads };
  }, [interferers]);

  const probeMax = Math.max(...run.probes.map((p) => p.magnitude), 1e-6);

  return (
    <FigureShell
      n={1}
      title="two ways to ask"
      meta={`one ${N}-sample block · 770 + 1336 Hz under a chord · @sonoglyph/dsp`}
      caption={
        <>
          (1) the FFT measures everything, then keeps a ranked shortlist of {MAX_PEAKS} peaks (dots)
          and hunts for a valid pair among them — a loud enough chord crowds the pair off the list ·
          (2) eight Goertzel probes measure exactly the eight frequencies a DTMF decoder cares
          about; the chord isn’t one of them, so nothing changes. Same block of samples on both
          sides.
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <Slider
          label="interfering chord notes"
          value={interferers}
          min={0}
          max={4}
          step={1}
          onChange={setInterferers}
          format={(v) => (v === 0 ? 'none' : `${v} · ~3× the pair`)}
        />
        <Btn
          primary
          onClick={() => play(fadeInPlace(buildBlock(interferers), SAMPLE_RATE), SAMPLE_RATE)}
        >
          ♪ play the block
        </Btn>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {/* (1) Measure everything */}
        <div>
          <ZoneLabel n={1}>measure everything · fft + top-{MAX_PEAKS} peaks</ZoneLabel>
          <svg
            viewBox={`0 0 ${PW} ${PH}`}
            preserveAspectRatio="none"
            className="mt-2 h-36 w-full rounded-sm bg-canvas"
            aria-hidden
          >
            <line x1="0" y1={PH - 1} x2={PW} y2={PH - 1} stroke="var(--line)" />
            <path
              d={spectrumPath(run.magnitudes, BIN_HZ, MAX_FREQ, PW, PH)}
              fill="none"
              stroke="var(--phosphor-dim)"
              strokeWidth="1"
            />
            {run.peaks.map((p) => (
              <circle
                key={p.bin}
                cx={(p.frequencyHz / MAX_FREQ) * PW}
                cy={(Math.max(-90, 20 * Math.log10(p.magnitude + 1e-9)) / -90) * PH}
                r="2.5"
                fill="var(--phosphor)"
              />
            ))}
          </svg>
          <p className="mt-2 font-mono text-xs" aria-live="polite">
            {run.fftReads ? (
              <span className="text-phosphor">reads: {run.fftReads}</span>
            ) : (
              <span className="text-danger">reads: — · pair not in the shortlist</span>
            )}
          </p>
        </div>

        {/* (2) Ask eight questions */}
        <div>
          <ZoneLabel n={2}>ask eight questions · goertzel probes</ZoneLabel>
          <div className="mt-2 flex h-36 flex-col justify-between rounded-sm bg-canvas p-2">
            {run.probes.map((probe) => {
              const winner =
                run.goertzelReads !== null && (probe.hz === PAIR.lowHz || probe.hz === PAIR.highHz);
              return (
                <div key={probe.hz} className="flex items-center gap-2">
                  <span className="w-9 text-right font-mono text-[9px] text-ink-dim tabular-nums">
                    {probe.hz}
                  </span>
                  <div className="h-2 flex-1">
                    <div
                      className={winner ? 'h-full bg-phosphor' : 'h-full bg-ink-dim/40'}
                      style={{ width: `${Math.max(1, (probe.magnitude / probeMax) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-xs" aria-live="polite">
            {run.goertzelReads ? (
              <span className="text-phosphor">reads: {run.goertzelReads}</span>
            ) : (
              <span className="text-danger">reads: — · no dominant pair</span>
            )}
          </p>
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] text-ink-dim">
        work per block: 2048-point FFT (~11·2048 butterfly steps) + peak-picking vs 8 probes × 2048
        samples — same order of arithmetic, different questions
      </p>
    </FigureShell>
  );
}
