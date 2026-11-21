---
name: docs-site
description:
  Implement and maintain the Astro Starlight human-facing documentation site generated from OKF
  sources. Use for rendering, navigation, page metadata, routes, styles, accessibility, or build
  configuration.
---

# Documentation site workflow

1. Keep OKF files canonical; generated pages are build output and must not be hand-edited.
2. Before implementing the adapter, inspect current Astro Starlight content collection requirements.
3. Parse frontmatter and pass metadata to the page layout; never print YAML frontmatter in the
   visible page body.
4. Define deterministic title fallback: OKF `title`, then a humanized filename.
5. Preserve stable canonical URLs and resolve relative Markdown links correctly.
6. Keep raw Markdown accessible to agents, either at stable `.md` URLs or as a published source
   artifact.
7. Do not assume the OKF `type` vocabulary is identical to the site's navigation categories.
8. Test rendered output for hidden frontmatter, working internal links, code fences, headings,
   keyboard navigation, and mobile layout.
9. Run the site build and report actual command output. Never claim a build passed if it was not
   run.
