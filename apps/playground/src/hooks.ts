import { createContext, useContext, useEffect, useState } from 'react';
import type { PlaygroundController } from './controller.ts';

// Canvas/animation helpers now live in @sonoglyph/react; the controller
// wiring below is playground-specific and stays here.

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
