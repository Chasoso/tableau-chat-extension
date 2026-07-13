## Summary

-

## Related issue

Closes #

For `main` PRs, automatically include `Closes #<issue-number>` for all related completed issues even if the prompt does not name the issue numbers; for `develop` PRs, omit `Closes` unless explicitly requested.

## Changes

-

## Validation

- [ ] Lint
- [ ] Typecheck
- [ ] Unit tests with coverage
- [ ] Build
- [ ] Playwright E2E
- [ ] Secret scan
- [ ] Docs validation, if applicable

Commands run:

```text

```

## Safety confirmation

- [ ] No direct push to develop/main
- [ ] No `--no-verify`
- [ ] No secrets/tokens committed
- [ ] No raw MCP output exposure
- [ ] No arbitrary query execution
- [ ] No underlying data access
- [ ] No field values / row data retrieval
- [ ] No write-capable tools
- [ ] No unintended frontend/UI changes
- [ ] No package/lock/CI changes unless explicitly required
- [ ] Default checks remain no-network
- [ ] Hosted/external integration tests remain opt-in or gated

## Notes for reviewer

-
