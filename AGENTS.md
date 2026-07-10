# AGENTS.md

This repository is maintained with durable rules so Codex and other agents can work safely with short prompts.

## Repository rules

- Base branch is `develop`.
- Never push directly to `develop` or `main`.
- Use one of the execution modes defined in this document:
  - Single-issue mode
  - Work-package mode
- Do not combine unrelated issues in one branch or PR.
- Always read the full issue body before implementing.
- Follow each issue's `Scope`, `Out of scope`, `Acceptance criteria`, and `Validation`.
- Do not use `git commit --no-verify`.
- Do not use `git push --no-verify`.
- Do not create a PR if required validation fails.
- If validation fails and the fix is clearly in scope, fix it and rerun validation.
- If validation fails and the cause is unrelated, unclear, or a likely false positive, stop and report it.
- Do not silently skip required validation.
- Default validation must remain no-network.
- Hosted/external integration tests must remain opt-in or gated.
- Do not modify GitHub Actions, package files, lock files, deployment config, or frontend UI unless an issue explicitly requires it.

## Execution modes

### Single-issue mode

Use Single-issue mode when:

- only one issue is requested
- issues must be independently reviewed
- issues must be independently merged
- issues may need to be reverted separately
- the human does not explicitly group issues into a work package

Rules:

- one issue
- one branch
- one PR
- one or more focused commits
- include `Closes #<issue-number>` in the PR body only when the issue is fully completed

### Work-package mode

Use Work-package mode only when the human explicitly groups multiple related issues into one work package.

A work package is a set of related issues that:

- share one milestone, goal, or implementation flow
- have a clear execution order
- may edit the same files
- may depend on earlier issues in the package
- can be reviewed together as one coherent change

Rules:

- one work package
- one branch
- one PR
- multiple related issues may be included
- keep commits separated by issue whenever practical
- implement issues in the human-specified order
- include all related issue numbers in the PR body
- use `Closes #<issue-number>` only for issues fully completed by the PR
- do not close incomplete, skipped, or failed issues
- do not combine unrelated milestones or unrelated product areas

## Git workflow

### Common rules

- Fetch the latest `develop` before starting work.
- Never push directly to `develop` or `main`.
- Keep branch history focused on the requested issue or work package.
- Commit with Conventional Commits.
- Push only after the required validation passes.
- Do not bypass Git hooks.

### Single-issue branches

Use a branch named for the issue.

Examples:

- `docs/issue-236-v011-finalization`
- `feat/issue-237-hosted-describe-datasource`
- `fix/issue-250-timeout-normalization`
- `test/issue-260-hosted-fallback-tests`
- `chore/issue-233-codex-quality-gates`

### Work-package branches

Use a branch named for the shared goal or milestone.

Examples:

- `feat/v011-hosted-metadata-discovery`
- `chore/codex-workflow-hardening`
- `docs/v012-planning-and-wrap-up`

Do not include only one issue number in a work-package branch name unless that issue clearly represents the whole package.

## Issue workflow

Before changing files:

1. Read this `AGENTS.md`.
2. Read the full issue body for every requested issue.
3. Confirm the execution mode.
4. Confirm the issue order.
5. Confirm dependencies between issues.
6. Confirm each issue's scope, out of scope, acceptance criteria, and validation.
7. Inspect the current repository state and relevant files.

During implementation:

- Implement only the requested scope.
- Reuse existing scripts, workflows, abstractions, and docs whenever possible.
- Keep local quality gates aligned with CI.
- Do not weaken CI to make local checks pass.
- When an issue is documentation or tooling only, avoid runtime or product behavior changes.
- Re-read a file before editing it for each subsequent issue in a work package.
- Preserve acceptance criteria already satisfied by earlier issues in the same work package.
- Do not reset, overwrite, or discard valid changes from earlier issues in the same work package.

## Overlapping file changes

Multiple issues in the same work package may edit the same files.

This is expected and must not automatically stop execution.

When multiple issues edit the same file:

- process the issues in the specified order
- treat later changes as incremental changes on top of earlier changes
- re-read the latest file contents before each issue
- preserve valid changes made by earlier issues
- resolve semantic overlap within the shared work-package goal
- do not create separate branches merely because the same file is edited
- do not stop only because overlapping files were detected

Stop and ask for clarification only when:

- two issue requirements directly contradict each other
- satisfying one issue would invalidate another issue's acceptance criteria
- the correct final behavior cannot be inferred from the issue order or planning docs
- the overlap expands the scope beyond the work package goal

## Commit policy

### Single-issue mode

Use focused Conventional Commits.

Example:

```text
feat: add hosted describeDatasource execution
```

### Work-package mode

Prefer one logical commit per issue whenever practical.

Example:

```text
docs: finalize v0.11 plan (#236)
feat: add hosted describeDatasource execution (#237)
docs: document v0.11 result and wrap-up (#238)
```

