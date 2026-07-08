# AGENTS.md

This repository is maintained with durable rules so Codex and other agents can work safely with short prompts.

## Repository rules

- Base branch is `develop`.
- Use one branch per issue.
- Use one PR per issue.
- Do not combine unrelated issues in one branch or PR.
- Always read the full issue body before implementing.
- Follow the issue `Scope`, `Out of scope`, `Acceptance criteria`, and `Validation`.
- Do not use `git commit --no-verify`.
- Do not use `git push --no-verify`.
- Do not create a PR if required validation fails.
- If validation fails and the fix is clearly in scope, fix it and rerun validation.
- If validation fails and the cause is unrelated, unclear, or a likely false positive, stop and report it.
- Do not silently skip required validation.
- Default validation must remain no-network.
- Hosted/external integration tests must remain opt-in or gated.
- Do not modify GitHub Actions, package files, lock files, deployment config, or frontend UI unless the issue explicitly requires it.

## Git workflow

- Fetch the latest `develop` before starting work.
- Create a branch named for the issue, for example `chore/issue-233-codex-quality-gates`.
- Never push directly to `develop` or `main`.
- Keep branch history focused on the issue.
- Commit with Conventional Commits.
- Push only after the required validation passes.

## Issue workflow

- Read the full issue body first.
- Confirm the scope, out of scope, acceptance criteria, and validation before changing files.
- Implement only the requested scope.
- Reuse existing scripts, workflows, and docs whenever possible.
- Keep local quality gates aligned with CI, but do not weaken CI to make local checks pass.
- When an issue is documentation or tooling only, avoid runtime or product behavior changes.

## Branch naming

- Use `docs/issue-<number>-<slug>` for documentation-only work.
- Use `feat/issue-<number>-<slug>` for new user-facing functionality.
- Use `fix/issue-<number>-<slug>` for bug fixes.
- Use `test/issue-<number>-<slug>` for test-only changes.
- Use `chore/issue-<number>-<slug>` for workflow, tooling, or maintenance work.
- Keep the slug short and descriptive.

## Validation policy

- Run the validation requested by the issue body.
- For docs-only changes, run docs validation only if it exists.
- For tooling or configuration changes, run the relevant local quality gates and verify hooks directly when possible.
- For code-bearing changes, run lint, typecheck, unit tests with coverage, build, Playwright E2E, and secret scan.
- Secret scan uses Gitleaks as the primary scanner.
- If Gitleaks is missing, install it or set `GITLEAKS_BIN` before rerunning validation.
- For test-only changes, run affected tests plus any broader checks required by shared fixtures or test setup changes.
- For hosted or external integration changes, keep default validation no-network and gated.

## PR requirements

- Use the PR template.
- Include the related issue number.
- Include the commands that were run.
- Include the validation results.
- Include the safety confirmation checklist.
- Include reviewer notes when there are caveats or skipped checks.

## Safety boundaries

Do not add the following unless the issue explicitly requires it:

- Hosted MCP implementation
- Direct Trust JWT implementation
- OAuth / token handling
- token storage / refresh
- DCR support
- OAuth 2.0 Trust / EAS
- PAT handling
- raw MCP tool exposure
- raw MCP output exposure
- raw transport output exposure
- arbitrary query generation
- arbitrary query execution
- underlying data access
- field values / row data retrieval
- sample values / domain values retrieval
- write-capable tools
- broad ChatService replacement
- broad free-form chat routing rewrite
- selected_mark_explanation behavior changes
- LLM ResponseComposer behavior changes
- Exploration Session
- AgentCore
- frontend UI / UX changes
- deployment config changes
- application runtime behavior changes

## Prohibited actions

- Do not push directly to `develop` or `main`.
- Do not use `--no-verify`.
- Do not create a PR before validation passes.
- Do not bypass hooks.
- Do not expand scope without a clear reason from the issue body.
- Do not introduce secrets, tokens, credentials, or real service data into the repository.
- Do not weaken or remove existing CI gates to make local validation pass.
- Do not silence or bypass Gitleaks findings without human review.

## Failure handling

- If a check fails and the fix is clearly in scope, fix it and rerun validation.
- If a check fails and the cause is unrelated, unclear, or a likely false positive, stop and report the failure.
- If the issue scope is unclear, pause and ask for clarification before changing behavior.
- If validation cannot be completed because of missing local setup, report the missing prerequisite and the exact command that was blocked.
