import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points for each export
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'web/index': 'src/web/index.ts',
    'react/index': 'src/react/index.tsx',
    'next/index': 'src/next/index.ts',
    'node/index': 'src/node/index.ts',
  },

  // Output formats
  format: ['cjs', 'esm'],

  // Generate .d.ts files
  dts: true,

  // Clean output directory before build
  clean: true,

  // Source maps
  sourcemap: true,

  // ⭐ KEY FIX: Bundle everything together
  bundle: true,

  // Don't minify for better debugging
  minify: false,

  // Don't split into chunks
  splitting: false,

  // Target modern environments
  target: 'es2020',

  // External dependencies (don't bundle these)
  external: ['react', 'react-dom', 'next'],

  // Tree shaking
  treeshake: true,

  // Output directory
  outDir: 'dist',

  // ESBuild options for JSX
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});