import type { Metadata } from 'next';
import { EXAMPLES } from '../learn/articles';

export const metadata: Metadata = {
  title: 'Examples',
  description:
    'Focused, single-purpose Sonoglyph demos — the DTMF decoder, the Morse decoder, and the tone playground — each narrower than the full playground.',
};

export default function ExamplesIndex() {
  return (
    <main className="mx-auto max-w-4xl px-6">
      <section className="pt-16 sm:pt-20">
        <p className="font-mono text-[13px] text-ink-dim">hosted demos</p>
        <h1 className="mt-4 font-display text-5xl font-semibold tracking-wide text-ink uppercase sm:text-6xl">
          Examples
        </h1>
        <p className="mt-5 max-w-[62ch] leading-relaxed">
          Small, single-purpose demos, each narrower than the full{' '}
          <a
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
            href="https://play.sonoglyph.dev"
          >
            playground
          </a>
          . Every one runs the real pipeline, in your browser.
        </p>
      </section>

      <section className="mt-14">
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <a
              key={example.slug}
              href={`/examples/${example.slug}`}
              className="group rounded-sm border border-line bg-panel p-4 transition-colors hover:border-phosphor-dim"
            >
              <h3 className="font-mono text-[13px] text-ink transition-colors group-hover:text-phosphor">
                {example.title} <span aria-hidden>→</span>
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{example.blurb}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
