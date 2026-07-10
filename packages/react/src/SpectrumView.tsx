'use client';

import type { PeaksData, SpectrumData } from '@sonoglyph/core';
import { useRef } from 'react';
import { scaleCanvas, useAnimationFrame, useVizPalette } from './hooks.ts';

const DEFAULT_CLASS = 'block h-[260px] w-full cursor-crosshair rounded-[5px] bg-canvas';
const DB_FLOOR = -90;
const toDb = (mag: number) => Math.max(DB_FLOOR, 20 * Math.log10(mag + 1e-9));

/** The latest analysis frame to draw: the magnitude spectrum, any detected
 * peaks, and the sample rate (which sets the frequency axis). */
export interface SpectrumInput {
  spectrum: SpectrumData | null;
  peaks: PeaksData | null;
  sampleRate: number;
}

/**
 * Live frequency spectrum with detected peaks and a hover readout. Owns its
 * canvas and animation loop; each frame it calls `read()` for the current
 * frame. `guides` draws faint vertical reference lines (e.g. the eight DTMF
 * frequencies); `maxFreq` caps the visible band (clamped to Nyquist).
 */
export function SpectrumView({
  read,
  guides = [],
  maxFreq = 2500,
  className,
  ariaLabel = 'Live frequency spectrum with detected peaks.',
}: {
  read: () => SpectrumInput | null;
  guides?: number[];
  maxFreq?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const palette = useVizPalette(canvasRef);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = scaleCanvas(canvas);
    if (!ctx) return;
    const colors = palette.current;
    const input = read();

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const nyquist = input ? input.sampleRate / 2 : maxFreq;
    const freqLimit = Math.min(maxFreq, nyquist);
    const xOf = (hz: number) => (hz / freqLimit) * width;
    const yOf = (db: number) => (db / DB_FLOOR) * height;

    // Frequency guides (e.g. DTMF's eight nominal frequencies).
    ctx.strokeStyle = colors.guide;
    ctx.fillStyle = colors.guideLabel;
    ctx.font = '10px system-ui';
    for (const hz of guides) {
      if (hz > freqLimit) continue;
      const x = xOf(hz);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(String(hz), x + 2, 10);
    }

    // dB gridlines.
    ctx.fillStyle = colors.guideLabel;
    for (let db = -20; db > DB_FLOOR; db -= 20) {
      const y = yOf(db);
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db} dB`, width - 40, y - 2);
    }

    const spectrum = input?.spectrum ?? null;
    if (spectrum) {
      const { magnitudes, binHz } = spectrum;
      ctx.strokeStyle = colors.spectrum;
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

    const peaks = input?.peaks ?? null;
    if (peaks) {
      ctx.fillStyle = colors.peak;
      ctx.font = '11px system-ui';
      for (const peak of peaks.peaks) {
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
      const { magnitudes, binHz } = spectrum;
      const hz = (hover.x / width) * freqLimit;
      const bin = Math.round(hz / binHz);
      const mag = magnitudes[Math.min(bin, magnitudes.length - 1)] ?? 0;
      ctx.strokeStyle = colors.crosshair;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hover.x, 0);
      ctx.lineTo(hover.x, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.readout;
      ctx.font = '12px system-ui';
      const label = `${hz.toFixed(0)} Hz · ${toDb(mag).toFixed(1)} dB (bin ${bin})`;
      ctx.fillText(label, Math.min(hover.x + 8, width - 190), Math.max(hover.y, 24));
    }
  });

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        hoverRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }}
      onMouseLeave={() => (hoverRef.current = null)}
    />
  );
}
