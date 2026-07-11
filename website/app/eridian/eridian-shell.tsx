import type { ReactNode } from 'react';
import { ZONES } from './zones';

/**
 * Shared chrome for the Eridian explorer's interactive zones: a back-link to
 * the hub, the zone header, the interactive itself, and cross-links to the
 * sibling zones. Mirrors examples/example-shell.tsx so the explorer reads as
 * part of the same instrument, not a separate site.
 */
export function EridianShell({ slug, children }: { slug: EridianSlug; children: ReactNode }) {
  const zone = ZONES.find((z) => z.slug === slug)!;
  const others = ZONES.filter((z) => z.slug !== slug);

  return (
    <main className="mx-auto max-w-3xl px-6">
      <section className="pt-16 sm:pt-20">
        <a
          href="/eridian"
          className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
        >
          ← eridian
        </a>
        <p className="mt-6 font-mono text-[13px] text-phosphor-dim">eridian · interactive</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-wide text-ink sm:text-5xl">
          {zone.title}
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-dim">{zone.lede}</p>
      </section>

      <section className="mt-10">{children}</section>

      <nav aria-label="More of the Eridian explorer" className="mt-16 border-t border-line pt-5">
        <p className="font-mono text-xs text-ink-dim">
          more eridian:{' '}
          {others.map((z, i) => (
            <span key={z.slug}>
              {i > 0 && ' · '}
              <a
                href={`/eridian/${z.slug}`}
                className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
              >
                {z.title.toLowerCase()}
              </a>
            </span>
          ))}{' '}
          · or the language{' '}
          <a
            href="https://github.com/clarkedb/sonoglyph/blob/main/docs/eridian.md"
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
          >
            spec
          </a>
        </p>
      </nav>
    </main>
  );
}

export type EridianSlug = 'dictionary' | 'compose' | 'learn';
