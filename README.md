# Astrok

**Write your docs once, in Markdown. Astrok publishes them as a website for
people and as clean, linkable sources for AI agents.**

Astrok is a set of [Astro](https://astro.build/) integrations. You keep a folder
of Markdown files; at build time Astrok turns each file into a web page *and*
publishes the original Markdown with a machine-readable index, so an assistant
can find, read and cite exactly what a human sees. When a page needs to be
interactive, you drop in a [Solid 2](https://www.solidjs.com/) component.

[**See the live demo →**](https://f1b0-gh.github.io/astrok/)

> **Status: early development (0.1.0).** Use a checkout or locally packed
> packages; a public npm release is not available yet. APIs may change.

## Why

For example, keep an API guide in `knowledge/api/auth.md`. A site plus an
`llms.txt` list can point an assistant at that page. Astrok additionally builds
`/api/auth/`, the exact source at `/okf/api/auth.md`, and a manifest entry with
its stable `api/auth` ID, metadata and resolved links from that same file.
Choose Astrok when you need those source and metadata contracts, optional
relationship queries, or Solid 2 interactions. For a prose-only site that just
needs a list of links for assistants, plain Starlight with an `llms.txt` plugin
may be enough.

Most documentation sites are built for browsers. An AI assistant pointed at
them has to scrape rendered HTML, guess which page is authoritative and often
cannot cite a stable source. Copying the docs into a separate "for AI" format
means maintaining two versions that drift apart.

Astrok keeps a single source of truth, the Markdown in `knowledge/`, and
derives everything else from it on every build.

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
| Rendered page | `/first-page/` | People |
| Original Markdown | `/okf/first-page.md` | Agents, downloads, citations |
| Manifest entry | `/okf/manifest.json` | Agents: IDs, titles, metadata, links, URLs |
| Assistant guide *(with graph enabled)* | `/llms.txt` | Agents: where to start and how to cite |
| Graph *(optional)* | `/graph/graph.json`, `/graph/knowledge.sqlite` | Querying relationships between pages |

Links between files are resolved and checked: a broken link or a missing
heading is reported at build time. `npm run validate:okf` fails on these
diagnostics in CI; the standalone validator also supports a warning-only mode. The YAML front matter is kept in the source
but never shown on the rendered page.

Files follow the [Open Knowledge Format](https://okf.md/) (OKF): plain Markdown
with YAML front matter. Nothing is locked into Astrok. **A concept file needs a
`type` field to be published;** reserved `index.md` and `log.md` files follow
their own rules. Other files without a type are skipped, with a warning.

## Try it

You need Node 24.

```sh
git clone https://github.com/f1b0-gh/astrok.git
cd astrok
npm ci
npm run dev
```

Open <http://127.0.0.1:4341/workspace/>. The workspace example shows static
guides, interactive Solid components, shared state between controls, and the
design system.

Other things to try:

- `npm run dev:docs` runs the Astrok user guide, built with
  [Starlight](https://starlight.astro.build/), from the root `knowledge/` folder.
- `npm run build && npm run preview` runs the workspace with its sample
  data service, which adds data loading and live streaming updates. Open
  <http://127.0.0.1:4338/workspace/>.

## Use it in your Astro project

After installing locally packed packages (see [Build and test](BUILDING.md)),
add the integration to `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import { okfIntegration } from '@astrok/astro';

export default defineConfig({
  integrations: [
    okfIntegration({
      root: './knowledge',      // your Markdown folder
      presentation: 'plain',    // or 'starlight' (default) to render with Starlight
      graph: false,             // turn on to publish the relationship graph
    }),
  ],
});
```

With `presentation: 'plain'`, render the pages yourself from your own Astro
routes using `loadSite()` from `@astrok/okf/site`; the
[workspace example](examples/workspace/) shows how. Astrok writes only to
generated folders it owns and refuses to overwrite anything else.

### Add interactive components

```js
import { solidIntegration } from '@astrok/astro/solid';
// integrations: [solidIntegration(), okfIntegration({ ... })]
```

```astro
---
import Counter from '../components/Counter';
---
<Counter name="visits" />              <!-- HTML only, no JavaScript -->
<Counter name="visits" client:load />  <!-- interactive in the browser -->
```

The workspace’s static reading routes ship no JavaScript. Add client directives
where you need hydration. The example pins Solid 2.0.0; package peer ranges
accept compatible Solid 2 releases.

## Point an assistant at your docs

Give an assistant with web access a prompt like this:

```text
Read https://example.com/docs/okf/manifest.json to find the relevant
Markdown sources. Cite the pages you used. Say when the sources
don't answer the question.
My question: how do I add a page?
```

With `graph: true`, `/llms.txt` also provides a navigation/query guide. Include
your deployment base in all URLs. More in [Using these docs with AI](knowledge/using-with-ai.md).

## Packages

| Package | Use it to |
| --- | --- |
| [`@astrok/astro`](packages/astro/README.md) | Add Astrok to an Astro site; render Solid 2 components |
| [`@astrok/okf`](packages/okf/README.md) | Read and validate Markdown bundles, publish sources, build the graph or SQLite index |
| [`@astrok/runtime`](packages/runtime/README.md) | Share state between components; handle cancellable requests and streaming updates |
| [`@astrok/theme`](packages/theme/README.md) | Use the shared styles, design tokens and logos |

`@astrok/runtime/hypermedia` adds an optional, Datastar-style attribute layer
(`data-on`, `data-bind`, …). It runs **trusted, application-written code only**
and requires a Content-Security-Policy that allows `unsafe-eval`. Never feed it
user-supplied HTML.

## Learn more

- [Getting started](knowledge/getting-started.md)
- [Write a page](knowledge/writing-content.md)
- [Render Solid components](knowledge/solid-rendering.md)
- [Architecture](ARCHITECTURE.md)
- [Build and test](BUILDING.md): the full check suite (`npm run verify`)
- [Changelog](CHANGELOG.md) and [release process](RELEASING.md)

## License

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
`@astrok/runtime` is [MIT](packages/runtime/LICENSE) only.
