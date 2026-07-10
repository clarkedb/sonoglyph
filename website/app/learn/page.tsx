import type { Metadata } from 'next';
import { ARTICLES } from './articles';

export const metadata: Metadata = {
  title: 'Learn',
  description:
    'A field guide to signal processing, grown from the Sonoglyph playground. Sampling, Nyquist, the FFT, peaks, features, and building a recognizer, each paired with a live interactive.',
};

export default function LearnIndex() {
  return (
    <main className="mx-auto max-w-4xl px-6">
      <section className="pt-16 sm:pt-20">
        <p className="font-mono text-[13px] text-ink-dim">the manual</p>
        <h1 className="mt-4 font-display text-5xl font-semibold tracking-wide text-ink uppercase sm:text-6xl">
          Learn
        </h1>
        <p className="mt-5 max-w-[62ch] leading-relaxed">
          Signal processing, one idea at a time. Each chapter grew out of a panel in the playground
          and keeps the same live interactive to poke at. Read it top to bottom, or skip straight to
          whatever you're curious about.
        </p>
      </section>

      {/* Chapters — a deliberate sequence, so the numbers carry order. */}
      <section className="mt-14">
        <ol className="border-t border-line">
          {ARTICLES.map((article, i) => (
            <li key={article.slug} className="border-b border-line">
              <a
                href={`/learn/${article.slug}`}
                className="group flex items-baseline gap-4 py-5 transition-colors sm:gap-6"
              >
                <span className="font-mono text-sm text-phosphor-dim tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-display text-xl tracking-wide text-ink transition-colors group-hover:text-phosphor">
                    {article.title}
                  </span>
                  <span className="mt-1 block max-w-[68ch] text-sm leading-relaxed text-ink-dim">
                    {article.blurb}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="font-mono text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-phosphor"
                >
                  →
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* Hosted examples — focused demos, routed under /examples. */}
      <section className="mt-16">
        <a
          href="/examples"
          className="group flex items-baseline gap-4 rounded-sm border border-line bg-panel p-5 transition-colors hover:border-phosphor-dim"
        >
          <span className="min-w-0 flex-1">
            <span className="font-display text-2xl font-medium tracking-wide text-ink uppercase transition-colors group-hover:text-phosphor">
              Interactive examples
            </span>
            <span className="mt-1.5 block max-w-[62ch] text-sm leading-relaxed text-ink-dim">
              Small, single-purpose demos, each narrower than the full playground: the DTMF decoder,
              the Morse decoder, the tone playground.
            </span>
          </span>
          <span
            aria-hidden
            className="font-mono text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-phosphor"
          >
            →
          </span>
        </a>
      </section>
    </main>
  );
}
