# Releasing Astrok

Packages are currently consumed from this repository or local tarballs. A version in package.json
does not mean that version has been published. Release work is a reviewed maintainer action; CI
verifies PRs and deploys the demo, but does not publish npm packages.

The npm organization is `astrokjs`; public packages use the `@astrokjs` scope. The project and
GitHub repository remain named Astrok. The root and example workspaces are private and must not be
published.

1. Prepare a release PR from current main. Select a version for the four public packages (`okf`,
   `astro`, `runtime`, `theme`); update their manifests, internal `@astrokjs/*` dependency versions,
   and root/example dependency pins together. Keep the root and examples private. Regenerate
   `package-lock.json` with `npm install --package-lock-only --ignore-scripts` and update the
   changelog.
2. From a clean checkout with Node 24, run `npm ci`, install Playwright Chromium
   (`npx playwright install chromium`), and run `npm run verify`. Require both GitHub verification
   jobs, including static Pages checks at a non-root base. The packed-consumer check installs
   tarballs in a fresh project and verifies declarations, builds and browser behavior. Record the
   commit and outcomes.
3. Build and pack the reviewed commit. Inspect each archive's files, exports, licenses and
   dependencies. In particular, retain the runtime's MIT license and source attribution; other
   packages' code is dual-licensed. The theme's bundled fonts retain their separate SIL Open Font
   License files in `dist/fonts`.

   ```sh
   npm run build:packages
   mkdir -p artifacts/release
   npm pack ./packages/okf --ignore-scripts --pack-destination artifacts/release
   npm pack ./packages/theme --ignore-scripts --pack-destination artifacts/release
   npm pack ./packages/runtime --ignore-scripts --pack-destination artifacts/release
   npm pack ./packages/astro --ignore-scripts --pack-destination artifacts/release
   ```

4. Check npm scope ownership/access and whether each selected version already exists
   (`npm view @astrokjs/okf versions --json`, and likewise for each package). Preview each exact
   archive with `npm publish --dry-run artifacts/release/<file>.tgz`. A maintainer must review the
   results and approve publication before proceeding.
5. After approval and authenticated npm access, publish the inspected archives with
   `npm publish artifacts/release/<file>.tgz --access public --tag <tag>`. Publish `okf`, `theme`,
   and `runtime` before `astro`, which depends on `okf`. Use `next` for prereleases and `latest` for
   a stable release. Published versions are immutable: if a partial release fails, inspect registry
   state and retry only missing packages; do not overwrite or unpublish automatically.
6. Verify registry installs of the published versions in a fresh consumer, including the workspace
   build and browser checks. Create the version tag and GitHub release on the verified commit, using
   the changelog and linking known limitations. Replace checkout-only installation guidance only
   after this verification succeeds.

Hypermedia now requires registered callbacks in place of executable attributes; include this
breaking migration and the removal of `compileAttribute` in release notes. It works without CSP
`unsafe-eval` and still requires trusted HTML. Whole-state updates validate complete candidates;
opt-in field updates validate only the selected branch and provide no cross-field invariants.
Include changes to these contracts in release notes. Keep build output and tarballs out of Git.
