# Astrok

**Write your docs once, in Markdown. Astrok publishes them as a website for
people and as clean, linkable sources for AI agents.**

Built on [Astro](https://astro.build/), with optional
[Solid 2](https://www.solidjs.com/) interactions. Packages use the `@astrokjs` scope.

[**See the live demo →**](https://f1b0-gh.github.io/astrok/)

> **Status: early development (0.1.0).** Use a checkout or locally packed
> packages; a public npm release is not available yet. APIs may change.

## Why

Most documentation sites are built for browsers. An AI assistant pointed at
them has to scrape rendered HTML, guess which page is authoritative and often
cannot cite a stable source. Copying the docs into a separate "for AI" format
means maintaining two versions that drift apart.

Use Astrok when you need stable IDs, exact sources and metadata, optional
relationship queries, or Solid 2 interactions. For a prose-only site that just
needs a list of links for assistants, plain Starlight with an `llms.txt` plugin
may be enough.

## What you get from one Markdown file

Given `knowledge/first-page.md`:

```markdown
---
type: Guide
title: My first page
description: A short example of an Astrok document.
---
# My first page

This is the text visitors will read. [Back to the start](index.md)
```

the build publishes:

| Output | URL | For |
| --- | --- | --- |
| Rendered page¹ | `/first-page/` | People |
| Original Markdown | `/okf/first-page.md` | Agents, downloads, citations |
| Manifest entry | `/okf/manifest.json` | Agents: IDs, titles, metadata, links, URLs |
| Assistant guide (graph enabled) | `/llms.txt` | Navigation and citation guidance |
| Graph (opt-in) | `/graph/graph.json` | Page relationships |
| SQLite index (opt-in) | `/graph/knowledge.sqlite` | Relationship queries |

¹ Rendered pages require Starlight or your own Astro route, such as the
plain-mode route below. Sources and the manifest are published in both modes.

Broken internal links and missing headings **fail the build** by default.
Set `strictLinks: false` to log warnings instead. External URLs are not fetched.

Files follow the [Open Knowledge Format](https://okf.md/) (OKF).
**A concept file needs a `type` field;** other files without one are skipped with
a warning. Reserved `index.md` and `log.md` files have their own rules.
Frontmatter stays in the source and is hidden on rendered pages.

## Try it

You need Node 24.

```sh
git clone https://github.com/f1b0-gh/astrok.git
cd astrok
npm ci
npm run dev
```

Open <http://127.0.0.1:4341/workspace/> for guides and interactive demos.

- `npm run dev:docs` opens the Starlight user guide.
- `npm run build && npm run preview` includes the sample data and streaming
  service at <http://127.0.0.1:4338/workspace/>.

## Use it in your Astro project

Until the first npm release, install from local tarballs. In the Node 24
checkout from [Try it](#try-it):

```sh
npm ci
npm run build:packages
mkdir -p artifacts/local
npm pack ./packages/okf --ignore-scripts --pack-destination artifacts/local
npm pack ./packages/astro --ignore-scripts --pack-destination artifacts/local
```

Then install both tarballs together in your existing Astro project. Replace
these absolute paths with your local paths:

```sh
ASTROK_PACKAGES=/absolute/path/to/astrok/artifacts/local
cd /absolute/path/to/your-astro-project
npm install astro@7.4.13 @astrojs/markdown-remark@7.3.9 \
  "$ASTROK_PACKAGES/astrokjs-okf-0.1.0.tgz" \
  "$ASTROK_PACKAGES/astrokjs-astro-0.1.0.tgz"
```

Install both together to resolve the internal dependency locally. The setup
below uses plain Astro. For Starlight, install `@astrojs/starlight@0.43.1` and
use the [Astro config](astro.config.mjs) and
[collection config](src/content.config.ts) as references.

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

Graph output is off by default; enable it with `graph: true`.
Generated sources go in `public/okf/`. Add
`/public/okf/` to your project's `.gitignore` (and `/public/graph/` plus
`/public/llms.txt` if you enable the graph). Alternatively, set
`publicDir: './.generated/public'` and ignore `/.generated/`; this changes
Astro's public directory too, so keep any other public assets there.

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
  return Promise.all(documents.map(async doc => ({
    params: {
      slug: decodeURIComponent(doc.url.slice(base.length).replace(/\/$/, '')) ||
        undefined,
    },
    props: { title: doc.title, html: (await markdown.render(doc.body)).code },
  })));
}) satisfies GetStaticPaths;
const { title, html } = Astro.props;
---
<html lang="en">
  <head><meta charset="utf-8" /><title>{title}</title></head>
  <body><main set:html={html} /></body>
</html>
```

This renders `knowledge/first-page.md` at `/first-page/`, with frontmatter
removed and Markdown links resolved. Keep the route's `root` aligned with the
integration. An existing `src/pages/index.astro` takes precedence over the
bundle's home page; remove it if the bundle should supply `/`. The earlier
example also links to `index.md`, so create `knowledge/index.md` with
`# Home` and a list item `- [First page](first-page.md)` before building.

Astrok writes only to generated folders it owns and refuses to overwrite
anything else. The [workspace example](examples/workspace/) adds a layout
and links to the original Markdown.

### Optional interactions

Add `solidIntegration()` from `@astrokjs/astro/solid` to use Solid 2 components.
See the [Solid setup instructions](packages/astro/README.md#native-solid-2).

```astro
---
import Counter from '../components/Counter';
---
<Counter name="visits" />              <!-- HTML only, no JavaScript -->
<Counter name="visits" client:load />  <!-- interactive in the browser -->
```

Components without a `client:` directive render to HTML and ship no JavaScript.

## Point an assistant at your docs

With the default configuration (graph disabled), start from the manifest:

```text
Read https://example.com/docs/okf/manifest.json to find the relevant
Markdown sources. Cite the pages you used. Say when the sources
don't answer the question.
My question: how do I add a page?
```

With `graph: true`, start from the generated navigation and query guide:

```text
Read https://example.com/docs/llms.txt for navigation and query guidance.
Use the linked manifest to find the relevant Markdown sources. Cite the
pages you used. Say when the sources don't answer the question.
My question: how do I add a page?
```

Both examples include a `/docs/` deployment base; use your site's actual base
in every URL. More in [Using these docs with AI](knowledge/using-with-ai.md).

## Packages

| Package | Use it to |
| --- | --- |
| [@astrokjs/astro][astro-pkg] | Astro integration and Solid 2 rendering |
| [@astrokjs/okf][okf-pkg] | Markdown bundles, sources and optional indexes |
| [@astrokjs/runtime][runtime-pkg] | Shared state, requests and streaming updates |
| [@astrokjs/theme][theme-pkg] | Shared styles, design tokens and logos |

[astro-pkg]: packages/astro/README.md
[okf-pkg]: packages/okf/README.md
[runtime-pkg]: packages/runtime/README.md
[theme-pkg]: packages/theme/README.md

Optional [hypermedia bindings](packages/runtime/README.md) name registered
JavaScript handlers; `data-bind` names a state path. No CSP `unsafe-eval` is
needed. HTML fragments must be trusted application code, never user content.

## Learn more

- [Getting started](knowledge/getting-started.md)
- [Write a page](knowledge/writing-content.md)
- [Render Solid components](knowledge/solid-rendering.md)
- [Architecture](ARCHITECTURE.md)
- [Build and test](BUILDING.md): the full check suite (`npm run verify`)
- [Changelog](CHANGELOG.md) and [release process](RELEASING.md)

## License

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
`@astrokjs/runtime` is [MIT](packages/runtime/LICENSE) only.
