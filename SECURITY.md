# Security

Report suspected vulnerabilities privately through
[GitHub security advisories](https://github.com/f1b0-gh/astrok/security/advisories/new). Please
avoid public issues for undisclosed vulnerabilities.

Include the affected package/version or commit, a minimal reproduction, expected and observed
behavior, and the potential impact. Remove credentials and private data. Maintainers will coordinate
fixes and disclosure through the private report; there is no guaranteed response time.

Astrok is in early development. Security fixes target current main and the latest published version,
when available; older versions do not have a separate support commitment.

Hypermedia accepts trusted application HTML and registered JavaScript handlers. It is not an HTML
sanitizer. Do not feed it user-authored or untrusted fragments. Applications must enforce
authentication and authorization on their servers; client-side URL allowlists and protected Solid
roots do not replace these checks.
