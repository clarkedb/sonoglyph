import { useRef, useState } from 'react';
import { useAnimationFrame, useController } from '../hooks.js';
import { Panel } from './Panel.js';

const EXPLAINER =
  'Feature frames are what recognizer plugins actually consume — the DSP engine reduces each ' +
  'analysis window to named streams, and plugins subscribe to the ones they need. The DTMF ' +
  'recognizer reads only the peaks stream; a Morse recognizer would read only the envelope. ' +
  'This is live: what you see here is exactly what the plugin saw for the most recent frame.';

interface Snapshot {
  time: string;
  envelope: string;
  peaks: string[];
  spectrum: string;
}

export function FeaturesPanel() {
  const controller = useController();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const lastUpdate = useRef(0);

  useAnimationFrame(() => {
    const now = performance.now();
    if (now - lastUpdate.current < 100) return; // ~10 Hz is plenty for text
    lastUpdate.current = now;

    const { spectrum, peaks, envelope } = controller.latest;
    if (!spectrum && !peaks && !envelope) return;

    setSnapshot({
      time: spectrum ? `${spectrum.time.toFixed(2)} s` : '—',
      envelope: envelope
        ? `rms ${envelope.data.rms.toFixed(4)} (${(20 * Math.log10(envelope.data.rms + 1e-9)).toFixed(1)} dBFS) · peak ${envelope.data.peak.toFixed(4)}`
        : '—',
      peaks:
        peaks && peaks.data.peaks.length > 0
          ? peaks.data.peaks
              .slice(0, 6)
              .map(
                (p) =>
                  `${p.frequencyHz.toFixed(1)} Hz  mag ${p.magnitude.toFixed(4)}  (bin ${p.bin})`,
              )
          : ['(no peaks above threshold)'],
      spectrum: spectrum
        ? `${spectrum.data.magnitudes.length} bins · ${spectrum.data.binHz.toFixed(2)} Hz/bin · ${spectrum.data.window} window · v${spectrum.version}`
        : '—',
    });
  });

  return (
    <Panel title="Feature frames" explainer={EXPLAINER}>
      {snapshot ? (
        <dl className="features">
          <dt>stream time</dt>
          <dd>{snapshot.time}</dd>
          <dt>envelope</dt>
          <dd>{snapshot.envelope}</dd>
          <dt>peaks</dt>
          <dd>
            {snapshot.peaks.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </dd>
          <dt>spectrum</dt>
          <dd>{snapshot.spectrum}</dd>
        </dl>
      ) : (
        <p className="hint">Start an input to see live feature frames.</p>
      )}
    </Panel>
  );
}
