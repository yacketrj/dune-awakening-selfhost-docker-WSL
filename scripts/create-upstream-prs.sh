#!/usr/bin/env bash
set -Eeuo pipefail

# create-upstream-prs.sh
#
# Creates small upstream PR branches from upstream/main and optionally opens draft PRs
# against Red-Blink/dune-awakening-selfhost-docker.
#
# Default mode is dry-run. Pass --execute to create branches and push them.
# Pass --create-prs to also open GitHub PRs using gh.
#
# Assumptions:
# - origin points to your fork: yacketrj/dune-awakening-selfhost-docker-WSL
# - upstream points to: Red-Blink/dune-awakening-selfhost-docker
# - source branch contains the integrated work: feature/discord-control-bot

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
UPSTREAM_REPO="${UPSTREAM_REPO:-Red-Blink/dune-awakening-selfhost-docker}"
FORK_OWNER="${FORK_OWNER:-yacketrj}"
FORK_REPO="${FORK_REPO:-dune-awakening-selfhost-docker-WSL}"
SOURCE_BRANCH="${SOURCE_BRANCH:-feature/discord-control-bot}"
BASE_BRANCH="${BASE_BRANCH:-main}"

EXECUTE=0
CREATE_PRS=0
READY=0
FORCE=0
ONLY=""

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/create-upstream-prs.sh [options]

Options:
  --execute          Actually create local branches and push to origin.
  --create-prs      Create GitHub PRs against upstream using gh.
  --ready           Create PRs as ready for review instead of draft.
  --force           Recreate/push upstream branches with --force-with-lease.
  --only NAME       Only process one group:
                    container-hardening
                    security-hygiene
                    security-evidence
                    discord-readonly-bot
  -h, --help        Show help.

Environment overrides:
  UPSTREAM_REMOTE   Default: upstream
  ORIGIN_REMOTE     Default: origin
  UPSTREAM_REPO     Default: Red-Blink/dune-awakening-selfhost-docker
  FORK_OWNER        Default: yacketrj
  FORK_REPO         Default: dune-awakening-selfhost-docker-WSL
  SOURCE_BRANCH     Default: feature/discord-control-bot
  BASE_BRANCH       Default: main

Examples:
  # Preview planned branches and PRs:
  bash scripts/create-upstream-prs.sh

  # Create and push only the first small upstream branch:
  bash scripts/create-upstream-prs.sh --execute --only container-hardening

  # Create/push all upstream branches, but do not open PRs:
  bash scripts/create-upstream-prs.sh --execute

  # Create/push all branches and open draft PRs:
  bash scripts/create-upstream-prs.sh --execute --create-prs

  # Create/push one branch and open a ready-for-review PR:
  bash scripts/create-upstream-prs.sh --execute --create-prs --ready --only security-hygiene
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=1; shift ;;
    --create-prs) CREATE_PRS=1; shift ;;
    --ready) READY=1; shift ;;
    --force) FORCE=1; shift ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

say() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
run() {
  if [[ "$EXECUTE" -eq 1 ]]; then
    printf '+ %q' "$@"; printf '\n'
    "$@"
  else
    printf '[dry-run]'; printf ' %q' "$@"; printf '\n'
  fi
}

require_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is not clean. Commit or stash changes first." >&2
    git status --short >&2
    exit 1
  fi
}

require_tools() {
  command -v git >/dev/null || { echo "git is required." >&2; exit 1; }
  if [[ "$CREATE_PRS" -eq 1 ]]; then
    command -v gh >/dev/null || { echo "gh is required for --create-prs." >&2; exit 1; }
    gh auth status >/dev/null || { echo "gh is not authenticated. Run: gh auth login" >&2; exit 1; }
  fi
}

ensure_remotes() {
  if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    run git remote add "$UPSTREAM_REMOTE" "https://github.com/${UPSTREAM_REPO}.git"
  fi

  local upstream_url
  upstream_url="$(git remote get-url "$UPSTREAM_REMOTE" 2>/dev/null || true)"
  if [[ "$upstream_url" != *"github.com/${UPSTREAM_REPO}"* && "$upstream_url" != *"github.com:${UPSTREAM_REPO}"* ]]; then
    echo "Remote '$UPSTREAM_REMOTE' does not point to ${UPSTREAM_REPO}: $upstream_url" >&2
    exit 1
  fi

  git remote get-url "$ORIGIN_REMOTE" >/dev/null || {
    echo "Remote '$ORIGIN_REMOTE' is missing." >&2
    exit 1
  }
}

