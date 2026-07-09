import { useRef, useState } from 'react';
import type { WindowName } from '@sonoglyph/core';
import { WINDOW_NAMES } from '@sonoglyph/dsp';
import { HIGH_GROUP, LOW_GROUP } from '@sonoglyph/plugin-dtmf';
import { scaleCanvas, useAnimationFrame, useController, useControllerTick } from '../hooks.ts';
import { Panel } from './Panel.tsx';

const EXPLAINER =
  'The FFT answers "which frequencies is this signal made of?" — amplitude (in dB) against ' +
  'frequency for the most recent analysis window. Detected peaks are marked, and the faint ' +
  'vertical guides are the eight DTMF frequencies. The window controls are the central DSP ' +
  'tradeoff made touchable: a bigger window resolves closer-together frequencies (narrower ' +
  'spikes) but smears events in time, so fast key presses blur together. A smaller window ' +
  'reacts faster but the spikes fatten until neighbors merge. The window function shapes the ' +
  'skirt around each spike — switch to rectangular and watch the leakage spread. Hover for ' +
  'exact values.';

const DB_FLOOR = -90;
const WINDOW_SIZES = [512, 1024, 2048, 4096, 8192];
const MAX_FREQ_CHOICES = [2500, 5000, 12000, 24000];

const toDb = (mag: number) => Math.max(DB_FLOOR, 20 * Math.log10(mag + 1e-9));

const LABEL = 'flex items-center gap-1.5 text-xs text-muted';

export function SpectrumPanel() {
  const controller = useController();
  useControllerTick();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const [maxFreq, setMaxFreq] = useState(2500);

  const { windowSize, window: windowName, sampleRate } = controller.status;

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = scaleCanvas(canvas);
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const freqLimit = Math.min(maxFreq, sampleRate / 2);
    const xOf = (hz: number) => (hz / freqLimit) * width;
    const yOf = (db: number) => ((db - 0) / (DB_FLOOR - 0)) * height;

    // DTMF frequency guides.
    ctx.strokeStyle = '#2a3344';
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px system-ui';
    for (const hz of [...LOW_GROUP, ...HIGH_GROUP]) {
      if (hz > freqLimit) continue;
      const x = xOf(hz);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(String(hz), x + 2, 10);
    }

    // dB gridlines.
    ctx.fillStyle = '#4a5568';
    for (let db = -20; db > DB_FLOOR; db -= 20) {
      const y = yOf(db);
      ctx.strokeStyle = '#1f2733';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db} dB`, width - 40, y - 2);
    }

    const spectrum = controller.latest.spectrum;
    if (spectrum) {
      const { magnitudes, binHz } = spectrum.data;
      ctx.strokeStyle = '#63b3ed';
      ctx.beginPath();
      const lastBin = Math.min(magnitudes.length - 1, Math.ceil(freqLimit / binHz));
      for (let k = 0; k <= lastBin; k++) {
        const x = xOf(k * binHz);
        const y = yOf(toDb(magnitudes[k]!));
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const peaks = controller.latest.peaks;
    if (peaks) {
      ctx.fillStyle = '#f6ad55';
      ctx.font = '11px system-ui';
      for (const peak of peaks.data.peaks) {
        if (peak.frequencyHz > freqLimit) continue;
        const x = xOf(peak.frequencyHz);
        const y = yOf(toDb(peak.magnitude));
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText(`${peak.frequencyHz.toFixed(0)}`, x + 5, y - 5);
      }
    }

    // Hover crosshair with exact frequency/amplitude readout.
    const hover = hoverRef.current;
    if (hover && spectrum) {
      const { magnitudes, binHz } = spectrum.data;
      const hz = (hover.x / width) * freqLimit;
      const bin = Math.round(hz / binHz);
      const mag = magnitudes[Math.min(bin, magnitudes.length - 1)] ?? 0;
      ctx.strokeStyle = '#718096';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hover.x, 0);
      ctx.lineTo(hover.x, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px system-ui';
      const label = `${hz.toFixed(0)} Hz · ${toDb(mag).toFixed(1)} dB (bin ${bin})`;
      ctx.fillText(label, Math.min(hover.x + 8, width - 190), Math.max(hover.y, 24));
    }
  });

  return (
    <Panel
      title="Spectrum & peaks"
      explainer={EXPLAINER}
      className="col-span-full"
      controls={
        <>
          <label className={LABEL}>
            Window
            <select
              value={windowSize}
              onChange={(event) =>
                controller.setEngineOptions({ windowSize: Number(event.target.value) })
              }
            >
              {WINDOW_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} ({((size / sampleRate) * 1000).toFixed(0)} ms,{' '}
                  {(sampleRate / size).toFixed(1)} Hz/bin)
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Function
            <select
              value={windowName}
              onChange={(event) =>
                controller.setEngineOptions({ window: event.target.value as WindowName })
              }
            >
              {WINDOW_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Max freq
            <select value={maxFreq} onChange={(event) => setMaxFreq(Number(event.target.value))}>
              {MAX_FREQ_CHOICES.map((hz) => (
                <option key={hz} value={hz}>
                  {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="block h-[260px] w-full cursor-crosshair rounded-[5px] bg-canvas"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          hoverRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        }}
        onMouseLeave={() => (hoverRef.current = null)}
      />
    </Panel>
  );
}
