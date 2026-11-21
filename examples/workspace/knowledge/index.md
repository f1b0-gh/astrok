---
okf_version: "0.3"
title: Astrok
description: Write your docs once in Markdown. Publish a website for people and exact sources for AI agents.
---
# Astrok

**Write your docs once, in Markdown. Astrok publishes them as a website for
people and as clean, linkable sources for AI agents.**

Keep one folder of Markdown. Astro turns it into readable pages, while Astrok
publishes the original files, stable IDs and metadata for assistants to find and
cite. Add Solid 2 components wherever a page needs interaction.

## What you're looking at

This site is built with Astrok. Its reading pages come from the Markdown in
[the example's knowledge folder](https://github.com/f1b0-gh/astrok/tree/main/examples/workspace/knowledge).
Use **View Markdown** and **Agent manifest** below to compare a page with its
published source. The interactive demos show what you can add to those pages.

- [Workspace guide](guide.md) — Shared controls, local state and optional data requests.
- [For AI agents](agents.md) — A ready-to-use prompt and links to exact sources.

## Try Astrok locally

With Node 24 installed:

```sh
git clone https://github.com/f1b0-gh/astrok.git
cd astrok
npm ci
npm run dev
```

Open `http://127.0.0.1:4341/workspace/` for the interactive example. The pages
and source downloads remain readable without JavaScript.

To add Astrok to an existing Astro project, follow the
[installation instructions](https://github.com/f1b0-gh/astrok#use-it-in-your-astro-project).
The integration uses `@astrokjs/astro` and `@astrokjs/okf`. Packages are currently
installed from local tarballs; there is no public npm release yet.
