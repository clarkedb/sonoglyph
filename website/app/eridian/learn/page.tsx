import type { Metadata } from 'next';
import { EridianShell } from '../eridian-shell';
import { GuidedTour } from './guided-tour';

export const metadata: Metadata = {
  title: 'Learn Eridian',
  description:
    'A guided tour through the Eridian chord-language, one idea at a time — from a single good/bad chord to a whole sentence, every word playable in your browser.',
};

export default function EridianLearnPage() {
  return (
    <EridianShell slug="learn">
      <GuidedTour />
    </EridianShell>
  );
}
