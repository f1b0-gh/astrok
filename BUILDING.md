# Build and test

Use Node 24 and npm. Run these commands from the repository root:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4341/workspace/`. For a production build with the sample JSON/SSE service,
run `npm run build` then `npm run preview` and open `http://127.0.0.1:4338/workspace/`.

The documentation site uses `npm run dev:docs`, or `npm run build:docs` followed by
`npm run preview:docs`.

To run all checks:

```sh
npx playwright install chromium
npm run verify
```

If Chrome is already installed, set `CHROME_PATH` to its executable instead. The checks include
types, unit and browser tests, both sites, and installation of packed packages into a temporary
consumer. They do not publish anything. For shorter runs, use `npm test` or `npm run validate:okf`.

Dependencies, generated pages, build directories, archives and test reports stay local and are
ignored by Git. Keep source files and `package-lock.json`.

`npm run format` formats supported source, configuration and documentation files throughout the
repository; `npm run format:check` checks them in CI. The pinned `prettier-plugin-astro` development
dependency adds `.astro` support. Both commands honor `.gitignore` and `.prettierignore`, including
private `.local` discussions.

Repository tests and commands import the built package exports. `npm test`, `npm run validate:okf`,
`npm run graph -- …` and `npm run generate:okf` build their package prerequisites automatically,
including after a fresh `npm ci`.

`npm run validate:okf` checks every maintained bundle in strict link mode, and CI runs it through
`npm run verify`. For minimum conformance with link warnings only, run
`node scripts/validate-okf.mjs knowledge` after building packages. Consumer Astro builds also fail
on invalid internal links by default. Set `strictLinks: false` on `okfIntegration` to retain
warnings without failing. Strict links are a publishing policy, not an extra OKF schema rule.

The documentation example opts into the JSON graph. SQLite generation is off by default; use
`OKF_SQLITE=1 npm run build:docs` or `npm run index:sqlite` to request it. The plain workspace also
enables the JSON graph, with SQLite disabled.

To try unreleased workspace changes in another local project, run `npm run build:packages` and pack
the four packages as shown in [Releasing](RELEASING.md). Install the resulting four `.tgz` paths
together with `npm install /absolute/path/to/artifacts/release/<file>.tgz …` in that project.
Install the Astro/Solid peer dependencies matching the workspace manifests for the features you use.
`npm run verify:packages` exercises this workflow in an automatically created independent consumer.
