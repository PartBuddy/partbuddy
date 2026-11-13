#!/usr/bin/env bash
# Which checks a pull request needs (ci.yml, security.yml). Reads the changed paths, one per line, on
# stdin and prints name=true|false lines for $GITHUB_OUTPUT. When in doubt a check runs.
set -euo pipefail

changed=$(cat)
# Files every package build and test depends on; a change to ci.yml runs all of ci.yml.
shared='^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.node-version|\.github/workflows/ci\.yml)$'

any() { if grep -qE "$1" <<<"$changed"; then echo true; else echo false; fi; }

# Lint, types, unit tests and build: anything but documentation, the website text and GitHub settings.
if grep -qvE '^(docs/|site/|\.github/|[^/]+\.md$|LICENSE$)' <<<"$changed"; then code=true; else code=$(any "$shared"); fi
echo "code=$code"
echo "desktop=$(any "$shared|^(packages|apps/desktop)/")"
echo "clickdummy=$(any "$shared|^(packages|prototypes/clickdummy)/")"
echo "dependencies=$(any '(^|/)package\.json$|^pnpm-(lock|workspace)\.yaml$|^tools/licenses/|^\.github/workflows/security\.yml$')"
echo "workflows=$(any '^\.github/')"
