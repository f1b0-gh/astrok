# Astrok

Astrok brings documentation and interactive tools into the same Astro site.
Write the content in Markdown, add Solid 2 components where readers need to
interact, and publish the original sources alongside the pages.

The aim is to maintain the knowledge once. People get a readable website;
AI agents get the same content as Markdown, with a manifest for finding it.
[Open Knowledge Format](https://okf.md/) keeps the content portable. An optional
graph helps navigate relationships between documents.

Astro builds the pages and Solid handles interactions. Astrok connects them to
the knowledge bundle and provides the shared styles and runtime. The
[workspace example](examples/workspace/README.md) puts those pieces together:
static guides, hydrated counters, shared controls and a design-system preview.

## Try it

[Open the preview](https://f1b0-gh.github.io/astrok/workspace/).

To run it locally with Node 24:

```sh
npm ci
npm run dev
```

The local workspace is at `http://127.0.0.1:4341/workspace/`; the Solid demo
is at `/solid/`. The sample JSON/SSE service runs locally with
`npm run build` followed by `npm run preview`.

`npm run dev:docs` starts the Starlight documentation example.
[Build and test](BUILDING.md) lists the verification commands.

## Packages

| Package | What it does |
| --- | --- |
| [okf](packages/okf/README.md) | Read and publish content; optionally build a graph or SQLite index |
| [astro](packages/astro/README.md) | Connect OKF and native Solid 2 rendering to Astro |
| [runtime](packages/runtime/README.md) | Share state and handle cancellable requests and streaming updates |
| [theme](packages/theme/README.md) | Provide styles, design tokens and logos |

Astrok is under development and uses a pinned Solid 2 release candidate.
The optional hypermedia layer accepts trusted application content.

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
The imported [runtime](packages/runtime/README.md) retains its [MIT license](packages/runtime/LICENSE).
