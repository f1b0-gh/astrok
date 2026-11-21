# @astrokjs/theme

Shared CSS and SVG assets for every astrok example. The design source remains in
`resources/astrok-design-system/`; `npm run build --workspace @astrokjs/theme`
compiles that repository-relative input. Installed tarballs are self-contained:
consumers need only the exported CSS, JSON and logos in `dist/`.

```css
@import '@astrokjs/theme/fonts.css';
@import '@astrokjs/theme/tokens.css';
```

Set `data-theme="dark"` or `data-theme="light"` on the document or a specimen
container. Dark is the default. The Starlight adapter is
`@astrokjs/theme/starlight.css`; it also maps the search controls from decorative
hairlines to the control-border role and supplies a visible keyboard outline. CSS exposes the source token names plus typography
variables (`--text-h1-size`, `--text-h1-leading`, etc.). `tokens.json` retains the
original values. Logos are exported as `@astrokjs/theme/logos/<filename>.svg`; use
the dark colored mark only on dark backgrounds and the ink mark on light ones.

`fonts.css` bundles Sora 600, Inter 400/500/600/700 and JetBrains Mono 400/500
as local WOFF2 files, with `font-display: swap` and upstream Unicode ranges.
Astro/Vite emits them as same-origin assets with the deployment base. No Google
Fonts stylesheet, preconnect or runtime request is needed. Fontsource 5.3.0
packages are pinned build dependencies only; installed theme tarballs contain
all font files and their SIL Open Font License notices under `dist/fonts/`.
Local fallback families still apply while fonts load or for unsupported glyphs.
Omit `fonts.css` if you prefer your own typography.

The source light `control-border` stays unchanged. Consumers placing controls on
raised/hover surfaces use the adapter `--control-border-on-raised` (#80828E in
light mode) to meet the tested 3:1 pairing against #EDECE6. This distinction is
recorded in the source audit; decorative hairlines are not control boundaries.

There is no browser JavaScript, global theme storage or framework runtime in
this package. Astro owns final CSS and logo asset URLs, including base prefixes.
