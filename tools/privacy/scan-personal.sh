#!/bin/sh
# Scan staged changes against the personal denylist that lives outside the repository.
# The denylist path comes from Git, so the check also works in worktrees.
set -eu

cfg="$(git rev-parse --git-path info/gitleaks-personal.toml)"

if [ ! -f "$cfg" ]; then
  echo "Personal denylist missing: create $cfg (see CONTRIBUTING.md)." >&2
  exit 1
fi

exec gitleaks git --staged --no-banner --redact --config "$cfg" .
