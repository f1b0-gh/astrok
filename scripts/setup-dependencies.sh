#!/usr/bin/env bash
# Run with bash; this script installs tooling for the current user without sudo.
set -eo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
Usage: bash scripts/setup-dependencies.sh

Use Node.js 24 and npm if already available; otherwise install them using nvm.
Install package.json dependencies, then run the OKF validator.
Requires Bash and, for downloads, curl with working HTTPS certificates.
Supports Linux, macOS, and WSL. No sudo or shell-profile changes are made.
Set NVM_DIR to override the default nvm installation directory (~/.nvm).
HELP
  exit 0
fi
if [[ $# -ne 0 ]]; then
  printf 'Unknown argument. Use --help for usage.\n' >&2
  exit 2
fi

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
node_major="$(cat .nvmrc)"

case "$(uname -s)" in
  Linux|Darwin) ;;
  *) printf 'Unsupported platform. Use Linux, macOS, or WSL.\n' >&2; exit 1 ;;
esac

if ! command -v node >/dev/null 2>&1 ||
   ! node -e 'process.exit(process.versions.node.split(".")[0] === process.argv[1] ? 0 : 1)' "$node_major" ||
   ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    if ! command -v curl >/dev/null 2>&1; then
      printf 'Install curl and CA certificates with your OS package manager, then rerun.\n' >&2
      exit 1
    fi
    installer="$(mktemp)"
    trap 'rm -f -- "$installer"' EXIT
    printf 'Installing nvm v0.40.8 into %s\n' "$NVM_DIR"
    curl --fail --silent --show-error --location --retry 3 \
      https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh \
      --output "$installer"
    # Script installation also works when Git is not installed.
    mkdir -p -- "$NVM_DIR"
    PROFILE=/dev/null METHOD=script bash "$installer"
  fi
  # nvm is a shell function and must be loaded in this process.
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh" --no-use
  nvm install "$node_major"
  nvm use "$node_major"
  printf '\nFor subsequent commands in your current shell, run:\n'
  printf 'export NVM_DIR=%q\nsource "$NVM_DIR/nvm.sh"\nnvm use %q\n\n' "$NVM_DIR" "$node_major"
fi

node --version
npm --version
if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npm run validate:okf
printf '\nDependency setup and OKF minimum checks completed.\n'
