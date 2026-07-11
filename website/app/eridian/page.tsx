import type { Metadata } from 'next';
import { HubHero } from './hub-hero';
import { TRANSLATOR_ZONE, ZONES } from './zones';

export const metadata: Metadata = {
  title: 'Eridian language explorer',
  description:
    'Learn and play with Eridian — the constructed chord-language from Project Hail Mary. Browse the dictionary, compose sentences and watch the real recognizer decode them, and take a guided tour, all in your browser.',
};

export default function EridianHubPage() {
  return (
    <main className="mx-auto max-w-4xl px-6">
      <section className="pt-16 sm:pt-20">
        <p className="font-mono text-[13px] text-phosphor-dim">a chord-language explorer</p>
        <h1 className="mt-4 font-display text-5xl font-semibold tracking-wide text-ink uppercase sm:text-6xl">
          Eridian
        </h1>
        <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-ink-dim">
          The language Rocky speaks in <em>Project Hail Mary</em> — an alien who talks in musical
          chords, not words. This is a deterministic, learnable version of that idea: a phonology, a
          starter dictionary, a small grammar, and real synthesis. Every sound here is built the
          same way the recognizer decodes it — nothing is a recording.
        </p>
      </section>

      <section className="mt-8">
        <HubHero />
      </section>

      <section className="mt-16">
        <h2 className="font-mono text-[13px] text-ink-dim">the centerpiece</h2>
        <a
          href={`/eridian/${TRANSLATOR_ZONE.slug}`}
          className="group mt-4 block rounded-sm border border-phosphor-dim bg-panel p-6 transition-colors hover:border-phosphor sm:p-7"
        >
          <p className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
            live · microphone
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-wide text-ink transition-colors group-hover:text-phosphor sm:text-3xl">
            {TRANSLATOR_ZONE.title} <span aria-hidden>→</span>
          </h3>
          <p className="mt-2 max-w-[64ch] text-[15px] leading-relaxed text-ink-dim">
            {TRANSLATOR_ZONE.blurb} It’s the jury-rigged translator from <em>Project Hail Mary</em>{' '}
            — powered by the real observable pipeline, not a mockup.
          </p>
        </a>
        <p className="mt-2.5 font-mono text-[11px] text-ink-dim">
          <a
            href="/eridian/transmitter"
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          >
            Turn a phone into Rocky →
          </a>{' '}
          and speak Eridian at the console across the room.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-mono text-[13px] text-ink-dim">three ways in</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ZONES.map((zone) => (
            <a
              key={zone.slug}
              href={`/eridian/${zone.slug}`}
              className="group rounded-sm border border-line bg-panel p-4 transition-colors hover:border-phosphor-dim"
            >
              <h3 className="font-mono text-[13px] text-ink transition-colors group-hover:text-phosphor">
                {zone.title} <span aria-hidden>→</span>
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{zone.blurb}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <p className="max-w-[64ch] font-mono text-xs leading-relaxed text-ink-dim">
          The full language is specified in{' '}
          <a
            href="https://github.com/clarkedb/sonoglyph/blob/main/docs/eridian.md"
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          >
            docs/eridian.md
          </a>{' '}
          and implemented in <span className="text-ink">@sonoglyph/eridian</span> — the same package
          this explorer, the recognizer plugin, and the test suite all build on.
        </p>
      </section>
    </main>
  );
}
