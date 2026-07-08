# Codex Nightly Workflow

This document describes how to hand Codex a batch of issues overnight so the result is a set of safe, reviewable PRs the next morning.

## When Nightly Batching Is Appropriate

- Use it when several issues are already scoped and ready to implement.
- Use it when the issues are independent or can be safely ordered by dependency.
- Use it when the goal is to wake up to reviewable PRs, not to merge automatically.

## How Humans Should Group Issues

- Group unrelated issues only when they are parallel-safe.
- Group dependent issues in dependency order.
- Keep each issue small enough that validation can be completed locally.
- Prefer a batch where each issue can still be reviewed independently.

## Sequential vs Parallel-Safe

- Run sequentially when issues touch shared files, shared contracts, or shared behavior.
- Run sequentially when one issue depends on the output of another.
- Parallelize only when issues are clearly independent and do not compete for the same files or validation state.
- If in doubt, choose sequential execution.

## Dependency Handling

- Start every issue from the latest `develop`.
- Use one issue = one branch = one PR.
- Do not reuse branches across issues.
- Do not continue dependent issues if an earlier dependency fails.
- If an upstream issue fails, stop downstream dependent work and report the dependency failure.

## Failure Handling

- Independent issues may continue if one issue fails.
- Do not create PRs for failed issues.
- Do not create PRs if validation fails.
- Do not use `--no-verify`.
- Do not bypass Gitleaks failures with allowlists or `--no-verify`.
- If a failure is clearly in scope, fix it and rerun validation.
- If the failure is unrelated, unclear, or looks like a false positive, stop and report it.

## Blocked Issues

- Mark the issue as blocked when progress cannot continue without missing scope, a missing dependency, or external state.
- Do not guess beyond the issue body.
- Do not widen the scope to work around a blocker.
- Report the exact blocking reason and the next dependency needed.

## Batch Summary Format

At the end of the batch, provide a summary in this format:

```md
## Batch Summary

### PRs created

- #<issue>: <PR URL>

### Skipped / blocked

- #<issue>: <reason>

### Failed

- #<issue>: <reason>

### Commands run

- <summary>

### Notes for human review

- <review points>
```

## Short Nightly Prompt Example

```md
Handle the following issues overnight:

- #123
- #124
- #125

Follow AGENTS.md and each issue body.
Use one issue = one branch = one PR.
Run the required validation before PR creation.
Do not use --no-verify.
Skip dependent issues if their prerequisite fails.
At the end, provide a batch summary.
```
