import type { Metadata } from 'next';
import { ARTICLES, EXAMPLES, ISSUE_URL } from './articles';

export const metadata: Metadata = {
  title: 'Learn',
  description:
    'A field guide to signal processing, grown from the Sonoglyph playground: sampling, Nyquist, the FFT, peaks, features, and building a recognizer — each with a live interactive.',
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
          Signal processing, one idea at a time — each chapter grown from a panel in the playground,
          with the same live interactive to poke at. Read top to bottom, or drop into whatever pulls
          you in.
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

      {/* Hosted examples — forward reference; not yet built. */}
      <section className="mt-16">
        <h2 className="font-display text-2xl font-medium tracking-wide text-ink uppercase">
          Interactive examples
        </h2>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-dim">
          Focused, single-purpose demos — smaller than the full{' '}
          <a
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
            href="https://play.sonoglyph.dev"
          >
            playground
          </a>
          .
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <div key={example.title} className="rounded-sm border border-line bg-panel p-4">
              <h3 className="font-mono text-[13px] text-ink">{example.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{example.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-14 font-mono text-xs leading-relaxed text-ink-dim">
        the chapters are being written —{' '}
        <a
          className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          href={ISSUE_URL}
        >
          follow along on GitHub
        </a>
        .
      </p>
    </main>
  );
}
