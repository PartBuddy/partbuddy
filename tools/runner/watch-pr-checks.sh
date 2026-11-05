#!/usr/bin/env bash
# Reports a pull request once all of its checks have finished, green or red (ADR 0022).
#
# Runs on Windows in Git Bash, for example from Claude Code's Monitor tool: every stdout line is
# one report, such as "PR #51 (efb601a) grün: alle 8 Checks bestanden". It is driven by the
# self-hosted runners' job-completed hook (job-events.log in the WSL distribution), not by a timer:
# GitHub is asked only right after a job of a pull request has finished on this PC.
#
# Usage: tools/runner/watch-pr-checks.sh [owner/repo]
set -uo pipefail

repo="${1:-ManuelStaggl/partbuddy}"
distro="partbuddy-runner"
user="runner"
events="/home/${user}/job-events.log"

declare -A reported=()

# Prints one report for the pull request and returns 0, or returns 1 while checks are pending.
report() {
  local pr="$1" head summary
  head="$(gh pr view "$pr" -R "$repo" --json headRefOid,state \
    --jq 'select(.state == "OPEN") | .headRefOid[0:7]' 2>/dev/null)" || return 0
  [[ -n "$head" ]] || return 0
  [[ -z "${reported["$pr:$head"]:-}" ]] || return 0

  # gh exits with 8 while checks are pending; the JSON is printed either way.
  summary="$(gh pr checks "$pr" -R "$repo" --json name,bucket --jq '
    if any(.[]; .bucket == "pending") then empty
    else
      ([.[] | select(.bucket == "fail" or .bucket == "cancel") | .name]) as $bad
      | if ($bad | length) == 0 then "grün: alle \(length) Checks bestanden"
        else "rot: \($bad | join(", "))" end
    end' 2>/dev/null)" || true
  [[ -n "$summary" ]] || return 1

  reported["$pr:$head"]=1
  echo "PR #${pr} (${head}) ${summary}"
}

MSYS_NO_PATHCONV=1 WSL_UTF8=1 wsl.exe -d "$distro" -u "$user" -- tail -n 0 -F "$events" 2>/dev/null |
  while IFS=$'\t' read -r _time _runner event_repo ref _run _workflow _job; do
    [[ "$event_repo" == "$repo" && "$ref" == refs/pull/*/merge ]] || continue
    pr="${ref#refs/pull/}"
    pr="${pr%/merge}"
    # The hook runs just before GitHub marks the job as complete: wait a moment, retry once.
    for delay in 15 30; do
      sleep "$delay"
      report "$pr" && break
    done
  done
