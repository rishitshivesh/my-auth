import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points for each export
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'web/index': 'src/web/index.ts',
    'react/index': 'src/react/index.tsx',  // Changed to .tsx
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

  // Don't minify for better debugging
  minify: false,

  // Split code by entry points
  splitting: false,

  // Target modern environments
  target: 'es2020',

  // External dependencies (don't bundle)
  external: ['react', 'react-dom', 'next'],

  // Tree shaking
  treeshake: true,

  // Output directory
  outDir: 'dist',

  // JSX configuration
  jsx: 'automatic',
});