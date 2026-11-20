# Build and test

Use Node 24 and npm. Run these commands from the repository root:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4341/workspace/`. For a production build with the sample
JSON/SSE service, run `npm run build` then `npm run preview` and open
`http://127.0.0.1:4338/workspace/`.

The documentation site uses `npm run dev:docs`, or `npm run build:docs` followed
by `npm run preview:docs`.

To run all checks:

```sh
npx playwright install chromium
npm run verify
```

If Chrome is already installed, set `CHROME_PATH` to its executable instead.
The checks include types, unit and browser tests, both sites, and installation
of packed packages into a temporary consumer. They do not publish anything.
For shorter runs, use `npm test` or `npm run validate:okf`.

Dependencies, generated pages, build directories, archives and test reports
stay local and are ignored by Git. Keep source files and `package-lock.json`.