A single combined commit is acceptable only when:

- the issues are technically inseparable
- separating commits would create broken intermediate states
- the reason is documented in the PR

Do not create noisy commits solely to match issue boundaries.

## Validation policy

- Run the validation requested by each issue body.
- For docs-only changes, run docs validation only if it exists.
- For tooling or configuration changes, run the relevant local quality gates and verify hooks directly when possible.
- For code-bearing changes, run:
  - Gitleaks
  - lint
  - typecheck
  - unit tests with coverage
  - build
  - Playwright E2E

- Secret scan uses Gitleaks as the primary scanner.
- If Gitleaks is missing, install it or set `GITLEAKS_BIN` before rerunning validation.
- For test-only changes, run affected tests plus broader checks required by shared fixtures or test setup changes.
- For hosted or external integration changes, keep default validation no-network and gated.

### Validation in Single-issue mode

- Run the validation required by the issue before push and PR creation.
- Do not create a PR if required validation fails.

### Validation in Work-package mode

- Run targeted validation after each code-bearing issue when practical.
- Run the complete required validation for the whole work package before the final push and PR creation.
- The final validation must cover all files and behaviors changed by the work package.
- A later successful validation does not excuse an unresolved known failure from an earlier issue.
- Record which validation applies to which issue in the PR body when useful.

## Autonomous decision boundary

Agents may make low-risk implementation decisions when they are consistent with:

- the issue body
- existing repository patterns
- current architecture
- existing tests
- the work-package goal

Agents must stop only when the decision would:

- expand scope
- change authentication or authorization
- increase data access
- alter deployment or CI architecture
- require production credentials
- contradict another issue
- introduce destructive or irreversible behavior

## Retry policy

For transient or environment-related failures:

1. Retry the failed command once without changes.
2. If it fails again, inspect logs and apply an in-scope fix.
3. Retry once after the fix.
4. Stop only after the third failed attempt.

Do not retry authentication failures, permission failures, secret-scan findings, or destructive operations automatically.

## Environment bootstrap policy

Agents may automatically install repository-local development dependencies.

Agents may also install documented local tooling when:

- the installation is non-destructive
- admin privileges are not required
- the tool version is pinned or documented
- no production credential is required

Agents must stop when:

- admin approval is required
- interactive login is required
- production credentials are required
- a system-wide configuration change is required

## Process and port isolation

- Use repository-defined ports when available.
- Before starting a local server, verify whether the port is already in use.
- Do not terminate unrelated processes.
- Track every process started by the agent.
- Clean up only processes started by the current work package.
- Ensure all local servers are stopped before final reporting.

## Reviewability threshold

Before creating the final PR, evaluate whether the diff is reviewable.

Split the work package when:

- unrelated concerns are mixed
- the change crosses multiple product areas without necessity
- authentication or authorization changes are mixed with unrelated UI changes
- generated files dominate the diff
- the agent cannot explain the change clearly in one PR summary

Do not split only because multiple issues touch the same file.

## Draft PR policy

A draft PR may be created only when:

- completed changes are valid and reviewable
- no known failing validation affects the completed changes
- incomplete issues are clearly marked
- incomplete issues are not closed
- the PR title begins with `Draft:`

Do not create a draft PR for branches containing known unsafe or broken code.

## Self-review before PR

Before creating a PR:

1. Re-read every included issue.
2. Review the full diff.
3. Verify every acceptance criterion.
4. Verify every out-of-scope boundary.
5. Search for secrets, debug code, TODOs, and temporary files.
6. Check for duplicated logic and unintended file changes.
7. Confirm the PR body matches the actual implementation.
8. Run final validation after review fixes.

## Validation evidence

For each validation command, record:

- exact command
- exit status
- concise result
- skipped tests and reason
- retry count if retried
- artifact location when available

## Post-PR CI monitoring

After creating a PR:

- wait for required CI checks
- if CI fails, inspect and fix failures that are clearly in scope
- push a follow-up commit
- wait for CI again
- stop after the configured retry limit
- report unresolved CI failures

## Issue status updates

For work-package PRs:

- list every included issue in the PR body
- add a progress comment to each issue
- use `Closes` only for fully completed issues
- leave partial or blocked issues open
- record the PR URL in each issue

## Nightly preflight

Before implementation, produce an internal execution plan containing:

- ordered issues
- dependencies
- overlapping files
- expected branch and PR
- validation requirements
- blocking prerequisites

Proceed without waiting for confirmation unless a mandatory stop condition is found.

## Time budget

- Use the human-provided time budget when specified.
- Otherwise use a default nightly budget.
- Stop starting new issues when less than 30 minutes remain.
- Use the remaining time for validation, self-review, push, PR creation, and reporting.

## Nightly completion priority

