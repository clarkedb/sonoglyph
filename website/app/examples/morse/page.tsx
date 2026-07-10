import type { Metadata } from 'next';
import { ExampleShell } from '../example-shell';
import { MorseDemo } from './morse-demo';

export const metadata: Metadata = {
  title: 'Morse decoder',
  description:
    'Key a message by hand or by text and watch the real Sonoglyph pipeline turn tone bursts into dots, dashes, and letters.',
};

export default function MorseExamplePage() {
  return (
    <ExampleShell slug="morse">
      <MorseDemo />
    </ExampleShell>
  );
}
