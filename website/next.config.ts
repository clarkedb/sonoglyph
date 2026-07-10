import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Linting and type-checking are owned by the repo-root `pnpm lint` /
  // `pnpm typecheck` steps (ESLint flat config + tsc), so Next doesn't need
  // to re-run them during `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
