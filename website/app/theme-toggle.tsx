'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/* The theme lives on <html data-theme>, stamped before first paint by the
 * inline script in app/layout.tsx — the DOM is the store; React subscribes. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function setDocumentTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Private browsing may block storage; the attribute flip above still applies.
  }
  listeners.forEach((listener) => listener());
}

/** Dark is the instrument at night; light is the printed manual page. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as Theme);

  return (
    <button
      type="button"
      onClick={() => setDocumentTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={
        theme === 'dark'
          ? 'Switch to the printed (light) theme'
          : 'Switch to the night (dark) theme'
      }
      className="cursor-pointer rounded-sm border border-line px-2.5 py-1 font-mono text-xs text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
    >
      {theme === 'dark' ? 'print' : 'night'}
    </button>
  );
}
