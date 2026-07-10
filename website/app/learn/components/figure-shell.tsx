import type { ReactNode } from 'react';

/**
 * The manual's figure chrome, shared by every chapter interactive and
 * hosted example: numbered figcaption rule, graph-paper panel, annotation
 * line beneath. Mirrors the landing page's Fig. 1 so the whole site reads
 * as one instrument.
 */
export function FigureShell({
  n,
  title,
  meta,
  caption,
  children,
}: {
  /** Figure number within the page, e.g. 1 renders "FIG. 1". */
  n: number;
  title: string;
  /** Right-aligned spec line, e.g. "engine: @sonoglyph/dsp · 48 kHz". */
  meta?: string;
  /** Annotation line under the panel — the "(1) … · (2) …" legend. */
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="mt-10">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line pb-2 font-mono text-xs text-ink-dim">
        <span>
          <span className="font-medium text-ink">FIG. {n}</span> — {title.toUpperCase()}
        </span>
        {meta && <span>{meta}</span>}
      </figcaption>
      <div className="graph-grid mt-4 rounded-sm border border-line bg-panel/60 p-5">
        {children}
      </div>
      {caption && (
        <p className="mt-3 max-w-[80ch] font-mono text-[11px] leading-relaxed text-ink-dim">
          {caption}
        </p>
      )}
    </figure>
  );
}

/** The numbered zone label used inside figures: "(1) keypad". */
export function ZoneLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-wide text-ink-dim">
      <span className="text-phosphor-dim">({n})</span> {children}
    </p>
  );
}
