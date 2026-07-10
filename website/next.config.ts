import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages export raw TypeScript source (`./src/index.ts`);
  // Next must compile them like app code.
  transpilePackages: [
    '@sonoglyph/core',
    '@sonoglyph/dsp',
    '@sonoglyph/plugin-dtmf',
    '@sonoglyph/plugin-morse',
    '@sonoglyph/plugin-sdk',
    '@sonoglyph/react',
  ],
};

export default nextConfig;
