---
name: create-pr
description: Verify the branch (lint/typecheck/test/build in parallel), then open a PR that follows the repo template, links any related GitHub issue, and uses a conventional-commit title.
---

# Create a pull request

## 1. Verify — all checks, in parallel

Run these as parallel Bash calls (they are independent):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four must pass before opening the PR. If any fail, fix and re-run —
do not open a PR with known-red checks. For changes with a runtime
surface (anything in `apps/playground` or behavior-affecting package
code), also do a runtime check per the `verify` skill and capture what
you observed — it feeds the Verification section below.

## 2. Find the related GitHub issue

Check, in order:

1. Branch name and commit messages for an issue number (`#12`, `12-fix-...`).
2. `gh issue list --search "<keywords from the change>"` for an open issue
   that this work addresses.

If one exists, reference it in the PR body (`Closes #NN` if the PR resolves
it, `Refs #NN` if partial). If none exists, say so in the Reason section —
don't invent one.

## 3. Title — conventional-commit prefix (required)

The PR title MUST start with one of: `feat:`, `fix:`, `chore:`, `docs:`,
`refactor:`, `test:`, `ci:`, `perf:`. This drives automated versioning
later, so pick by what the release impact is:

- `feat:` — user-visible capability added (minor bump)
- `fix:` — bug fixed (patch bump)
- everything else — no release impact

Breaking changes: use `feat!:` / `fix!:`.

## 4. Body — follow the repo template

`.github/pull_request_template.md` defines the required sections; fill all
three with real content:

- **Reason for change** — why, plus the issue link from step 2.
- **Scope** — check the impacted packages; one line each on how.
- **Verification** — the checks from step 1 plus any runtime verification
  (what was driven, what was observed, screenshots for visual changes).

## 5. Open it

```bash
git push -u origin HEAD
gh pr create --title "<prefix>: <summary>" --body "<filled template>"
```

Confirm the created PR URL back to the user. If the branch has unpushed
WIP or uncommitted changes, stop and ask before pushing.
