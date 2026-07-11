import type { Metadata } from 'next';
import { TranslatorConsole } from './translator-console';
import { TRANSLATOR_ZONE, ZONES } from '../zones';

export const metadata: Metadata = {
  title: 'Eridian translator console',
  description:
    "Grace's translator from Project Hail Mary, rebuilt in your browser: arm the microphone and watch live audio flow through the real recognition pipeline — chord glyphs light up as Eridian is spoken, and words resolve to English as the sequences complete.",
};

/*
 * The translator console gets its own wide layout rather than the explorer's
 * reading-measure EridianShell — it's an instrument panel, not an article — but
 * keeps the same hub back-link and cross-link chrome so it reads as part of the
 * same explorer.
 */
export default function EridianTranslatorPage() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="pt-16 sm:pt-20">
        <a
          href="/eridian"
          className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
        >
          ← eridian
        </a>
        <p className="mt-6 font-mono text-[13px] text-phosphor-dim">eridian · live</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-wide text-ink sm:text-5xl">
          {TRANSLATOR_ZONE.title}
        </h1>
        <p className="mt-4 max-w-[68ch] text-lg leading-relaxed text-ink-dim">
          {TRANSLATOR_ZONE.lede}
        </p>
      </section>

      <section className="mt-6">
        <TranslatorConsole />
      </section>

      <nav aria-label="More of the Eridian explorer" className="mt-16 border-t border-line pt-5">
        <p className="font-mono text-xs text-ink-dim">
          more eridian:{' '}
          {ZONES.map((z, i) => (
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
