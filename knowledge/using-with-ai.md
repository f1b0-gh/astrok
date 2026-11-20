---
type: Guide
title: Using these docs with AI
description: Find original Markdown sources and cite them in an assistant's answer.
tags:
  - agents
  - documentation
---
# Using these docs with AI

Give an assistant with **web access** the site's address and a question.
Replace `<DOCS_BASE_URL>` below with the site's origin and deployment prefix,
without a trailing slash:

```text
Read <DOCS_BASE_URL>/llms.txt and <DOCS_BASE_URL>/okf/index.md.
Use <DOCS_BASE_URL>/okf/manifest.json to find the relevant Markdown sources.
Cite the pages supporting your answer. Say when the sources do not answer.
My question: how do I add a page?
```

The manifest links each page to its original Markdown. The same files are in
`knowledge/` for a local agent. Start with [Write a page](writing-content.md)
or [Render Solid components](solid-rendering.md).

A hosted assistant usually cannot reach `localhost` on your computer. Provide
the Markdown files or use a deployment that its tools can access. Private sites
require authorized access.

The documentation site also publishes a derived graph for finding related
pages. Follow its source references before drawing conclusions: a link between
two pages does not establish every claim about them.
