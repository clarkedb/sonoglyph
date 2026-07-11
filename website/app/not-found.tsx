import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'No signal (404)',
  description: 'No recognizable signal at this address.',
};

/* 404 as an instrument reading: the recognizer received nothing it could
 * decode at this address, so it emits the unrecognized glyph ⟨?⟩ over a
 * flat scope. Server component, all static — the trace-draw is CSS so
 * reduced-motion flattens it (see globals.css). */

const SCOPE_W = 240;
const SCOPE_H = 72;

/* A dead-flat trace with one faint blip of noise — no signal to lock onto. */
const FLATLINE = `M0 ${SCOPE_H / 2} L96 ${SCOPE_H / 2} L104 ${SCOPE_H / 2 - 4} L112 ${
  SCOPE_H / 2 + 3
} L120 ${SCOPE_H / 2} L${SCOPE_W} ${SCOPE_H / 2}`;

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl px-6">
      <section className="pt-16 sm:pt-24">
        <p className="font-mono text-[13px] text-ink-dim">fault 404 · no matching route</p>
        <h1 className="mt-5 font-display text-6xl font-semibold tracking-wide text-ink uppercase sm:text-7xl">
          No signal
        </h1>
        <p className="mt-3 text-xl text-ink-dim">
          Nothing to <span className="text-glow text-phosphor">decode</span> here.
        </p>
        <p className="mt-6 max-w-[62ch] leading-relaxed">
          The pipeline reached this address and found no recognizable signal — the page you&rsquo;re
          after moved, was renamed, or never existed. The recognizer does the only thing it can with
          input it doesn&rsquo;t understand: emits the unrecognized glyph.
        </p>

        {/* Fig. — the empty scope + unrecognized glyph */}
        <figure className="mt-10">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-2 font-mono text-xs text-ink-dim">
            <span>
              <span className="font-medium text-ink">SCOPE</span> — no lock
            </span>
            <span>input: unknown · confidence 0.00</span>
          </figcaption>
          <div className="graph-grid mt-4 flex flex-col items-center gap-6 rounded-sm border border-line bg-panel/60 p-6 sm:flex-row sm:justify-between">
            <svg
              viewBox={`0 0 ${SCOPE_W} ${SCOPE_H}`}
              preserveAspectRatio="none"
              className="h-18 w-full sm:max-w-sm"
              aria-hidden
            >
              <line x1="0" y1={SCOPE_H / 2} x2={SCOPE_W} y2={SCOPE_H / 2} stroke="var(--line)" />
              <path
                d={FLATLINE}
                pathLength={1}
                fill="none"
                stroke="var(--phosphor)"
                strokeWidth="1.4"
                strokeLinejoin="round"
                className="anim-trace trace-glow"
              />
            </svg>
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-sm border border-dashed border-line font-display text-3xl text-ink-dim">
                ?
              </span>
              <p className="font-mono text-[11px] leading-relaxed text-ink-dim">
                <span className="text-ink">⟨?⟩ unrecognized</span>
                <br />
                no matching glyph
              </p>
            </div>
          </div>
        </figure>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/"
            className="rounded-sm border border-phosphor-dim px-4 py-2 font-mono text-sm text-phosphor transition-colors hover:border-phosphor"
          >
            ← back to signal
          </a>
          <a
            href="/learn"
            className="rounded-sm border border-line px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-ink-dim"
          >
            learn
          </a>
          <a
            href="/examples"
            className="rounded-sm border border-line px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-ink-dim"
          >
            examples
          </a>
        </div>
      </section>
    </main>
  );
}
