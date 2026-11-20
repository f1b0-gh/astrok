# Astrok

Build Astro sites with Solid 2 interactions and Markdown that both people and
agents can use. OKF files in `knowledge/` are the source; Astrok publishes pages,
raw Markdown and a discovery manifest from them.

| Package | What it does |
| --- | --- |
| [okf](packages/okf/README.md) | Parse and publish content; optionally build a graph or SQLite index |
| [astro](packages/astro/README.md) | OKF publication and native Solid 2 rendering for Astro |
| [runtime](packages/runtime/README.md) | Shared Solid state, cancellable requests and streaming updates |
| [theme](packages/theme/README.md) | Shared styles, design tokens and logos |

## Try it

With Node 24:

```sh
npm ci
npm run dev
```

Open [the workspace](http://127.0.0.1:4341/workspace/). To try its synthetic
JSON/SSE service, run `npm run build` followed by `npm run preview`, then open
[the preview](http://127.0.0.1:4338/workspace/).

The [workspace example](examples/workspace/README.md) shows static pages and
interactive components together. `npm run dev:docs` runs the optional Starlight
example. See [Building and testing](BUILDING.md) for the full checks.

Try `/solid/` for server-rendered Solid components with Astro hydration, or
`/solid-static/` for HTML without client JavaScript. The optional hypermedia layer
accepts trusted application content. Astrok is under development.

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option. The imported [runtime](packages/runtime/README.md) retains
its [MIT license](packages/runtime/LICENSE).