fetch_all() {
  run git fetch "$UPSTREAM_REMOTE" "$BASE_BRANCH"
  run git fetch "$ORIGIN_REMOTE"
  run git fetch "$ORIGIN_REMOTE" "$SOURCE_BRANCH:$SOURCE_BRANCH" || true
}

warn_if_fork_main_ahead() {
  local ahead
  ahead="$(git rev-list --count "${UPSTREAM_REMOTE}/${BASE_BRANCH}..${ORIGIN_REMOTE}/${BASE_BRANCH}" 2>/dev/null || echo 0)"
  if [[ "$ahead" != "0" ]]; then
    cat >&2 <<EOF

Warning: ${ORIGIN_REMOTE}/${BASE_BRANCH} is ${ahead} commit(s) ahead of ${UPSTREAM_REMOTE}/${BASE_BRANCH}.
This script branches from ${UPSTREAM_REMOTE}/${BASE_BRANCH}, so upstream PRs remain scoped.
Do not branch upstream PRs from ${ORIGIN_REMOTE}/${BASE_BRANCH} unless that is intentional.

EOF
  fi
}

path_exists_in_source() {
  local path="$1"
  git ls-tree -r --name-only "$SOURCE_BRANCH" -- "$path" | grep -q .
}

checkout_paths_from_source() {
  local missing=()
  local path
  for path in "$@"; do
    if path_exists_in_source "$path"; then
      run git checkout "$SOURCE_BRANCH" -- "$path"
    else
      missing+=("$path")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    echo "Skipped missing path(s) in ${SOURCE_BRANCH}:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
  fi
}

commit_if_changed() {
  local message="$1"
  shift
  local paths=("$@")
  if git diff --quiet -- "${paths[@]}" && git diff --cached --quiet -- "${paths[@]}"; then
    echo "No changes to commit."
    return 1
  fi
  run git add -- "${paths[@]}"
  run git commit -m "$message"
}

push_branch() {
  local branch="$1"
  if [[ "$FORCE" -eq 1 ]]; then
    run git push --force-with-lease "$ORIGIN_REMOTE" "$branch"
  else
    run git push -u "$ORIGIN_REMOTE" "$branch"
  fi
}

