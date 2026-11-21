---
type: Guide
title: Getting started
description: Run the examples or install Astrok in your own Astro project.
---

# Getting started

Astrok combines static Astro pages, optional Solid interactions and Markdown sources that an agent
can read directly. Try the included examples or install the npm beta in an existing Astro project.

## Run the workspace

From a checkout of this repository, using Node 24:

```sh
git clone https://github.com/f1b0-gh/astrok.git
cd astrok
npm ci
npm run dev
```

Open `http://127.0.0.1:4341/workspace/`. This starts the frontend development server. To try the
sample rows and streaming updates, use the bundled service:

```sh
npm run build
npm run preview
```

Then open `http://127.0.0.1:4338/workspace/`. The two panels have separate state; their data is
synthetic and disappears when the page is restarted.

## Run the documentation example

```sh
npm run dev:docs
```

Open the address printed by Astro. This example uses Starlight and reads the root `knowledge/`
directory. The workspace example reads `examples/workspace/knowledge/` instead. Changes belong in
those source files, not in the generated pages.

## Use it in your Astro project

Use Node 24. In your Astro project, install the beta packages and Markdown renderer:

```sh
npm install astro@7.4.13 @astrojs/markdown-remark@7.3.9 \
  @astrokjs/astro@0.1.0-beta.1 @astrokjs/okf@0.1.0-beta.1
```

These exact versions reproduce the tested setup. The `next` tag tracks the current beta; Astrok
accepts compatible Astro `^7.4.13` updates. The setup below uses plain Astro. For Starlight, install
`@astrojs/starlight@0.43.1` and use the
[Astro config](https://github.com/f1b0-gh/astrok/blob/main/astro.config.mjs) and
[collection config](https://github.com/f1b0-gh/astrok/blob/main/src/content.config.ts) as
references.

Create `knowledge/first-page.md`:

```markdown
---
type: Guide
title: My first page
description: A short example of an Astrok document.
---

# My first page

This is the text visitors will read. [Back to the start](index.md)
```

Add the integration to `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import { okfIntegration } from '@astrokjs/astro';

export default defineConfig({
  integrations: [
    okfIntegration({
      root: './knowledge',
      presentation: 'plain',
    }),
  ],
});
```

Graph output is off by default; enable it with `graph: true`. Generated sources go in `public/okf/`.
Add `/public/okf/` to your project's `.gitignore` (and `/public/graph/` plus `/public/llms.txt` if
you enable the graph). Alternatively, set `publicDir: './.generated/public'` and ignore
`/.generated/`; this changes Astro's public directory too, so keep any other public assets there.

Plain mode needs a page route. Create `src/pages/[...slug].astro`:

```astro
---
import type { GetStaticPaths } from 'astro';
import { loadSite, normalizeBase } from '@astrokjs/okf/site';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
export const getStaticPaths = (async () => {
  const base = normalizeBase(import.meta.env.BASE_URL);
  const { documents } = await loadSite({ root: 'knowledge', base });
  const markdown = await createMarkdownProcessor();
  return Promise.all(
    documents.map(async (doc) => ({
      params: {
        slug: decodeURIComponent(doc.url.slice(base.length).replace(/\/$/, '')) || undefined,
      },
      props: { title: doc.title, html: (await markdown.render(doc.body)).code },
    })),
  );
}) satisfies GetStaticPaths;
const { title, html } = Astro.props;
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{title}</title>
  </head>
  <body>
    <main set:html={html} />
  </body>
</html>
```

This renders `knowledge/first-page.md` at `/first-page/`, with frontmatter removed and Markdown
links resolved. Keep the route's `root` aligned with the integration. An existing
`src/pages/index.astro` takes precedence over the bundle's home page; remove it if the bundle should
supply `/`. The earlier example also links to `index.md`, so create `knowledge/index.md` with
`# Home` and a list item `- [First page](first-page.md)` before building.

Astrok writes only to generated folders it owns and refuses to overwrite anything else. The
[workspace example](https://github.com/f1b0-gh/astrok/tree/main/examples/workspace) adds a layout
and links to the original Markdown.

Next, [write a page](writing-content.md) or [try an AI assistant](using-with-ai.md).
