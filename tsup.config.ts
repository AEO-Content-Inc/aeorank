import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    target: 'node18',
    sourcemap: true,
  },
]);
