import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PlaygroundController } from './controller.js';

export const ControllerContext = createContext<PlaygroundController | null>(null);

export function useController(): PlaygroundController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('ControllerContext is not provided');
  return controller;
}

/** Re-render on coarse controller changes (glyphs, mode, options). */
export function useControllerTick(): number {
  const controller = useController();
  const [tick, setTick] = useState(0);
  useEffect(() => controller.subscribe(() => setTick((t) => t + 1)), [controller]);
  return tick;
}

/** Run `draw` every animation frame (for canvas panels that read the
 * controller directly instead of going through React state). */
export function useAnimationFrame(draw: () => void): void {
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });
  useEffect(() => {
    let handle = 0;
    const loop = () => {
      drawRef.current();
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
