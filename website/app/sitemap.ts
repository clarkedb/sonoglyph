import type { MetadataRoute } from 'next';
import { ARTICLES, EXAMPLES } from './learn/articles';
import { SITE_URL } from './site';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/learn`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/examples`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/eridian`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/eridian/dictionary`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/eridian/compose`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/eridian/learn`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = ARTICLES.map((article) => ({
    url: `${SITE_URL}/learn/${article.slug}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const exampleRoutes: MetadataRoute.Sitemap = EXAMPLES.map((example) => ({
    url: `${SITE_URL}/examples/${example.slug}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...articleRoutes, ...exampleRoutes];
}