When approaching the time or retry limit, prioritize:

1. leaving the branch in a valid state
2. running required validation
3. completing self-review
4. pushing completed work
5. creating a reviewable PR or permitted draft PR
6. producing an accurate final report

Do not begin additional work that would prevent delivery of a reviewable result.

## PR requirements

### Common requirements

- Use the PR template.
- Include all related issue numbers.
- Include the commands that were run.
- Include the validation results.
- Include the safety confirmation checklist.
- Include reviewer notes when there are caveats, skipped checks, or manual review points.

### Single-issue PR

Include:

```text
Closes #<issue-number>
```

only when the issue is fully completed.

### Work-package PR

List all included issues.

Example:

```md
## Related issues

- Closes #236
- Closes #237
- Closes #238
```

Use `Closes` only for completed issues.

For incomplete or deferred issues, use non-closing references such as:

```md
- Related to #239
- Follow-up: #240
```

The PR body must also include:

- execution order
- issue-to-commit mapping when practical
- known dependencies
- skipped or incomplete issue details
- final work-package validation results

## Work-package size guidance

Prefer:

- 2 to 4 closely related issues
- one milestone or one coherent goal
- a reviewable final diff
- clear dependency order

Split the work package when:

- issues are unrelated
- issues belong to different milestones
- different teams or reviewers are required
- one issue should be independently reverted
- authentication, authorization, deployment, or data-access changes are unrelated to the other issues
- the resulting PR becomes difficult to review
- the work package contains multiple independent high-risk changes

Do not optimize only for fewer PRs.

Optimize for:

- uninterrupted automation
- coherent review
- clear rollback
- understandable history
- manageable risk

## Nightly execution

When the human requests overnight execution:

1. Confirm whether the request uses Single-issue mode or Work-package mode.
2. Read all requested issues before implementation.
3. Confirm issue order and dependencies.
4. Start from the latest `develop`.
5. Follow the selected execution mode.
6. Run required validation.
7. Create PRs only after validation passes.
8. Provide a final batch summary.

### Recommended nightly mode

Use Work-package mode when:

- the issues are related
- issues edit overlapping files
- later issues depend on earlier changes
- reducing PR count improves reviewability

Use Single-issue mode when:

- issues are independent
- separate review or rollback is important
- issues can be safely executed without shared unmerged state

## Work-package failure handling

Default behavior is strict mode unless the human explicitly requests best-effort mode.

### Strict mode

- If an issue fails, stop dependent later issues.
- Do not create the final PR if the work package is not in a valid reviewable state.
- Preserve completed work on the local branch.
- Report the blocking issue, failed command, and current branch state.
- Do not mark incomplete issues as completed.

### Best-effort mode

Use only when explicitly requested.

- Independent later issues may continue.
- Dependent later issues must stop.
- A draft PR may be created only if completed work is valid and reviewable.
- Clearly mark the PR as partial.
- Do not use `Closes` for incomplete or failed issues.
- Report all skipped, blocked, and failed issues.

## Final batch summary

For nightly or multi-issue execution, report:

```md
## Batch Summary

### Work package

- Mode: `<single-issue | work-package>`
- Branch: `<branch>`
- PR: `<PR URL or not created>`

### Issues completed

- #<issue>: <result>

### Issues skipped or blocked

- #<issue>: <reason>

### Issues failed

- #<issue>: <reason>

### Commits

- `<commit>` `<message>` — #<issue>

### Validation

- Gitleaks: `<result>`
- Lint: `<result>`
- Typecheck: `<result>`
- Unit tests with coverage: `<result>`
- Build: `<result>`
- Playwright E2E: `<result>`

### Notes for human review

- <review points>
- <known risks>
- <manual checks needed>
```

## Safety boundaries

Do not add the following unless an issue explicitly requires it:

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
- Do not create a PR before required validation passes.
- Do not bypass hooks.
- Do not expand scope without a clear reason from the issue body or work-package goal.
- Do not introduce secrets, tokens, credentials, or real service data into the repository.
- Do not weaken or remove existing CI gates to make local validation pass.
- Do not silence or bypass Gitleaks findings without human review.
- Do not automatically stop a work package only because multiple issues edit the same file.
- Do not combine unrelated issues merely to reduce PR count.
- Do not close issues that are incomplete, skipped, or failed.

## Failure handling

- If a check fails and the fix is clearly in scope, fix it and rerun validation.
- If a check fails and the cause is unrelated, unclear, or a likely false positive, stop and report the failure.
- If the issue scope is unclear, pause and ask for clarification before changing behavior.
- If validation cannot be completed because of missing local setup, report:
  - the missing prerequisite
  - the exact blocked command
  - the current branch state
  - whether a PR was created

- In Work-package mode, preserve completed earlier changes unless they make the branch invalid.
- Do not reset the work-package branch solely because a later issue failed.
