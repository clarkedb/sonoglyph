import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed, Fragment_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ThemeToggle } from './theme-toggle';
import { REPO_URL, SITE_URL } from './site';

/* Voice: mid-century technical documentation. Barlow (road-signage grotesque
 * lineage) carries body and, condensed, the flight-plan display; Fragment
 * Mono carries annotations and readouts. */
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
});
const condensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-condensed',
});
const fragment = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fragment',
});

/* Runs before first paint so there is no theme flash. Order of precedence:
 * ?theme= query (handy for previews/screenshots) → saved choice → OS.
 * Dark is the house default: only an explicit OS light preference prints. */
const themeInit = `(function () {
  try {
    var q = new URLSearchParams(location.search).get('theme');
    var s = localStorage.getItem('theme');
    var m = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var t = q === 'dark' || q === 'light' ? q : s === 'dark' || s === 'light' ? s : m;
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Sonoglyph — watch sound become symbols',
    template: '%s · Sonoglyph',
  },
  description:
    'A browser-first, extensible signal recognition framework: a reusable DSP pipeline — microphone to spectrum to detected features — and a plugin architecture that turns any structured signal into glyphs. Built to teach signal processing as much as perform it.',
  openGraph: {
    title: 'Sonoglyph',
    description: 'Watch sound become symbols — a browser-first signal recognition framework.',
    url: '/',
    siteName: 'Sonoglyph',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sonoglyph',
    description: 'Watch sound become symbols — a browser-first signal recognition framework.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${barlow.variable} ${condensed.variable} ${fragment.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
            <a href="/" className="font-mono text-sm text-ink">
              <span aria-hidden className="text-phosphor">
                ∿
              </span>{' '}
              sonoglyph
            </a>
            <nav className="flex items-center gap-5">
              <a
                href="/learn"
                className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
              >
                learn
              </a>
              <a
                href="/examples"
                className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
              >
                examples
              </a>
              <a
                href={REPO_URL}
                className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
              >
                github ↗
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-28 border-t border-line">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-8 font-mono text-xs text-ink-dim">
            <span>
              Samples <span className="text-phosphor">→</span> Features{' '}
              <span className="text-phosphor">→</span> Glyphs{' '}
              <span className="text-phosphor">→</span> Meaning
            </span>
            <span>
              <a className="transition-colors hover:text-ink" href={REPO_URL}>
                github.com/clarkedb/sonoglyph
              </a>{' '}
              · MIT
            </span>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
