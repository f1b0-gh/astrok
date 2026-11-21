---
type: Guide
title: Render Solid components
description: Add server-rendered Solid 2 components and hydrate them with Astro client directives.
---

# Render Solid components

Add `solidIntegration()` from `@astrokjs/astro/solid` to your Astro configuration. In this
repository, the workspace example already has it configured. Run `npm run dev` and open `/solid/`.

```astro
---
import Counter from '../components/Counter';
---

<Counter name="visits" initial={0} client:load />
```

The server sends the component's HTML. Astro loads its browser module and Solid attaches reactive
behavior to the existing elements. Omit `client:load` when you only need HTML. Other choices are
`client:idle`, `client:visible`, `client:media="(min-width: 800px)"`, or
`client:only="@astrokjs/solid"` when a component cannot run on the server.

Keep state inside the component or its owned context. Module-level state would be shared across
server requests. Read props through `props.name`; Solid 2 uses `@solidjs/web` for rendering and
draft callbacks for store updates.

Astro slots become props: default content is `children`, named content uses its slot name. Use Astro
layouts for the document head. Native components do not need the separate `.client` build used by
the hypermedia workspace example.

The example pins Solid 2.0.1, including its web runtime and compiler. Async rendering waits for
completion before handing HTML to Astro. This does not add a deployment adapter, a streaming HTTP
transport or server-function RPC.
