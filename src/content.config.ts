/**
 * Markdown content collections (see docs: content model). The owner edits copy here, never in code.
 * Entry ids look like `en/index`, `es/privacidad`: the first segment is the language.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** Ids keep the language folder and file name: `en/index`, `es/privacidad`. */
const generateId = ({ entry }: { entry: string }) => entry.replace(/\.md$/, '');

const meta = {
  title: z.string().min(1).max(70),
  description: z.string().min(50).max(160),
};

const landing = defineCollection({
  loader: glob({ pattern: '{en,es}/index.md', base: './src/content/landing', generateId }),
  schema: z.object({
    ...meta,
    hero: z.object({
      eyebrow: z.string(),
      headline: z.string(),
      sub: z.string(),
      primaryCta: z.string(),
      secondaryCta: z.string(),
      note: z.string(),
    }),
    blocks: z
      .array(z.object({ key: z.enum(['note', 'understand', 'plan']), title: z.string(), text: z.string() }))
      .length(3),
    dataBlock: z.object({ title: z.string(), items: z.array(z.string()).min(1) }),
    finalCta: z.object({ title: z.string(), text: z.string(), primary: z.string(), secondary: z.string() }),
  }),
});

const faq = defineCollection({
  loader: glob({ pattern: '{en,es}/*.md', base: './src/content/faq', generateId }),
  schema: z.object({ question: z.string(), order: z.number().int() }),
});

const legal = defineCollection({
  loader: glob({ pattern: '{en,es}/*.md', base: './src/content/legal', generateId }),
  schema: z.object({ ...meta, updated: z.coerce.date() }),
});

const pages = defineCollection({
  loader: glob({ pattern: '{en,es}/*.md', base: './src/content/pages', generateId }),
  schema: z.object({
    title: z.string(),
    lead: z.string(),
    primary: z.string(),
    secondary: z.string().optional(),
  }),
});

/** Transactional emails. Body placeholders: `{{code}}`, `{{deleteDate}}`, `{{signInUrl}}`. */
const emails = defineCollection({
  loader: glob({ pattern: '{en,es}/*.md', base: './src/content/emails', generateId }),
  schema: z.object({ subject: z.string().min(1).max(80), preheader: z.string().max(120) }),
});

export const collections = { landing, faq, legal, pages, emails };
