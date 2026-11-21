# Astrok

**Write your docs once, in Markdown. Astrok publishes them as a website for people and as clean,
linkable sources for AI agents.**

Built on [Astro](https://astro.build/), with optional [Solid 2](https://www.solidjs.com/)
interactions. Packages use the `@astrokjs` scope.

[**See the live demo →**](https://f1b0-gh.github.io/astrok/)

> **Status: early development (0.1.0-beta.1).** Use a checkout or locally packed packages; a public
> npm release is not available yet. APIs may change.

## Why

Most documentation sites are built for browsers. An AI assistant pointed at them has to scrape
rendered HTML, guess which page is authoritative and often cannot cite a stable source. Copying the
docs into a separate "for AI" format means maintaining two versions that drift apart.

Use Astrok when you need stable IDs, exact sources and metadata, optional relationship queries, or
Solid 2 interactions. For a prose-only site that just needs a list of links for assistants, plain
Starlight with an `llms.txt` plugin may be enough.

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

| Output                          | URL                       | For                                        |
| ------------------------------- | ------------------------- | ------------------------------------------ |
| Rendered page¹                  | `/first-page/`            | People                                     |
| Original Markdown               | `/okf/first-page.md`      | Agents, downloads, citations               |
| Manifest entry                  | `/okf/manifest.json`      | Agents: IDs, titles, metadata, links, URLs |
| Assistant guide (graph enabled) | `/llms.txt`               | Navigation and citation guidance           |
| Graph (opt-in)                  | `/graph/graph.json`       | Page relationships                         |
| SQLite index (opt-in)           | `/graph/knowledge.sqlite` | Relationship queries                       |

¹ Rendered pages require Starlight or your own Astro route, such as the plain-mode route in the
[installation guide](knowledge/getting-started.md). Sources and the manifest are published in both
modes.

Broken internal links and missing headings **fail the build** by default. Set `strictLinks: false`
to log warnings instead. External URLs are not fetched.

Files follow the [Open Knowledge Format](https://okf.md/) (OKF). **A concept file needs a `type`
field;** other files without one are skipped with a warning. Reserved `index.md` and `log.md` files
have their own rules. Frontmatter stays in the source and is hidden on rendered pages.

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
- `npm run build && npm run preview` includes the sample data and streaming service at
  <http://127.0.0.1:4338/workspace/>.

## Use it in your Astro project

Follow the [installation guide](knowledge/getting-started.md#use-it-in-your-astro-project) for the
package install, Astro configuration and plain-page route. Until the first npm release, it uses
local tarballs built from this repository.

### Optional interactions

Add `solidIntegration()` from `@astrokjs/astro/solid` to use Solid 2 components. See the
[Solid setup instructions](packages/astro/README.md#native-solid-2).

```astro
---
import Counter from '../components/Counter';
---

<Counter name="visits" /> <!-- HTML only, no JavaScript -->
<Counter name="visits" client:load /> <!-- interactive in the browser -->
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

Both examples include a `/docs/` deployment base; use your site's actual base in every URL. More in
[Using these docs with AI](knowledge/using-with-ai.md).

## Packages

| Package                          | Use it to                                      |
| -------------------------------- | ---------------------------------------------- |
| [@astrokjs/astro][astro-pkg]     | Astro integration and Solid 2 rendering        |
| [@astrokjs/okf][okf-pkg]         | Markdown bundles, sources and optional indexes |
| [@astrokjs/runtime][runtime-pkg] | Shared state, requests and streaming updates   |
| [@astrokjs/theme][theme-pkg]     | Shared styles, design tokens and logos         |

[astro-pkg]: packages/astro/README.md
[okf-pkg]: packages/okf/README.md
[runtime-pkg]: packages/runtime/README.md
[theme-pkg]: packages/theme/README.md

Optional [hypermedia bindings](packages/runtime/README.md) name registered JavaScript handlers;
`data-bind` names a state path. No CSP `unsafe-eval` is needed. HTML fragments must be trusted
application code, never user content.

## Learn more

- [Getting started](knowledge/getting-started.md)
- [Write a page](knowledge/writing-content.md)
- [Render Solid components](knowledge/solid-rendering.md)
- [Architecture](ARCHITECTURE.md)
- [Build and test](BUILDING.md): the full check suite (`npm run verify`)
- [Changelog](CHANGELOG.md) and [release process](RELEASING.md)
- [Contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md)

## License

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option. `@astrokjs/runtime` is
[MIT](packages/runtime/LICENSE) only.
