---
type: Guide
title: Getting started
description: Run Astrok locally and choose between the workspace and documentation examples.
---
# Getting started

Astrok combines static Astro pages, optional Solid interactions and Markdown
sources that an agent can read directly. Start with the included examples;
there is no published Astrok package to install from npm yet.

## Run the workspace

From a checkout of this repository, using Node 24:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4341/workspace/`. This starts the frontend development
server. To try the sample rows and streaming updates, use the bundled service:

```sh
npm run build
npm run preview
```

Then open `http://127.0.0.1:4338/workspace/`. The two panels have separate state;
their data is synthetic and disappears when the page is restarted.

## Run the documentation example

```sh
npm run dev:docs
```

Open the address printed by Astro. This example uses Starlight and reads the
root `knowledge/` directory. The workspace example reads
`examples/workspace/knowledge/` instead. Changes belong in those source files,
not in the generated pages.

Next, [write a page](writing-content.md) or [try an AI assistant](using-with-ai.md).
