# AWS Diagnostics for Codex

This repository uses a read-only AWS diagnostics workflow for local Codex
investigation of approved dev CloudWatch logs.

## Scope

- Dev only
- Read-only investigation
- No secret retrieval
- No log unmasking
- No AWS mutation
- No production discovery by default

## Recommended local profile

- Profile name: `tableau-chat-diagnostics`
- Region: `ap-northeast-1`

## Suggested setup

1. Create a dedicated AWS profile with read-only CloudWatch access.
2. Configure the local CloudWatch MCP server to use that profile.
3. Restrict the server to approved dev log groups only.
4. Keep credentials outside the repository.
5. Validate the setup with a safe smoke test before using it for an incident.

## CloudWatch MCP example

See [`codex-mcp.example.toml`](./codex-mcp.example.toml) for a checked-in
example configuration.

The command shown there is intentionally a placeholder for the approved local
CloudWatch MCP server binary or package in your environment.

## Least-privilege policy example

See [`iam-policy.example.json`](./iam-policy.example.json).

## Approved log groups

See [`log-groups.md`](./log-groups.md).

## Investigation references

- [`components.md`](./components.md)
- [`error-codes.md`](./error-codes.md)
- [`deployment-correlation.md`](./deployment-correlation.md)
- [`sensitive-data-policy.md`](./sensitive-data-policy.md)

## Safe smoke test

Use the local MCP server only against approved dev log groups and verify that
it can list tools or return metadata summaries without printing raw log
records.

The safe helper scripts in `.codex/skills/aws-incident-investigation/scripts`
can normalize incident windows and validate that diagnostic summaries do not
contain forbidden content before you query CloudWatch.

Example safe validation:

```text
node .codex/skills/aws-incident-investigation/scripts/normalize-incident-time.mjs --time "2026-07-11 23:18" --timezone "Asia/Tokyo"
node .codex/skills/aws-incident-investigation/scripts/validate-diagnostic-summary.mjs @docs/aws-diagnostics/safe-summary.example.json
```

## Revocation

To disable the setup:

1. Remove the profile from your local AWS config.
2. Delete any cached session credentials.
3. Remove the MCP server entry from your local Codex configuration.
4. Revoke or rotate any temporary role credentials used for diagnostics.

## Troubleshooting

- Missing profile: confirm the profile name and credential source chain.
- Permission denied: confirm the read-only policy is attached to the
  diagnostics identity and that the dev log groups are in scope.
- MCP startup failure: confirm the local command, region, and profile values.
- Empty results: confirm the time window and log-group mapping.

## Safety reminders

- Do not store credentials in this repository.
- Do not add production log groups to the allowlist.
- Do not copy raw log output into issues or PRs.
