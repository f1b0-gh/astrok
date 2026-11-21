# @astrok/theme

Shared CSS and SVG assets for every astrok example. The design source remains in
`resources/astrok-design-system/`; `npm run build --workspace @astrok/theme`
compiles that repository-relative input. Installed tarballs are self-contained:
consumers need only the exported CSS, JSON and logos in `dist/`.

```css
@import '@astrok/theme/fonts.css';
@import '@astrok/theme/tokens.css';
```

Set `data-theme="dark"` or `data-theme="light"` on the document or a specimen
container. Dark is the default. The Starlight adapter is
`@astrok/theme/starlight.css`; it also maps the search controls from decorative
hairlines to the control-border role and supplies a visible keyboard outline. CSS exposes the source token names plus typography
variables (`--text-h1-size`, `--text-h1-leading`, etc.). `tokens.json` retains the
original values. Logos are exported as `@astrok/theme/logos/<filename>.svg`; use
the dark colored mark only on dark backgrounds and the ink mark on light ones.

`fonts.css` requests Sora, Inter and JetBrains Mono from Google Fonts with
`display=swap`. No font files are embedded; the supplied local fallback families
remain usable offline. This stylesheet is opt-in for consumers that self-host
fonts or disallow external stylesheets.

The source light `control-border` stays unchanged. Consumers placing controls on
raised/hover surfaces use the adapter `--control-border-on-raised` (#80828E in
light mode) to meet the tested 3:1 pairing against #EDECE6. This distinction is
recorded in the source audit; decorative hairlines are not control boundaries.

There is no browser JavaScript, global theme storage or framework runtime in
this package. Astro owns final CSS and logo asset URLs, including base prefixes.
