import type { Metadata } from 'next';
import { ExampleShell } from '../example-shell';
import { ToneDemo } from './tone-demo';

export const metadata: Metadata = {
  title: 'Tone playground',
  description:
    'Generate arbitrary tones and noise, and watch the real FFT spectrum respond — a focused Sonoglyph demo.',
};

export default function TonePlaygroundPage() {
  return (
    <ExampleShell slug="tone">
      <ToneDemo />
    </ExampleShell>
  );
}
