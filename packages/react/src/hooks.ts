'use client';

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

/** Run `draw` every animation frame — for canvas views that read their data
 * source directly instead of routing per-frame updates through React state. */
export function useAnimationFrame(draw: () => void): void {
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });
  useEffect(() => {
    let handle = 0;
    const loop = () => {
      // A throwing draw callback must not kill the loop — otherwise one bad
      // frame freezes the view until it remounts. Log and keep scheduling.
      try {
        drawRef.current();
      } catch (err) {
        console.error('useAnimationFrame draw callback threw', err);
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, []);
}

/** Size a canvas to its CSS box × devicePixelRatio; returns the 2D context. */
export function scaleCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const { clientWidth, clientHeight } = canvas;
  const width = Math.round(clientWidth * dpr);
  const height = Math.round(clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Colors the canvas views draw with. Resolved from CSS custom properties
 * (see theme.css) so the visualizations honor the consuming app's theme. */
export interface VizPalette {
  axis: string;
  trace: string;
  guide: string;
  guideLabel: string;
  grid: string;
  spectrum: string;
  peak: string;
  crosshair: string;
  readout: string;
}

/** Playground defaults — the fallback when CSS variables can't be read
 * (e.g. before styles load, or a server render). */
const FALLBACK: VizPalette = {
  axis: '#3f4757',
  trace: '#d9a441',
  guide: '#232a36',
  guideLabel: '#7c8394',
  grid: '#1b212b',
  spectrum: '#a8823f',
  peak: '#f2ddb0',
  crosshair: '#7c8394',
  readout: '#e4e7ee',
};

const VIZ_VARS: Record<keyof VizPalette, string> = {
  axis: '--viz-axis',
  trace: '--viz-trace',
  guide: '--viz-guide',
  guideLabel: '--viz-guide-label',
  grid: '--viz-grid',
  spectrum: '--viz-spectrum',
  peak: '--viz-peak',
  crosshair: '--viz-crosshair',
  readout: '--viz-readout',
};

/**
 * Resolve the canvas viz colors from CSS custom properties on `ref`, kept in
 * a ref the rAF draw loop can read without triggering re-renders. Re-reads on
 * element resize and on `data-theme` / `class` changes to the root element,
 * so a runtime theme switch re-themes the canvas.
 */
export function useVizPalette(ref: RefObject<HTMLElement | null>): RefObject<VizPalette> {
  const palette = useRef<VizPalette>({ ...FALLBACK });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(el);
      for (const key of Object.keys(VIZ_VARS) as (keyof VizPalette)[]) {
        palette.current[key] = cs.getPropertyValue(VIZ_VARS[key]).trim() || FALLBACK[key];
      }
    };
    read();
    const resize = new ResizeObserver(read);
    resize.observe(el);
    const theme = new MutationObserver(read);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, [ref]);
  return palette;
}