make_pr_body_file() {
  local branch="$1"
  local title="$2"
  local summary="$3"
  local validation="$4"
  local file
  file="$(mktemp)"
  cat > "$file" <<EOF
## Summary

${summary}

## Scope

This PR is intentionally scoped as one upstreamable chunk from the fork. It is based on \`${UPSTREAM_REPO}:${BASE_BRANCH}\`, not on the fork's integration branch.

## Validation

${validation}

## Notes

- Maintainers may modify this branch.
- This PR avoids unrelated Discord/SOC 2 integration changes unless this branch explicitly targets that scope.
- Source integration branch in fork: \`${SOURCE_BRANCH}\`.

## Branch

\`${FORK_OWNER}:${branch}\`
EOF
  printf '%s' "$file"
}

open_pr() {
  local branch="$1"
  local title="$2"
  local summary="$3"
  local validation="$4"

  if [[ "$CREATE_PRS" -ne 1 ]]; then
    echo "PR creation skipped. Title would be: $title"
    return 0
  fi

  local body_file draft_arg
  body_file="$(make_pr_body_file "$branch" "$title" "$summary" "$validation")"
  draft_arg="--draft"
  if [[ "$READY" -eq 1 ]]; then
    draft_arg=""
  fi

  run gh pr create \
    --repo "$UPSTREAM_REPO" \
    --base "$BASE_BRANCH" \
    --head "${FORK_OWNER}:${branch}" \
    --title "$title" \
    --body-file "$body_file" \
    $draft_arg

  rm -f "$body_file"
}

create_branch_from_paths() {
  local name="$1"
  local branch="$2"
  local commit_message="$3"
  local pr_title="$4"
  local pr_summary="$5"
  local pr_validation="$6"
  shift 6
  local paths=("$@")

  if [[ -n "$ONLY" && "$ONLY" != "$name" ]]; then
    return 0
  fi

  say "Preparing ${name}: ${branch}"
  run git checkout -B "$branch" "${UPSTREAM_REMOTE}/${BASE_BRANCH}"

  checkout_paths_from_source "${paths[@]}"

  if commit_if_changed "$commit_message" "${paths[@]}"; then
    push_branch "$branch"
    open_pr "$branch" "$pr_title" "$pr_summary" "$pr_validation"
  else
    echo "Branch ${branch} has no diff against ${UPSTREAM_REMOTE}/${BASE_BRANCH}; skipping push/PR."
  fi
}

main() {
  require_tools
  require_clean_worktree
  ensure_remotes
  fetch_all
  warn_if_fork_main_ahead

  create_branch_from_paths \
    "container-hardening" \
    "upstream/container-hardening" \
    "Harden runtime containers with non-root users" \
    "Harden runtime containers with non-root users" \
    "Adds explicit non-root runtime users to the Console API and orchestrator containers to address container hardening findings." \
    "Build the affected images and re-run Semgrep/Trivy container policy checks." \
    "console/api/Dockerfile" \
    "orchestrator/Dockerfile"

  create_branch_from_paths \
    "security-hygiene" \
    "upstream/security-hygiene-fixes" \
    "Address static-analysis security hygiene findings" \
    "Address static-analysis security hygiene findings" \
    "Remediates focused Semgrep findings by removing dynamic regular-expression construction where practical, fixing incomplete percent stripping, and using explicit network resolver functions." \
    "Run Semgrep and the existing Console/Web tests. Re-run vulnerability report generation before closing tracking issues." \
    "orchestrator/dune_orchestrator.py" \
    "console/api/src/services/envFile.js" \
    "console/api/src/services/memoryBalancer.js" \
    "console/web/src/features/maps/MapsPanel.tsx" \
    "console/web/src/features/server/ServerPanels.tsx"

  create_branch_from_paths \
    "security-evidence" \
    "upstream/security-evidence-automation" \
    "Add security evidence automation" \
    "Add security evidence automation" \
    "Adds optional security evidence automation for SBOM, Semgrep, Trivy, STRIDE, vulnerability reporting, issue sync, and GitHub Actions findings export." \
    "Run SBOM, Semgrep, Trivy, STRIDE, and SOC 2 readiness evidence workflows. Review generated artifacts before marking ready." \
    ".github/workflows" \
    ".github/ISSUE_TEMPLATE" \
    "scripts/generate-sbom.mjs" \
    "scripts/generate-vulnerability-report.mjs" \
    "scripts/generate-stride-report.mjs" \
    "scripts/generate-security-evidence-bundle.mjs" \
    "scripts/sync-vulnerability-issues.mjs" \
    "scripts/sync-stride-issues.mjs" \
    "scripts/validate-security-automation.mjs" \
    "scripts/soc2-readiness-check.mjs" \
    "scripts/export-github-actions-findings.mjs" \
    "scripts/ensure-security-runtimes.sh"

  create_branch_from_paths \
    "discord-readonly-bot" \
    "upstream/discord-readonly-bot" \
    "Add read-only Discord companion bot" \
    "Add read-only Discord companion bot" \
    "Adds an experimental read-only Discord companion bot and protected Console API adapter for status, readiness, service health, and related operational visibility. The adapter remains read-only and enforces backend authorization." \
    "Run Console adapter tests, Discord bot tests, secret scan, build, and Discord bot security gates. Confirm no write-capable Discord commands are included." \
    "discord-bot" \
    "console/api/src/integrations/discord" \
    "console/api/test/discordPolicy.test.js" \
    "console/api/test/discordSanitize.test.js" \
    "console/api/test/discordAudit.test.js" \
    "console/api/test/discordAdapter.test.js" \
    "console/api/test/discordRoutes.test.js" \
    "docs/discord-control-bot" \
    ".github/workflows/discord-bot-security-gates.yml" \
    ".github/workflows/soc2-readiness-check.yml" \
    ".github/PULL_REQUEST_TEMPLATE.md"

  say "Done"
  if [[ "$EXECUTE" -ne 1 ]]; then
    cat <<EOF

Dry-run complete. Re-run with --execute to create/push branches.
Add --create-prs to open draft upstream PRs with gh.

Recommended sequence:
  bash scripts/create-upstream-prs.sh --execute --create-prs --only container-hardening
  bash scripts/create-upstream-prs.sh --execute --create-prs --only security-hygiene
  bash scripts/create-upstream-prs.sh --execute --create-prs --only security-evidence
  bash scripts/create-upstream-prs.sh --execute --create-prs --only discord-readonly-bot

EOF
  fi
}

main "$@"
