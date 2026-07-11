import type { Metadata } from 'next';
import { EridianShell } from '../eridian-shell';
import { Composer } from './composer';

export const metadata: Metadata = {
  title: 'Compose in Eridian',
  description:
    'Build an Eridian utterance, play it aloud, and feed the audio back through the real recognizer and translator — a live text → audio → chords → text round trip in your browser.',
};

export default function EridianComposePage() {
  return (
    <EridianShell slug="compose">
      <Composer />
    </EridianShell>
  );
}
