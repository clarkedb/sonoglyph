import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @sonoglyph/dsp-wasm's runtime (src/index.ts) imports the generated `pkg/`,
// which only exists after `pnpm --filter @sonoglyph/dsp-wasm build:wasm`. When
// it hasn't been built, alias the package to a stub so `pnpm dev`/`build`
// still work with no Rust toolchain — the benchmark panel degrades to a
// "build WASM to enable" state. When it has, use the real package.
const wasmBuilt = existsSync(
  fileURLToPath(new URL('../../packages/dsp-wasm/pkg/sonoglyph_dsp_bg.wasm', import.meta.url)),
);
const wasmStub = fileURLToPath(new URL('./src/wasm-stub.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: wasmBuilt ? [] : [{ find: '@sonoglyph/dsp-wasm', replacement: wasmStub }],
  },
});
