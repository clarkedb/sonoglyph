'use client';

import { useEffect } from 'react';

/* Runtime error boundary. Next.js renders this (inside the root layout) when
 * a client/server render throws in a route. Themed as a decode fault: the
 * signal came in but the pipeline stalled mid-decode. `reset` re-renders the
 * segment — a retry of the same input. */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it for whoever's watching the console; Vercel logs the throw.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl px-6">
      <section className="pt-16 sm:pt-24">
        <p className="font-mono text-[13px] text-ink-dim">fault 500 · decode error</p>
        <h1 className="mt-5 font-display text-6xl font-semibold tracking-wide text-ink uppercase sm:text-7xl">
          Signal lost
        </h1>
        <p className="mt-3 text-xl text-ink-dim">
          The pipeline <span style={{ color: 'var(--danger)' }}>stalled</span> mid-decode.
        </p>
        <p className="mt-6 max-w-[62ch] leading-relaxed">
          Something threw while rendering this page — a fault in the instrument, not in your input.
          Retry the decode; if it keeps stalling, the trail below is what to report.
        </p>

        <figure className="mt-10">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-2 font-mono text-xs text-ink-dim">
            <span>
              <span className="font-medium text-ink">READOUT</span> — fault trace
            </span>
            <span>status: interrupted</span>
          </figcaption>
          <div className="mt-4 rounded-sm border border-line bg-panel/60 p-5 font-mono text-xs leading-relaxed break-words text-ink-dim">
            <p>
              <span className="text-ink-dim">message</span>{' '}
              <span style={{ color: 'var(--danger)' }}>{error.message || 'unknown fault'}</span>
            </p>
            {error.digest && (
              <p className="mt-1">
                <span className="text-ink-dim">digest</span>{' '}
                <span className="text-ink">{error.digest}</span>
              </p>
            )}
          </div>
        </figure>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-sm border border-phosphor-dim px-4 py-2 font-mono text-sm text-phosphor transition-colors hover:border-phosphor"
          >
            ↻ retry decode
          </button>
          <a
            href="/"
            className="rounded-sm border border-line px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-ink-dim"
          >
            back to signal
          </a>
        </div>
      </section>
    </main>
  );
}
