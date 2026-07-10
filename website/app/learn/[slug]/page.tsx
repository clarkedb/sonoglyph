import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle, ISSUE_URL } from '../articles';

/** Prerender every known chapter; an unknown slug 404s. */
export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const article = getArticle((await params).slug);
  if (!article) return {};
  return { title: article.title, description: article.blurb };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug);
  if (!article) notFound();

  const index = ARTICLES.findIndex((a) => a.slug === article.slug);

  return (
    <main className="mx-auto max-w-2xl px-6">
      <article className="pt-16 sm:pt-20">
        <a
          href="/learn"
          className="font-mono text-xs text-ink-dim transition-colors hover:text-ink"
        >
          ← the manual
        </a>
        <p className="mt-6 font-mono text-[13px] text-phosphor-dim tabular-nums">
          chapter {String(index + 1).padStart(2, '0')}
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-wide text-ink sm:text-5xl">
          {article.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-dim">{article.blurb}</p>

        {/* Stub: prose and the embedded interactive land with issue #52. */}
        <div className="graph-grid mt-10 rounded-sm border border-line bg-panel/60 p-8 text-center">
          <p className="font-mono text-sm text-ink">✎ this chapter is being written</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-relaxed text-ink-dim">
            It will carry the explanation and a live interactive built from{' '}
            <code className="rounded-sm border border-line bg-panel px-1.5 py-0.5 text-[0.85em]">
              @sonoglyph/react
            </code>
            .{' '}
            <a
              className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
              href={ISSUE_URL}
            >
              Track it on GitHub.
            </a>
          </p>
        </div>
      </article>
    </main>
  );
}
