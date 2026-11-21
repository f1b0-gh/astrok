# Contributing

Use Node 24 and start with [Build and test](BUILDING.md). Keep changes focused
and describe the problem, resulting behavior and checks in the pull request.

- Edit canonical Markdown in `knowledge/` or an example's `knowledge/` directory.
  Generated pages, dependencies and build artifacts stay out of Git.
- Use public package exports across package boundaries. Update the relevant
  guide and `ARCHITECTURE.md` when changing a public contract.
- Add regression tests for parser, graph, route or runtime behavior. Run
  `npm run validate:okf` for knowledge changes and `npm run verify` before review.
- Record user-visible changes in `CHANGELOG.md`. Keep formatting-only changes
  separate from behavior changes when practical.

Use the issue templates for reproducible bugs and feature proposals. Follow
[the security policy](SECURITY.md) for vulnerabilities. Publishing packages is
a maintainer action described in [Releasing](RELEASING.md).
