# Codex PR Workflow

This repository uses local quality gates so Codex can prepare branches safely before opening pull requests.

## Workflow Rules

- One issue maps to one branch and one pull request.
- Base branch is `develop`.
- Never push directly to `develop` or `main`.
- Never use `git commit --no-verify` or `git push --no-verify`.
- Run the local quality gates before creating a pull request.
- If a hook fails, fix the issue if it is clearly in scope, rerun the hook, and only continue after it passes.
- If the failure is unrelated or looks like a false positive secret scan, stop and report the failure instead of bypassing the hook.

## Local Gates

- Run `npm run setup:hooks` once after cloning, or run `npm install` at the repository root so the `prepare` script can configure `core.hooksPath`.
- `npm run quality:precommit` runs staged-file checks and secret scanning.
- `npm run quality:prepush` runs the local CI-equivalent gate.
- `npm run quality:ci-local` is an alias for the same full local gate.

## What Pre-Commit Checks Do

- Reject obvious secret files such as `.env`, `.env.local`, `.env.*.local`, private key files, and credential JSON files.
- Scan staged files for high-confidence secret patterns.
- Run Prettier on staged text files where applicable.
- Run ESLint on staged TypeScript and JavaScript files where applicable.
- Do not run the full unit, build, or Playwright suites.

## What Pre-Push Checks Do

- Run lint.
- Run typecheck.
- Run unit tests with coverage.
- Run the build.
- Run Playwright E2E.

These checks must stay no-network by default and must not require Hosted MCP, Tableau credentials, or real LLM credentials.

## Validation

Use the following commands before opening a PR:

```bash
npm run quality:precommit
npm run quality:prepush
```

If the repository workspace changes, keep using the existing workspace scripts underneath those commands rather than introducing new package-manager flows.

## PR Body

Include a concise summary, the validation results, and a closing reference such as:

```md
Closes #230
```

## If Checks Fail

- If a staged file fails formatting or linting, fix it and rerun `npm run quality:precommit`.
- If the secret scan flags a real secret, remove it immediately and rerun the hook.
- If a check fails outside the current issue scope, stop and report the failure with the exact command that failed.
