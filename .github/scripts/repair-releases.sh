#!/usr/bin/env bash
# Completes any release semantic-release tagged but did not finish.
#
# semantic-release tags the merge, pushes the tag, then pushes a git note
# (refs/notes/semantic-release-<tag>, which records the release's channel)
# and only then creates the GitHub release. GitHub can briefly refuse that
# notes push about a second after the tag ("remote rejected ... missing
# necessary objects"), which leaves the tag on main with no note and no
# release; semantic-release then counts the tag as released and never
# returns to it (v1.1.0 was the first). Run by release.yml after
# semantic-release, whether it passed or failed, this finds every v* tag on
# main without a GitHub release, pushes its note (retrying), and creates the
# release, with notes from the commits since the tag before it. With nothing
# to repair it does nothing, so it is safe on every run.
#
# Needs GH_TOKEN with contents: write, and the full history and tags. With
# DRY_RUN=1 it only says what it would do.
set -euo pipefail

dry_run="${DRY_RUN:-0}"

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
note='{"channels":[null]}'

# Pushes a ref, retrying with a growing wait, as the refusal is transient.
push_with_retries() {
  local ref="$1"
  for attempt in 1 2 3 4 5; do
    if git push origin "$ref"; then
      return 0
    fi
    echo "Pushing ${ref} failed (attempt ${attempt}); retrying in $((attempt * 5))s."
    sleep $((attempt * 5))
  done
  echo "::error::Could not push ${ref} after 5 attempts."
  return 1
}

# A note is a commit, so it needs an author; this is the Actions bot's.
[[ "$dry_run" == 1 ]] || git config user.name >/dev/null || git config user.name "github-actions[bot]"
[[ "$dry_run" == 1 ]] || git config user.email >/dev/null ||
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git fetch --quiet origin '+refs/notes/*:refs/notes/*' || true

# Oldest first, so each release is created before the one after it.
mapfile -t tags < <(git tag --merged HEAD --list 'v*' --sort=v:refname)

repaired=0
for tag in "${tags[@]}"; do
  if gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
    continue
  fi
  echo "::warning::${tag} is tagged on main but has no GitHub release; completing it."

  notes_ref="refs/notes/semantic-release-${tag}"
  if ! git ls-remote --exit-code origin "$notes_ref" >/dev/null 2>&1; then
    if [[ "$dry_run" == 1 ]]; then
      echo "Would add and push ${notes_ref}: ${note}"
    else
      git notes --ref "semantic-release-${tag}" add -f -m "$note" "$tag"
      push_with_retries "$notes_ref"
    fi
  fi

  previous="$(git describe --tags --abbrev=0 --match 'v*' "${tag}^" 2>/dev/null || true)"
  args=(release create "$tag" --repo "$repo" --verify-tag --title "$tag" --generate-notes)
  if [[ -n "$previous" ]]; then
    args+=(--notes-start-tag "$previous")
  fi
  if [[ "$dry_run" == 1 ]]; then
    echo "Would run: gh ${args[*]}"
  else
    gh "${args[@]}"
  fi
  repaired=$((repaired + 1))
done

echo "Releases completed: ${repaired}."
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "repaired=${repaired}" >>"$GITHUB_OUTPUT"
fi
