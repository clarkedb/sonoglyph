import type { Metadata } from 'next';
import { RockyTransmitter } from './transmitter';

export const metadata: Metadata = {
  title: 'Rocky transmitter',
  description:
    "Turn a phone into Rocky: tap a phrase and it plays Eridian chords aloud. Hold it up to the translator console's microphone and watch the acoustic path decode, live.",
};

/*
 * The transmitter gets a narrow, phone-first column (it's meant to be held in
 * one hand at the console's mic), but keeps the hub back-link chrome so it
 * still reads as part of the explorer.
 */
export default function EridianTransmitterPage() {
  return (
    <main className="mx-auto max-w-md px-5">
      <section className="pt-14 sm:pt-16">
        <a
          href="/eridian/translator"
          className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
        >
          ← translator console
        </a>
        <p className="mt-6 font-mono text-[13px] text-phosphor-dim">eridian · transmitter</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-wide text-ink sm:text-4xl">
          Rocky transmitter
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          A speaker you hold up to the translator’s microphone. Tap a phrase — it plays the Eridian
          chords aloud, and the console across the room decodes them through the air. Turn the
          volume up.
        </p>
      </section>

      <section className="mt-8">
        <RockyTransmitter />
      </section>

      <nav className="mt-12 border-t border-line pt-5 pb-16">
        <p className="font-mono text-xs text-ink-dim">
          on the other device, open the{' '}
          <a
            href="/eridian/translator"
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          >
            translator console
          </a>{' '}
          and arm its microphone · or the{' '}
          <a
            href="/eridian"
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          >
            explorer
          </a>
        </p>
      </nav>
    </main>
  );
}
