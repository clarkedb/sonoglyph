import { useRef } from 'react';
import { scaleCanvas, useAnimationFrame, useController } from '../hooks.ts';
import { Panel } from './Panel.tsx';

const EXPLAINER =
  'The raw signal in the time domain: amplitude against time, the newest half-second ' +
  'scrolling in from the right. A DTMF press looks like a dense burst — two sine waves ' +
  'summed — but you cannot read which frequencies it contains by eye. That is what the ' +
  'spectrum below is for. The stats line shows what the audio hardware is actually ' +
  'delivering: the sample rate and how many sample chunks have arrived.';

export function WaveformPanel() {
  const controller = useController();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = scaleCanvas(canvas);
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const mid = height / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#2d3748';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    const seconds = 0.5;
    const samples = controller.sampleHistory.peekLatest(
      Math.floor(controller.status.sampleRate * seconds),
    );
    if (samples.length > 0) {
      // Min/max per pixel column: keeps transients visible at any zoom.
      ctx.strokeStyle = '#4fd1c5';
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

    const { sampleRate, chunksReceived, samplesReceived } = controller.status;
    if (statsRef.current) {
      statsRef.current.textContent =
        `${sampleRate.toLocaleString()} Hz · ${chunksReceived.toLocaleString()} chunks · ` +
        `${(samplesReceived / Math.max(sampleRate, 1)).toFixed(1)} s received`;
    }
  });

  return (
    <Panel title="Waveform" explainer={EXPLAINER}>
      <canvas ref={canvasRef} className="block h-[140px] w-full rounded-[5px] bg-canvas" />
      <div ref={statsRef} className="mt-1.5 text-xs text-muted tabular-nums" />
    </Panel>
  );
}
