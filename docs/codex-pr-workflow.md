# Codex PR Workflow

This repository uses repository-level guardrails so Codex can implement one issue at a time and open safe pull requests with short prompts.

## Purpose

- Keep the normal Codex prompt short.
- Encode recurring safety rules in the repository.
- Make local validation match the CI shape before a PR is opened.
- Keep one issue, one branch, and one PR aligned.

## Branching Rules

- Base branch is `develop`.
- Use one branch per issue.
- Use one PR per issue.
- Do not reuse a branch for a different issue.
- Keep the branch name in the form `type/issue-<number>-<slug>`.
- Use `docs/` for documentation-only issues.
- Use `feat/` for new product functionality.
- Use `fix/` for bug fixes.
- Use `test/` for test-only changes.
- Use `chore/` for workflow, tooling, or maintenance work.

## Required Workflow

1. Read `AGENTS.md`.
2. Read the full issue body.
3. Confirm the scope, out of scope, acceptance criteria, and validation.
4. Fetch the latest `develop`.
5. Create one branch for the issue.
6. Implement only the issue scope.
7. Run the required validation.
8. Commit without `--no-verify`.
9. Push without `--no-verify`.
10. Create one PR into `develop`.
11. Include `Closes #<issue-number>`.
12. Report the PR URL and validation results.

## Before Implementation

- Check whether the repository already has the required scripts, hooks, and docs.
- Reuse existing commands and conventions when possible.
- Keep changes focused on the issue body.
- If the scope is unclear, stop and ask for clarification before changing behavior.

## Before Commit

- Run the required validation for the change type.
- Verify that secret scanning passes.
- Verify that no secret or credential file paths were introduced.
- Fix clearly in-scope failures before committing.

## Before Push

- Re-run the local quality gate that matches the issue requirements.
- Make sure hooks are wired correctly.
- Make sure the branch is still based on `develop`.
- Do not push if validation failed.

## Before PR Creation

- Confirm the branch contains only the issue scope.
- Confirm the PR body includes the validation results and safety confirmation.
- Confirm the PR body includes `Closes #<issue-number>`.
- Confirm no `--no-verify` bypass was used.

## PR Body Expectations

- Summary of the change.
- Related issue number.
- Short list of files or areas changed.
- Validation commands and their results.
- Safety confirmation checklist.
- Reviewer notes for caveats or skipped checks.

## When Validation Fails

- If the failure is clearly in scope, fix it and rerun the check.
- If the failure is unrelated, unclear, or looks like a false positive, stop and report it.
- Do not create a PR until required validation passes.
- Do not bypass hooks to get around a failed check.

## What Codex Must Never Do

- Never push directly to `develop` or `main`.
- Never use `--no-verify`.
- Never open a PR before validation passes.
- Never combine unrelated issues into one branch or one PR.
- Never weaken CI or local checks to make a change look green.
- Never change runtime behavior, deployment config, authentication, or frontend UI unless the issue explicitly requires it.

## Short Prompt Example

```md
Implement Issue #123.

Follow AGENTS.md, the issue body, and the PR template.
Use one issue = one branch = one PR.
Run the required validation.
If validation passes, push and create a PR.
```

## Notes

- If the repository already has the needed tooling, use it instead of introducing a duplicate command path.
- Keep default validation no-network.
- Keep hosted or external integration tests gated.
