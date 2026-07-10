import type { Metadata } from 'next';
import { ExampleShell } from '../example-shell';
import { DtmfDemo } from './dtmf-demo';

export const metadata: Metadata = {
  title: 'DTMF decoder',
  description:
    'A focused dual-tone decoder: press a key or feed raw tones through the real Sonoglyph pipeline and watch it resolve to a digit.',
};

export default function DtmfExamplePage() {
  return (
    <ExampleShell slug="dtmf">
      <DtmfDemo />
    </ExampleShell>
  );
}
