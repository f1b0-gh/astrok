---
type: Guide
title: Write a page
description: Add a canonical Markdown page and find its rendered and raw versions.
---

# Write a page

Each example has its own `knowledge/` directory. A Markdown file there becomes a page, a raw source
download and an entry in the agent manifest.

## Add a document

For the Starlight example, create `knowledge/first-page.md`:

```markdown
---
type: Guide
title: My first page
description: A short example of an Astrok document.
---

# My first page

This is the text visitors will read.

[Back to the start](getting-started.md)
```

Add a link to it in `knowledge/index.md`, then run `npm run dev:docs`. Open `/first-page/` on the
local site. **View Markdown** shows the original file; the rendered page shows its body without the
YAML metadata.

The file path gives the document its ID: `first-page.md` becomes `first-page`. Keeping the path
stable keeps existing links useful. Use relative Markdown links between documents, including a
heading fragment when needed.

## Find the same content as an agent

`/okf/manifest.json` lists document IDs, metadata, rendered URLs and source URLs. Follow those URLs:
they include the site's deployment prefix. In the workspace example, use the **Agent manifest** link
below each documentation page.

Both example bundles declare OKF 0.3. Extra metadata fields are preserved. The Starlight example
publishes graph exports; the plain workspace example publishes pages and the document manifest with
graph and SQLite exports disabled.

Run `npm run validate:okf` to check the root bundle. For the workspace bundle, run
`node scripts/validate-okf.mjs examples/workspace/knowledge`.

For optional provenance and review metadata, consult the [OKF specification](https://okf.md/spec/).
These fields are preserved in the published Markdown and manifest.
