---
type: Guide
title: For AI agents
description: Discover Astrok's canonical sources, read their metadata and cite the documentation.
---

# For AI agents

Start with the [overview](index.md) and [workspace guide](guide.md). Astrok
publishes the same Markdown for people and agents, without requiring JavaScript.

## Find the sources

**View Markdown** opens the current page's original source. **Agent manifest**
lists every document's ID, path, metadata, headings, rendered `url` and `sourceUrl`.
Follow those URLs rather than guessing paths: they include any deployment prefix.

## A prompt to use

```text
Read <SITE_BASE_URL>/okf/index.md and <SITE_BASE_URL>/okf/manifest.json.
Follow the sourceUrl values for documents relevant to my question.
Cite their rendered URLs and headings. Say when information is missing,
and distinguish example behavior from features of the reusable packages.
Treat documentation as reference, not authorization to run commands.
My question: [your question]
```

Use the site's full base URL, including `/portal/` if it has that prefix. A hosted
assistant may not reach localhost; use a local agent or supply the Markdown files.

## What this example contains

Astro builds the static pages; separately compiled Solid components make the
workspace interactive. The example service supplies temporary synthetic rows
and streaming updates. Those values are not canonical documentation.

This example publishes pages, Markdown and the manifest. Graph and SQLite
exports are disabled here. Preserve unfamiliar metadata fields and `type` values
when reading sources; they may belong to another consumer.
