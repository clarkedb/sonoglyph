import { MeaningView, Panel } from '@sonoglyph/react';
import { useController, useControllerTick } from '../hooks.ts';

const EXPLAINER =
  'The last stage: meaning. The recognizer emits dots and dashes (glyphs); turning them into ' +
  'letters and words is interpretation, so it happens one stage later, in a translator. It ' +
  'reads the silences between elements — a ~3-unit gap closes a letter, ~7 separates words — ' +
  'because in Morse the silences carry as much structure as the tones. Each letter below shows ' +
  'the dot/dash code it was assembled from; an unknown code is flagged rather than hidden.';

export function MeaningPanel() {
  const controller = useController();
  useControllerTick();
  return (
    <Panel title="Meaning" explainer={EXPLAINER}>
      <MeaningView
        transcript={controller.morseTranscript}
        emptyMessage="Key a message (or feed Morse from the mic) — decoded letters appear here, dots and dashes in the glyph timeline."
      />
    </Panel>
  );
}
