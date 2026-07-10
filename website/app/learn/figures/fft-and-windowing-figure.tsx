'use client';

import { useMemo, useState } from 'react';
import type { WindowName } from '@sonoglyph/core';
import { Fft, makeWindow, tones, WINDOW_NAMES, windowSum } from '@sonoglyph/dsp';
import { SpectrumView } from '@sonoglyph/react';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Btn, Segmented, Select, Slider } from '../components/controls';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';

/* Chapter 03 — the resolution tradeoff, made touchable. Two equal tones a
 * slider-set Δ apart go through the real engine path: makeWindow, a
 * sample-wise multiply, then Fft.magnitudes — the same code the pipeline
 * runs on microphone frames. */

const RATE = 48_000;
const BASE_HZ = 697; // DTMF row 1 — the tone every phone key "1" starts with
const DTMF_DELTA = 73; // 770 − 697: the real low-group spacing
const AMPLITUDE = 0.4;

const SIZES = [512, 1024, 2048, 4096, 8192];
const durationMs = (size: number) => (size / RATE) * 1000;
const binHzOf = (size: number) => RATE / size;

const SIZE_OPTIONS = SIZES.map((size) => ({
  value: String(size),
  label: `${size} · ${durationMs(size).toFixed(1)} ms · ${binHzOf(size).toFixed(1)} Hz/bin`,
}));

const WINDOW_OPTIONS = WINDOW_NAMES.map((name) => ({ value: name, label: name }));

/* Window-shape inset. The shape is size-independent, so draw it at a fixed
 * resolution — still the real makeWindow. */
const INSET_W = 480;
const INSET_H = 60;
const INSET_POINTS = 240;

const PLAY_SEC = 0.5;

export function WindowingFigure() {
  const [delta, setDelta] = useState(DTMF_DELTA);
  const [windowSize, setWindowSize] = useState(2048);
  const [windowName, setWindowName] = useState<WindowName>('hann');
  const play = useAudioPlayback();

  const pair = useMemo(
    () => [
      { frequencyHz: BASE_HZ, amplitude: AMPLITUDE },
      { frequencyHz: BASE_HZ + delta, amplitude: AMPLITUDE },
    ],
    [delta],
  );

  const frame = useMemo(() => {
    const window = makeWindow(windowName, windowSize);
    const signal = tones(pair, windowSize / RATE, RATE); // exactly windowSize samples
    const windowed = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) windowed[i] = signal[i]! * window[i]!;
    const magnitudes = new Fft(windowSize).magnitudes(windowed, windowSum(window) / 2);
    return {
      spectrum: { magnitudes, binHz: binHzOf(windowSize), window: windowName },
      peaks: null,
      sampleRate: RATE,
    };
  }, [pair, windowSize, windowName]);

  const shapePath = useMemo(() => {
    const w = makeWindow(windowName, INSET_POINTS);
    const parts: string[] = [];
    for (let i = 0; i < INSET_POINTS; i++) {
      const x = (i / (INSET_POINTS - 1)) * INSET_W;
      const y = INSET_H - 4 - w[i]! * (INSET_H - 8);
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }, [windowName]);

  const binHz = binHzOf(windowSize);
  const binsApart = delta / binHz;
  const resolved = binsApart >= 2;

  return (
    <FigureShell
      n={1}
      title="the resolution tradeoff"
      meta="engine: @sonoglyph/dsp Fft · 48 kHz"
      caption={
        <>
          (1) the magnitude spectrum of two equal tones, {BASE_HZ} Hz and {BASE_HZ + delta} Hz — Δ ={' '}
          {delta} Hz apart{delta === DTMF_DELTA && ' (the real DTMF spacing)'} — computed by the
          pipeline’s own FFT; the vertical guides mark where the tones truly are. Hover the plot for
          exact frequency and dB at any bin. · (2) the {windowName} window each block is multiplied
          by before the transform. Shrink the window and watch the two spikes fatten into one;
          switch to rectangular and watch the leakage skirts rise.
        </>
      }
    >
      <ZoneLabel n={1}>
        spectrum · two tones, Δ = {delta} Hz · {windowSize}-sample window
      </ZoneLabel>
      <div className="mt-2">
        {/* SpectrumView polls read() from its draw loop, which re-captures
            this closure on every render — it always sees the latest frame. */}
        <SpectrumView
          read={() => frame}
          guides={[BASE_HZ, BASE_HZ + delta]}
          maxFreq={1600}
          ariaLabel={`Magnitude spectrum of two tones at ${BASE_HZ} and ${BASE_HZ + delta} hertz, analyzed with a ${windowSize}-sample ${windowName} window.`}
        />
      </div>

      <div className="mt-4">
        <ZoneLabel n={2}>the window function itself</ZoneLabel>
        <svg
          viewBox={`0 0 ${INSET_W} ${INSET_H}`}
          preserveAspectRatio="none"
          className="mt-1 h-16 w-full"
          aria-label={`The ${windowName} window shape: the gain applied to each sample of the analysis block before the FFT.`}
        >
          <line x1="0" y1={INSET_H - 4} x2={INSET_W} y2={INSET_H - 4} stroke="var(--line)" />
          <path d={shapePath} fill="none" stroke="var(--phosphor-dim)" strokeWidth="1.4" />
          <text
            x={INSET_W / 2}
            y={12}
            textAnchor="middle"
            fill="var(--ink-dim)"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
          >
            {windowName}
          </text>
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <Slider
          label="tone spacing Δ"
          value={delta}
          min={20}
          max={300}
          step={5}
          onChange={setDelta}
          format={(v) => `${v} Hz`}
        />
        <Select
          label="window size"
          value={String(windowSize)}
          options={SIZE_OPTIONS}
          onChange={(v) => setWindowSize(Number(v))}
        />
        <Segmented
          label="window function"
          value={windowName}
          options={WINDOW_OPTIONS}
          onChange={setWindowName}
        />
        <Btn primary onClick={() => play(fadeInPlace(tones(pair, PLAY_SEC, RATE), RATE), RATE)}>
          ♪ play the pair
        </Btn>
      </div>

      <p className="mt-3 font-mono text-[11px] text-ink-dim" aria-live="polite">
        {windowSize} samples · {durationMs(windowSize).toFixed(1)} ms of signal · {binHz.toFixed(1)}{' '}
        Hz/bin · Δ = {delta} Hz ≈ {binsApart.toFixed(1)} bins →{' '}
        {resolved ? 'resolved' : 'merged — one fat peak'}
      </p>
    </FigureShell>
  );
}
