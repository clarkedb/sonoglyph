import type { Metadata } from 'next';
import './globals.css';
import { ThemeToggle } from './theme-toggle';
import { REPO_URL } from './site';

/* Runs before first paint so there is no theme flash. Order of precedence:
 * ?theme= query (handy for previews/screenshots) → saved choice → OS. */
const themeInit = `(function () {
  try {
    var q = new URLSearchParams(location.search).get('theme');
    var s = localStorage.getItem('theme');
    var m = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var t = q === 'dark' || q === 'light' ? q : s === 'dark' || s === 'light' ? s : m;
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();`;

export const metadata: Metadata = {
  metadataBase: new URL('https://sonoglyph.dev'),
  title: {
    default: 'Sonoglyph — a browser-first signal recognition framework',
    template: '%s · Sonoglyph',
  },
  description:
    'Signals in, symbols out. Sonoglyph is a reusable DSP pipeline — microphone to spectrum to recognized features — and a plugin architecture that turns those features into glyphs. Built to teach signal processing as much as perform it.',
  openGraph: {
    title: 'Sonoglyph',
    description: 'A browser-first, extensible signal recognition framework.',
    url: '/',
    siteName: 'Sonoglyph',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <a href="/" className="font-mono text-sm text-ink">
              <span aria-hidden className="text-accent">
                ∿
              </span>{' '}
              sonoglyph
            </a>
            <nav className="flex items-center gap-4">
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
        <footer className="mt-24 border-t border-line">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-8 font-mono text-xs text-ink-dim">
            <span>
              Samples <span className="text-accent">→</span> Features{' '}
              <span className="text-accent">→</span> Glyphs <span className="text-accent">→</span>{' '}
              Meaning
            </span>
            <span>
              <a className="transition-colors hover:text-ink" href={REPO_URL}>
                github.com/clarkedb/sonoglyph
              </a>{' '}
              · MIT
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
