# @astrok/astro

`okfIntegration(options?)` publishes canonical OKF sources, a metadata manifest and
optional graph artifacts during Astro setup and source edits. Configuration uses
Zod 4.6.7 to report invalid paths, flags and unknown options before generation.
This server/build dependency does not enter browser bundles. OKF document metadata
is separately opaque and never stripped by the configuration schema.

```js
import { okfIntegration } from '@astrok/astro';
export default {
  base: '/portal/',
  integrations: [okfIntegration({
    root: './knowledge',
    publicDir: './.generated/public',
    presentation: 'plain',
    graph: true,
    sqlite: false,
  })],
};
```

Paths resolve against Astro's project root. `docsDir` defaults to
`src/content/docs`; the default presentation is `starlight` for compatibility.
Plain Astro consumes `loadSite` from `@astrok/okf/site` in application routes and
has no Starlight import or layout dependency. The optional `./starlight` export
makes the existing presentation choice explicit; consumers install/configure
Starlight themselves. `base` defaults to Astro's configured base; an explicit
integration base also updates Astro's route prefix.

Source generation only owns fresh/empty or previously marked directories.
`publicDir/okf` and `publicDir/graph` must be dedicated generated projections;
`llms.txt` belongs to the graph publication. Other public assets remain caller
owned. Preserve `.astrok-owned.json` between generations. The public package does not claim arbitrary populated directories; legacy
unmarked output must be rebuilt in fresh generated directories. Ownership markers
stay in generated source directories for repeat builds; the integration removes
its marker copies from the resolved client build output before deployment.

`graph` defaults to false. Set `graph: true` for JSON publication. SQLite is
also opt-in: set `sqlite: true` or `OKF_SQLITE=1` with graph enabled; an explicit
`sqlite: false` overrides the environment.
Setting `graph: false` skips graph publication. Explicitly choose fresh output
paths when changing publication policy; no broad caller-directory cleanup occurs.


`strictLinks` defaults to true: invalid internal targets, headings, assets,
malformed links and paths escaping the bundle fail Astro setup/build before
publication, with source paths and lines. Existing generated output is retained.
Set `strictLinks: false` for warning-only link checks. Other metadata warnings
remain advisory; external URLs are not fetched. During development, invalid
source edits show an error overlay; fixing the links regenerates output and
reloads the page, including when restoring the previous valid source.

## Native Solid 2

```js
import { defineConfig } from 'astro/config';
import { solidIntegration } from '@astrok/astro/solid';

export default defineConfig({ integrations: [solidIntegration()] });
```

Import a `.tsx` component in an Astro page and use it normally:

```astro
---
import Counter from '../components/Counter';
---
<Counter name="visits" initial={0} client:load />
```

Without a client directive, the result is HTML only. `client:load`, `client:idle`,
`client:visible` and `client:media` hydrate that HTML. Use
`client:only="@astrok/solid"` for browser-only rendering. Default and named Astro
slots are passed as component props (`children` for the default slot).

Install the pinned optional peers when using this integration: `solid-js`,
`@solidjs/web` and `@solidjs/compiler` at `2.0.0`, and
`@solidjs/vite-plugin` at `3.0.1`. They are already installed in this
workspace. The OKF integration alone does not load them.

Astro owns both build graphs; no separate client build is needed for these
components. The native Solid compiler handles JSX for the project. Use Astro
layouts for page metadata. Async Solid rendering is buffered until settled;
this renderer does not implement a streaming HTTP adapter or server-function
RPC. Deployment still uses an Astro adapter chosen by the application.
