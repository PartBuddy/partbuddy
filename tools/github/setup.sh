#!/usr/bin/env bash
# Creates the private GitHub repository and applies the settings from docs/github-setup.md.
# Run only after the product owner approved the repository name and the push.
#
# Usage: tools/github/setup.sh <repository-name> <path-to-ssh-signing-public-key> [free|pro|public]
#
# The plan argument (default: free) decides the steps that GitHub offers only on Pro or on public
# repositories: the release environment with branch policies and the ruleset for main.
#
# Requirements: gh 2.x signed in as the owner with scope `repo`; scope `admin:ssh_signing_key` for
# registering the signing key (skipped with a hint when missing); the local personal denylist
# (.git/info/gitleaks-personal.toml).
set -euo pipefail

readonly OWNER="ManuelStaggl"
readonly REPO="${1:?repository name required}"
readonly SIGNING_KEY="${2:?path to the SSH signing public key required}"
readonly PLAN="${3:-free}"
readonly FULL="${OWNER}/${REPO}"

denylist="$(git rev-parse --git-path info/gitleaks-personal.toml)"
[[ -f "$denylist" ]] || { echo "Personal denylist missing: $denylist" >&2; exit 1; }
[[ -f "$SIGNING_KEY" ]] || { echo "Signing key not found: $SIGNING_KEY" >&2; exit 1; }

echo "1/9 Create private repository ${FULL}"
gh repo create "$FULL" --private \
  --description "Desktop app for AI-assisted parametric design of FDM 3D-print parts" \
  --disable-wiki --source . --remote origin

echo "2/9 Merge, branch and Actions settings"
gh api -X PATCH "repos/${FULL}" \
  -F allow_rebase_merge=false -F allow_squash_merge=true -F allow_merge_commit=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY \
  -F delete_branch_on_merge=true -F allow_auto_merge=false -F has_projects=true \
  -F has_wiki=false -F has_discussions=false >/dev/null
# Read-only default token; release-please may open its release pull request.
gh api -X PUT "repos/${FULL}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true >/dev/null

echo "3/9 Secrets"
gh secret set PRIVACY_DENYLIST --repo "$FULL" < "$denylist"

echo "4/9 Labels"
while IFS='|' read -r name color description; do
  gh label create "$name" --repo "$FULL" --color "$color" --description "$description" --force
done <<'LABELS'
type: bug|b42318|Something does not work as described
type: feature|1f5fd1|New capability or improvement
type: docs|355f8c|Documentation and ADRs
type: chore|6a727c|Maintenance without user-visible change
type: dependencies|8a5a00|Dependency updates
type: security|b42318|Security-relevant issue
status: triage|e3a33a|Needs a first assessment
status: blocked|f0776c|Waiting on something outside the team
area: viewer|4cc283|3D view, picking, overlays
area: notes|4cc283|Notes and anchors
area: assistant|4cc283|Agent runtime, chat, providers
area: cad-kernel|4cc283|SolidCraft connection and mirroring
area: checks|4cc283|Rule engine, gates, sidecar checks
area: print|4cc283|Slicer integration and print packages
area: repo|4cc283|CI, release, repository tooling
LABELS

echo "5/9 Milestones"
for title in "Phase 2: MVP foundation" "MVP 0.1.0"; do
  gh api -X POST "repos/${FULL}/milestones" -f title="$title" >/dev/null
done

if [[ "$PLAN" == "free" ]]; then
  echo "6/9 Environment skipped (needs GitHub Pro or a public repository)"
else
echo "6/9 Environment for release signing"
gh api -X PUT "repos/${FULL}/environments/release" \
  --input - >/dev/null <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh api -X POST "repos/${FULL}/environments/release/deployment-branch-policies" \
  -f name="v*" -f type="tag" >/dev/null
fi

echo "7/9 Dependabot alerts and commit signing key"
gh api -X PUT "repos/${FULL}/vulnerability-alerts" >/dev/null
if gh auth status 2>&1 | grep -q "admin:ssh_signing_key"; then
  gh ssh-key add "$SIGNING_KEY" --type signing --title "${REPO} commit signing"
else
  echo "   Signing key not registered: run 'gh auth refresh -s admin:ssh_signing_key' and re-run this step."
fi

echo "8/9 Push history and LFS objects"
git push -u origin main
git lfs push origin main

if [[ "$PLAN" == "free" ]]; then
  echo "9/9 Ruleset skipped (needs GitHub Pro or a public repository); see docs/github-setup.md"
  echo "Done. Remaining manual steps are listed in docs/github-setup.md."
  exit 0
fi
echo "9/9 Ruleset for main"
gh api -X POST "repos/${FULL}/rulesets" --input - >/dev/null <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "required_signatures" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Lint, typecheck, test, build" },
          { "context": "Click dummy flows (Playwright)" },
          { "context": "Scan full history" },
          { "context": "Workflow security (zizmor)" },
          { "context": "Vulnerabilities and licences" }
        ]
      }
    }
  ]
}
JSON

echo "Done. Remaining manual steps are listed in docs/github-setup.md."
