import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    // Unlike docsLoader's private-file convention, OKF accepts _prefixed concepts.
    loader: glob({
      base: './src/content/docs',
      pattern: '**/*.md',
      generateId: ({ entry, data }) => typeof data.slug === 'string' && data.slug ? data.slug : entry.replace(/\.md$/, ''),
    }),
    schema: docsSchema({
      extend: z.object({
        okf: z.object({
          sourcePath: z.string(),
          sourceUrl: z.string(),
          type: z.string().nullable(),
          hasBodyTitle: z.boolean(),
        }).optional(),
      }),
    }),
  }),
};
