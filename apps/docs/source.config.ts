import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

// @ts-ignore
export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {},
});
