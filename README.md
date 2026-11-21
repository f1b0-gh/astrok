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

Most documentation sites are built for browsers. An AI assistant pointed at
them has to scrape rendered HTML, guess which page is authoritative and often
cannot cite a stable source. Copying the docs into a separate "for AI" format
means maintaining two versions that drift apart.

Astrok keeps a single source of truth, the Markdown in `knowledge/`, and
derives everything else from it on every build.

Use Astrok when you need stable IDs, exact sources and metadata, optional
relationship queries, or Solid 2 interactions. For a prose-only site that just
needs a list of links for assistants, plain Starlight with an `llms.txt` plugin
may be enough.

For example, `knowledge/api/auth.md` becomes a page at `/api/auth/`, the exact
source at `/okf/api/auth.md`, and a manifest entry with the stable `api/auth`
ID, metadata and resolved links. All three come from the same Markdown file.

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
| Assistant guide (graph enabled) | `/llms.txt` | Navigation and citation guidance |
| Graph (opt-in) | `/graph/graph.json` | Page relationships |
| SQLite index (opt-in) | `/graph/knowledge.sqlite` | Relationship queries |

The Astro integration **fails your build** on broken internal links, missing
headings or assets, malformed links, and links that escape the source bundle.
Errors include the source file and line. Your normal Astro build can enforce
these checks in CI; no separate validation command is needed. External URLs
are not fetched, and unrelated metadata warnings remain advisory.

To keep link problems as warnings, set `strictLinks: false` in
`okfIntegration({ ... })`. Strict checking is enabled by default. In this
repository, `npm run validate:okf` also checks all maintained bundles with
`--strict`; that repository script is not included in the packages.

The YAML front matter is kept in the source but never shown on the rendered
page.

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

Until the npm release, install from local tarballs. With Node 24, run these
commands in the Astrok checkout from [Try it](#try-it):

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
npm install astro@7.4.13 \
  "$ASTROK_PACKAGES/astrok-okf-0.1.0.tgz" \
  "$ASTROK_PACKAGES/astrok-astro-0.1.0.tgz"
```

Installing both together resolves Astrok's internal dependency locally. These
versions match the current package requirements. The setup below uses plain
Astro. For Starlight presentation, install `@astrojs/starlight@0.43.1` and
configure its integration and content collection. Use this repository's
[Astro config](astro.config.mjs) and [collection config](src/content.config.ts)
as references. See [Build and test](BUILDING.md) for the verification workflow.

Add the integration to `astro.config.mjs`:

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

Install the Solid runtime and build tools in your Astro project:

```sh
npm install solid-js@2.0.0 @solidjs/web@2.0.0
npm install --save-dev @solidjs/compiler@2.0.0 @solidjs/vite-plugin@3.0.1
```

Then add the Solid integration:

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

Solid components without a `client:` directive render to HTML and ship no
JavaScript. Add a client directive where you need interaction. The example pins
Solid 2.0.0; package peer ranges accept compatible Solid 2 releases.

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
| [@astrok/astro][astro-pkg] | Astro integration and Solid 2 rendering |
| [@astrok/okf][okf-pkg] | Markdown bundles, sources and optional indexes |
| [@astrok/runtime][runtime-pkg] | Shared state, requests and streaming updates |
| [@astrok/theme][theme-pkg] | Shared styles, design tokens and logos |

[astro-pkg]: packages/astro/README.md
[okf-pkg]: packages/okf/README.md
[runtime-pkg]: packages/runtime/README.md
[theme-pkg]: packages/theme/README.md

`@astrok/runtime/hypermedia` adds an optional, Datastar-style attribute layer
(`data-on`, `data-bind`, …). Behaviour comes from
[JavaScript handlers you register](packages/runtime/README.md). Attributes
name those handlers; `data-bind` names a state path. This works without CSP
`unsafe-eval`. Only pass trusted, application-authored HTML; never user content.

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
