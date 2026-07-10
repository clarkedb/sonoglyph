import type { ReactNode } from 'react';
import { EXAMPLES } from '../learn/articles';

/**
 * Shared chrome for the hosted examples: header, the demo, and cross-links
 * to the sibling examples. Each example page is a focused, single-purpose
 * instrument — smaller than the full playground.
 */
export function ExampleShell({ slug, children }: { slug: string; children: ReactNode }) {
  const example = EXAMPLES.find((e) => e.slug === slug);
  const others = EXAMPLES.filter((e) => e.slug !== slug);

  return (
    <main className="mx-auto max-w-3xl px-6">
      <section className="pt-16 sm:pt-20">
        <a
          href="/learn"
          className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
        >
          ← the manual
        </a>
        <p className="mt-6 font-mono text-[13px] text-phosphor-dim">interactive example</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-wide text-ink sm:text-5xl">
          {example?.title}
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-dim">{example?.blurb}</p>
      </section>

      <section className="mt-10">{children}</section>

      <nav aria-label="More examples" className="mt-16 border-t border-line pt-5">
        <p className="font-mono text-xs text-ink-dim">
          more examples:{' '}
          {others.map((e, i) => (
            <span key={e.slug}>
              {i > 0 && ' · '}
              <a
                href={`/examples/${e.slug}`}
                className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
              >
                {e.title.toLowerCase()}
              </a>
            </span>
          ))}{' '}
          · or the full{' '}
          <a
            href="https://play.sonoglyph.dev"
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          >
            playground
          </a>
        </p>
      </nav>
    </main>
  );
}
