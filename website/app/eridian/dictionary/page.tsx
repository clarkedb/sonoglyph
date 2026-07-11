import type { Metadata } from 'next';
import { EridianShell } from '../eridian-shell';
import { DictionaryExplorer } from './dictionary-explorer';

export const metadata: Metadata = {
  title: 'Eridian dictionary',
  description:
    'Browse the Eridian starter lexicon — hear each word as a chord and see the exact scale degrees and frequencies it is built from.',
};

export default function EridianDictionaryPage() {
  return (
    <EridianShell slug="dictionary">
      <DictionaryExplorer />
    </EridianShell>
  );
}
