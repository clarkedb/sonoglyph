import { useRef } from 'react';
import { Panel, useAnimationFrame, WaveformView } from '@sonoglyph/react';
import { useController } from '../hooks.ts';

const EXPLAINER =
  'The raw signal in the time domain: amplitude against time, the newest half-second ' +
  'scrolling in from the right. A DTMF press looks like a dense burst — two sine waves ' +
  'summed — but you cannot read which frequencies it contains by eye. That is what the ' +
  'spectrum below is for. The stats line shows what the audio hardware is actually ' +
  'delivering: the sample rate and how many sample chunks have arrived.';

export function WaveformPanel() {
  const controller = useController();
  const statsRef = useRef<HTMLDivElement>(null);

  // The stats line tracks per-chunk counters, which change faster than the
  // controller's coarse notify(), so refresh it on the frame clock.
  useAnimationFrame(() => {
    const { sampleRate, chunksReceived, samplesReceived } = controller.status;
    if (statsRef.current) {
      statsRef.current.textContent =
        `${sampleRate.toLocaleString()} Hz · ${chunksReceived.toLocaleString()} chunks · ` +
        `${(samplesReceived / Math.max(sampleRate, 1)).toFixed(1)} s received`;
    }
  });

  return (
    <Panel title="Waveform" explainer={EXPLAINER}>
      <WaveformView
        read={() =>
          controller.sampleHistory.peekLatest(Math.floor(controller.status.sampleRate * 0.5))
        }
        ariaLabel="Live waveform of the input signal: amplitude over the most recent half second."
      />
      <div ref={statsRef} className="mt-1.5 text-xs text-muted tabular-nums" />
    </Panel>
  );
}
