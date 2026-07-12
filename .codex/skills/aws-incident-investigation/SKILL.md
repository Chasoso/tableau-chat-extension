# AWS Incident Investigation

Use this skill when the user provides:

- an environment
- an approximate time
- a timezone
- a symptom or failure mode

The goal is to investigate approved dev CloudWatch logs safely, identify the
likely cause, and decide whether a small fix can be made without exposing raw
log contents.

## Required reading

- `AGENTS.md`
- `docs/aws-diagnostics/README.md`
- `docs/aws-diagnostics/log-groups.md`
- `docs/aws-diagnostics/iam-policy.example.json`
- `docs/aws-diagnostics/codex-mcp.example.toml`
- `.codex/skills/aws-incident-investigation/references/components.md`
- `.codex/skills/aws-incident-investigation/references/error-codes.md`
- `.codex/skills/aws-incident-investigation/references/deployment-correlation.md`
- `.codex/skills/aws-incident-investigation/references/sensitive-data-policy.md`

## Workflow

1. Normalize the reported incident time.
2. Use the default `reported time ±10 minutes` investigation window unless the
   repository documentation says otherwise.
3. Identify the deployed commit/version active at that time.
4. Query only approved dev log groups.
5. Prefer structured fields such as `errorCode`, `component`, `operation`,
   `correlationId`, `requestId`, `durationMs`, `fallbackUsed`, and `result`.
6. Never copy raw log records into GitHub or commits.
7. Rank the likely causes by evidence.
8. If the cause is low-risk and in scope, create a regression test and apply the
   smallest fix.
9. Run the repository quality gates before opening a PR.
10. Stop and report if the evidence is insufficient or a permission boundary
    would need to change.

## Safety rules

- No raw tokens, JWTs, headers, emails, or MCP payloads.
- No unmasking.
- No secret retrieval.
- No AWS mutation.
- No production searches by default.

## Helper scripts

- `scripts/normalize-incident-time.mjs`
- `scripts/validate-diagnostic-summary.mjs`
- `scripts/collect-safe-deployment-context.mjs`
