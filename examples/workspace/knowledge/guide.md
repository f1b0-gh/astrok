---
type: Guide
title: Workspace guide
description:
  A walkthrough of the interactive workspace, its controls and what the example demonstrates.
future:
  nested:
    retained: true
---

# Workspace guide

The workspace combines a static Astro page, HTML controls, a Solid table and a small example
service. Alpha and Beta are made-up datasets. Choose **Demos → Workspace** in the navigation to try
it.

The interactive panels need JavaScript and the example service. With a repository checkout,
`npm run build` and `npm run preview` start the complete example at
`http://127.0.0.1:4338/workspace/`. The development server on port 4341 runs the frontend only. This
guide remains readable without either service.

## Hosted sample

On GitHub Pages, selection, click counts and Solid counters work in the browser. **Load rows**,
**Stream summary** and **Request failure** are disabled because they need the local example service.
Use the preview command above to try them. The **Solid components** and **Design system** navigation
links work on either host.

## Try it

**First workspace** and **Second workspace** have separate state. In the first:

1. Choose **Beta** in **Selection**. Its **Selected** value becomes `beta`; the second panel stays
   on `alpha`.
2. Press **Load rows**. The service returns 240 rows, with 100 initially shown. **Show next 100
   rows** reveals more of the already downloaded rows.
3. Press **Toggle selection**. The dropdown changes too. Press **Load rows** again to fetch that
   dataset; changing selection alone does not fetch rows.
4. Press **Count click**. Only this panel's count increases.
5. Press **Stream summary**. The summary ends at **Stream complete**, and the message below **Panel
   note** becomes **Server fragment updated**.

**Before mount**, the initial summary, demonstrates an update received before the controls were
ready. It is not an error.

## Explore the failure cases

- **Request failure** asks the service for a `503` response. **Load rows** makes a normal request
  afterward.
- **Test update protection** attempts to replace Solid's controls with server HTML. A rejection
  message is expected; the controls stay usable.
- **Remount workspaces** resets both panels. **Alternate workspace** starts a fresh instance.
  Counts, notes and results are not saved across navigation.

## How the pieces work together

| Part            | Role                                                               |
| --------------- | ------------------------------------------------------------------ |
| Astro           | Builds the page and its initial HTML controls.                     |
| Shared state    | Holds each panel's selection, count, note and summary.             |
| HTML adapter    | Connects attributes to state and applies trusted server fragments. |
| Solid           | Creates action buttons and tables, and owns request state.         |
| Example service | Returns sample JSON rows and a short stream of updates.            |

A new request cancels the previous one; an obsolete response cannot replace the current result.
**Stream summary** reads Datastar-compatible signal and element messages through Astrok's adapter.
This is a short stream that closes, not an ongoing subscription, and the Datastar browser runtime is
not loaded.

The HTML adapter updates registered regions and protects Solid's containers. Its attributes name
registered JavaScript callbacks, bundled with the page, so this optional layer works without CSP
`unsafe-eval`. Fetched fragments use the same registered names. Region protection does not make
untrusted HTML safe. Solid can also use state and transport directly without the hypermedia layer.

These state and transport helpers come from
[`@astrokjs/runtime`](https://github.com/f1b0-gh/astrok/tree/main/packages/runtime). The optional
HTML adapter is its `@astrokjs/runtime/hypermedia` entry point; the demo's styles come from
[`@astrokjs/theme`](https://github.com/f1b0-gh/astrok/tree/main/packages/theme).

Vite compiles Solid before Astro bundles the final browser assets. Navigation and remounting dispose
components, listeners, requests and streams before a fresh setup. The main source files are
`src/components/Workspace.astro`, `src/client/workspace.tsx` and `fixture.mjs` under
`examples/workspace/`.

For the original Markdown and document manifest, use the links below or read
[For AI agents](agents.md).

## Native Solid rendering

Open `/solid/` (under the same deployment prefix) to try normal Astro client directives with Solid 2
components. The counters arrive as HTML and hydrate in place. `/solid-static/` renders HTML only.
These pages use Astro's own compiler pipeline; the shared hypermedia workspace above keeps its
separate client build.
