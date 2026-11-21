# Astrok design system

Source assets for [`@astrokjs/theme`](../../packages/theme/README.md). The package build reads this
directory and produces the CSS, tokens and logos used by the Astro examples.

- [tokens.json](tokens.json): colors, typography, spacing, radii and the logo angle.
- [Logos](assets/Logos/README.md): SVG marks for dark and light backgrounds.
- [Starlight styles](starlight/astrok.css): the documentation theme adapter.
- [Cover preview](components/Cover/preview.html): a standalone design specimen.

Use dark or light surfaces with the matching text tokens. Reserve `voltage` for accents; use
`accent-text` for links. Decorative `hairline` colors are not control borders. The colored logo
belongs on dark backgrounds; use the ink version on light backgrounds.

Headings use Sora, body text uses Inter, and code uses JetBrains Mono. The theme's optional font
stylesheet uses bundled WOFF2 files, served from your own site. The package includes the fonts' SIL
Open Font License notices.

From the repository root, run `npm run build --workspace @astrokjs/theme` after editing these
sources. Run the workspace and open `/design-system/` to inspect the result. Generated files in
`packages/theme/dist/` stay out of Git.
