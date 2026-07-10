import type { ReactNode } from 'react';

/** A titled panel with a collapsible explainer — Sonoglyph's educational
 * content lives as annotations on the live pipeline. The bare `panel` class
 * is a semantic marker (used by playground tests), not a style. */
export function Panel({
  title,
  explainer,
  controls,
  children,
  className,
}: {
  title: string;
  explainer: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`panel flex min-w-0 flex-col rounded-sm border border-edge bg-panel px-3.5 py-3 ${className ?? ''}`}
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-medium tracking-[0.08em] text-heading uppercase">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">{controls}</div>
      </header>
      <div className="flex-1">{children}</div>
      <details className="mt-2.5 text-[12.5px] text-soft">
        <summary className="cursor-pointer text-faint">What am I looking at?</summary>
        <p className="mt-1.5 leading-normal">{explainer}</p>
      </details>
    </section>
  );
}
