import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTICLES, getArticle } from '../articles';
import { CONTENT } from '../content';

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
  const Body = CONTENT[article.slug];
  if (!Body) notFound();
  const prev = ARTICLES[index - 1];
  const next = ARTICLES[index + 1];

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

        <div className="article-prose mt-8">
          <Body />
        </div>

        {/* Chapter turn: the manual reads front to back. */}
        <nav
          aria-label="Chapters"
          className="mt-16 flex justify-between gap-6 border-t border-line pt-5 font-mono text-xs"
        >
          {prev ? (
            <a
              href={`/learn/${prev.slug}`}
              className="text-ink-dim transition-colors hover:text-ink"
            >
              ← {String(index).padStart(2, '0')} {prev.title}
            </a>
          ) : (
            <span />
          )}
          {next && (
            <a
              href={`/learn/${next.slug}`}
              className="text-right text-ink-dim transition-colors hover:text-ink"
            >
              {String(index + 2).padStart(2, '0')} {next.title} →
            </a>
          )}
        </nav>
      </article>
    </main>
  );
}
