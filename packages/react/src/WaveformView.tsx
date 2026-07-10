'use client';

import { useRef } from 'react';
import { scaleCanvas, useAnimationFrame, useVizPalette } from './hooks.ts';

const DEFAULT_CLASS = 'block h-[140px] w-full rounded-[5px] bg-canvas';

/**
 * Live time-domain waveform. Owns its canvas and animation loop; each frame
 * it calls `read()` for the samples to draw (newest last) — so the data
 * source (a controller, a static buffer, anything) stays external and no
 * per-frame React render is needed. Draws min/max per pixel column, keeping
 * transients visible at any width.
 */
export function WaveformView({
  read,
  className,
  ariaLabel = 'Live waveform of the input signal.',
}: {
  read: () => Float32Array | null;
  className?: string;
  ariaLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useVizPalette(canvasRef);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = scaleCanvas(canvas);
    if (!ctx) return;
    const colors = palette.current;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const mid = height / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = colors.axis;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    const samples = read();
    if (samples && samples.length > 0) {
      ctx.strokeStyle = colors.trace;
      ctx.beginPath();
      const perPixel = samples.length / width;
      for (let x = 0; x < width; x++) {
        let min = 1;
        let max = -1;
        const start = Math.floor(x * perPixel);
        const end = Math.min(samples.length, Math.ceil((x + 1) * perPixel));
        for (let i = start; i < end; i++) {
          const s = samples[i]!;
          if (s < min) min = s;
          if (s > max) max = s;
        }
        if (min <= max) {
          ctx.moveTo(x + 0.5, mid - max * (mid - 2));
          ctx.lineTo(x + 0.5, mid - min * (mid - 2) + 1);
        }
      }
      ctx.stroke();
    }
  });

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
    />
  );
}
