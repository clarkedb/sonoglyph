import { FeatureReadout, Panel } from '@sonoglyph/react';
import { useController } from '../hooks.ts';

const EXPLAINER =
  'Feature frames are what recognizer plugins actually consume — the DSP engine reduces each ' +
  'analysis window to named streams, and plugins subscribe to the ones they need. The DTMF ' +
  'recognizer reads only the peaks stream; a Morse recognizer would read only the envelope. ' +
  'This is live: what you see here is exactly what the plugin saw for the most recent frame.';

export function FeaturesPanel() {
  const controller = useController();
  return (
    <Panel title="Feature frames" explainer={EXPLAINER}>
      <FeatureReadout
        read={() => controller.latest}
        emptyMessage="Start an input to see live feature frames."
      />
    </Panel>
  );
}
