# Codex Validation Policy

This repository uses validation that depends on the change type. The goal is to keep local checks aligned with CI without over-running unrelated suites.

## Docs-Only Changes

Required:

- docs validation only if available
- no backend or frontend tests unless a docs generation or validation script requires them

Expected report:

```text
Backend tests: not run (docs-only change)
Frontend tests: not run (docs-only change)
E2E tests: not run (docs-only change)
```

## Code-Bearing Changes

Required:

- lint
- typecheck
- unit tests with coverage
- build
- Playwright E2E
- secret scan
- local quality gate / pre-push check if configured

## Test-Only Changes

Required:

- affected tests
- lint and typecheck if TypeScript files changed
- broader tests if shared fixtures or test setup changed

## Config / Tooling Changes

Required:

- relevant tooling command
- lint
- typecheck if TypeScript config changed
- unit tests if test setup changed
- Playwright E2E if Playwright config changed
- secret scan
- verify hooks or scripts directly when the issue changes them

## Hosted / External Integration Changes

Required:

- no-network tests by default
- hosted or external tests only when explicitly enabled
- skipped-by-default behavior must be verified
- no real secrets in default tests

## Local Gate Mapping

- `npm run quality:precommit` is the lightweight local gate.
- `npm run quality:prepush` is the CI-equivalent local gate.
- If direct hook scripts are present, verify them directly when the issue changes hooks or scripts.

## Reporting

- Report the exact commands that were run.
- Report the result for each required validation item.
- If a check was skipped because it was out of scope, say so explicitly.
- Keep default validation no-network unless the issue explicitly requires otherwise.
