'use client';

import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { REPO_URL } from './site';

/*
 * The site header. The nav links fit comfortably in a row on a tablet and up,
 * but crowd and wrap on a phone — so below `sm` they collapse behind a
 * hamburger, while the theme toggle stays out in the bar (it's a persistent
 * control, not navigation). The menu closes on Escape, on an outside tap, and
 * when a link is chosen.
 */

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/learn', label: 'learn' },
  { href: '/examples', label: 'examples' },
  { href: '/eridian', label: 'eridian' },
  { href: REPO_URL, label: 'github ↗' },
];

const LINK_CLASS = 'font-mono text-ink-dim transition-colors hover:text-ink';

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // While open, close on Escape or on any pointer press outside the header.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="border-b border-line">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <a href="/" className="font-mono text-sm text-ink">
          <span aria-hidden className="text-phosphor">
            ∿
          </span>{' '}
          sonoglyph
        </a>

        {/* Tablet and up: the full nav inline. */}
        <nav aria-label="Primary" className="hidden items-center gap-5 sm:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`text-xs ${LINK_CLASS}`}>
              {link.label}
            </a>
          ))}
          <ThemeToggle />
        </nav>

        {/* Phone: theme toggle stays out; nav collapses behind the hamburger. */}
        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
            className="cursor-pointer rounded-sm border border-line px-2 py-1.5 text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              {open ? (
                <>
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </>
              ) : (
                <>
                  <line x1="2.5" y1="5" x2="15.5" y2="5" />
                  <line x1="2.5" y1="9" x2="15.5" y2="9" />
                  <line x1="2.5" y1="13" x2="15.5" y2="13" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Phone: the collapsible menu panel. */}
      {open && (
        <nav id="site-menu" aria-label="Primary" className="border-t border-line bg-void sm:hidden">
          <div className="mx-auto flex max-w-4xl flex-col px-6 py-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`border-b border-line/60 py-3 text-sm last:border-b-0 ${LINK_CLASS}`}
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
