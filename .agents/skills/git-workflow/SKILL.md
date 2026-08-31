---
name: git-workflow
description: Use when doing Git or GitHub work in this repo, including branch setup, pull, rebase, commit, push, force-with-lease, pull requests, PR descriptions, conflict handling, and keeping user changes out of commits.
---

# Git Workflow

> This is repo-maintained local guidance. It is not official GitHub or Codex documentation.

## Principles

- Keep unrelated local changes out of commits and PRs.
- Before staging, run `git status --short` and inspect the relevant diff.
- Prefer small branches with descriptive names.
- Never use destructive commands such as `git reset --hard`, `git checkout -- <file>`, or force push unless the user explicitly asked and the target is clear.
- Use `--force-with-lease`, not plain `--force`, when rewriting a branch that has already been pushed.

## Creating Pull Requests From The Sandbox

- Interpret “open a PR”, “create a PR”, and “abre un PR” as creating the pull request with `gh pr create`, not as opening GitHub in a browser.
- Run `gh` through the environment's host/outside-sandbox execution mechanism. The host already has GitHub CLI authentication in its keyring; do not try to authenticate through a browser and do not ask the user for a token preemptively.
- Treat an approval to run outside the sandbox as execution permission, not as authentication. Only diagnose authentication if `gh` returns an actual authentication error.
- Use a browser only when the user explicitly asks to view, show, or open the PR in a browser.

## Branches

- If the current branch belongs to another task, switch back to `main` and create a new task branch.
- If local uncommitted changes exist, keep them if they do not conflict; do not revert them.
- Use branch names like `fix/operaciones-run-state-feedback` or `feat/benefit-bulk-publish`.

## Pull, Rebase, And Conflicts

- Before pulling or rebasing, check `git status --short`.
- Prefer `git pull --rebase` for updating a feature branch from its upstream.
- If conflicts appear, inspect the conflicted files and preserve user changes unless explicitly told otherwise.
- After resolving conflicts, run the relevant checks before continuing.

## Commits

- Stage only intended files. Prefer explicit paths:

```bash
git add path/to/file
```

- Check staged content:

```bash
git diff --cached --stat
git diff --cached
```

- Commit with a concise imperative message:

```bash
git commit -m "Fix run-state feedback on scraper trigger"
```

## Push And PRs

- Push the branch to `origin`.
- Create PRs with `gh pr create` when available.
- PR descriptions should include:
  - what is being done, in plain language;
  - why the change matters, including operational or technical impact;
  - a brief explanation of how it is being done;
  - important implementation details when they affect review;
  - checks run;
  - known gaps or environment limitations.

- Default PR structure:

```md
## What

Short explanation of what this PR changes.

## Why It Matters

Operational or technical importance.

## How

Brief explanation of the approach.

## Validation

Checks or manual verification performed (e.g., `npm run build`, `npx tsc --noEmit`, manual test via dev server).

## Gaps

Any known limitations or follow-up work.
```

## Protected Local Changes

If `package-lock.json` or another unrelated file is dirty, leave it unstaged unless the task explicitly owns it.
