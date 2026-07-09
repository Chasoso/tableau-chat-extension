# v0.11.0 Issue Index

This page records the issue set for `v0.11.0 Usable Hosted Tableau MCP Metadata Discovery`.

## Overview

- Parent issue: [#235](https://github.com/Chasoso/tableau-chat-extension/issues/235)
- Child issue 1: [#236](https://github.com/Chasoso/tableau-chat-extension/issues/236)
- Child issue 2: [#237](https://github.com/Chasoso/tableau-chat-extension/issues/237)
- Child issue 3: [#238](https://github.com/Chasoso/tableau-chat-extension/issues/238)

## Recommended Order

1. [#236 v0.11.0 planning usable Hosted metadata discovery](https://github.com/Chasoso/tableau-chat-extension/issues/236)
2. [#237 Implement usable Hosted metadata discovery via describeDatasource](https://github.com/Chasoso/tableau-chat-extension/issues/237)
3. [#238 Document usable Hosted metadata discovery result and wrap-up](https://github.com/Chasoso/tableau-chat-extension/issues/238)

Issue #237 is the main implementation issue.
Issue #236 confirms the plan and scope before implementation starts.
Issue #238 captures the result and wrap-up after implementation lands.

## Issue Types

- Docs-only: [#236](https://github.com/Chasoso/tableau-chat-extension/issues/236)
- Code-bearing: [#237](https://github.com/Chasoso/tableau-chat-extension/issues/237)
- Docs-only: [#238](https://github.com/Chasoso/tableau-chat-extension/issues/238)

## Safety Boundaries

- Hosted execution is opt-in / gated.
- Default validation stays no-network.
- Fake / stdio fallback must remain available.
- Connected App + Direct Trust is the auth boundary.
- DCR-dependent OAuth 2.1 Remote MCP host flow is out of scope.
- Raw JWTs, tokens, secrets, and raw MCP output must not be exposed.
- `describeDatasource` is the first hosted execution target.
- `listFields`, arbitrary query execution, underlying data access, and write tools are out of scope.
- `selected_mark_explanation`, ResponseComposer, Exploration Session, and AgentCore remain unchanged or deferred.

## Out of Scope

- DCR
- OAuth 2.0 Trust / EAS
- PAT
- token storage / refresh
- `listFields` execution
- arbitrary query generation / execution
- underlying data access
- field values / row data retrieval
- sample values / domain values retrieval
- write tools
- datasource crawling
- workbook / view crawling
- broad free-form chat routing rewrite
- frontend redesign
- default hosted CI

## Implementation Notes

- Keep the issue structure compact.
- Do not expand beyond the three planned issues unless the plan is clearly inconsistent.
- Issue #236 should only confirm or minimally correct `docs/v0.11-plan.md`.
- Issue #237 should connect only eligible `metadata_discovery` datasource plans to Hosted `describeDatasource`.
- Issue #238 should document the result, limitations, fallback behavior, and remaining risks.

## Validation Expectations

- Issue #236: docs review only.
- Issue #237: local quality gates, with hosted integration tests gated and skipped by default.
- Issue #238: docs review only.
- Default CI remains no-network.
- Hosted / external integration tests remain opt-in or gated.

## Milestone Docs

- Result: [`docs/v0.11-hosted-metadata-discovery-result.md`](../../v0.11-hosted-metadata-discovery-result.md)
- Wrap-up: [`docs/v0.11-wrap-up.md`](../../v0.11-wrap-up.md)

## Notes

- Issue #237 is the functional milestone for usable Hosted `describeDatasource`.
- Issue #238 records what actually shipped, what remains gated, and the remaining limitations.
- The docs in this folder intentionally stay compact so the issue flow remains easy to follow.

## Short Prompts

### Issue #236

```md
Review `docs/v0.11-plan.md`, confirm the v0.11.0 scope, and update the issue index if needed.
Do not restart planning or change code.
```

### Issue #237

```md
Implement usable Hosted metadata discovery via `describeDatasource`.
Keep Hosted execution gated, preserve fake / stdio fallback, and run the required local quality gates.
```

### Issue #238

```md
Document the v0.11.0 result and wrap-up.
Record what Hosted metadata discovery can actually do, what remains gated, and the remaining limitations.
```
