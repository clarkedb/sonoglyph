import type { ReactNode } from 'react';

/** A titled panel with a collapsible explainer — the playground's
 * educational content lives as annotations on the live pipeline. */
export function Panel({
  title,
  explainer,
  controls,
  children,
  className,
}: {
  title: string;
  explainer: string;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header className="panel-header">
        <h2>{title}</h2>
        <div className="panel-controls">{controls}</div>
      </header>
      <div className="panel-body">{children}</div>
      <details className="panel-explainer">
        <summary>What am I looking at?</summary>
        <p>{explainer}</p>
      </details>
    </section>
  );
}
