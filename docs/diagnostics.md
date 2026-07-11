# Structured Diagnostics

This repository now emits structured diagnostics for AWS-hosted runs and
metadata execution paths.

## Envelope

Each log line is JSON with these top-level fields:

- `timestamp`
- `level`
- `service`
- `environment`
- `version`
- `event`
- `component`
- `operation`

Additional fields are event-specific. The most important correlation and
execution fields are:

- `requestId`
- `correlationId`
- `agentRunId`
- `errorCode`
- `durationMs`
- `retryCount`
- `fallbackUsed`
- `result`

## Version context

- `DEPLOYMENT_VERSION` carries the deployed revision into Lambda logs.
- The AWS deploy workflow sets `DEPLOYMENT_VERSION` from the GitHub SHA.
- Local runs may leave `version` as `unknown` if no deployment metadata is set.

## Safety rules

Structured diagnostics must stay summary-only.

- Do not log raw JWTs, access tokens, refresh tokens, or bearer headers.
- Do not log Tableau Connected App secrets.
- Do not log raw MCP payloads or raw transport responses.
- Do not log user emails or Tableau subject values in clear text.
- Do not log row data, field values, or other data-bearing payloads.

If an event needs identity or transport context, use safe summaries such as
hashes, booleans, redacted markers, or normalized error codes.

## Hosted metadata diagnostics

Hosted metadata execution uses the same structured envelope and adds safe
status markers for:

- `not_configured`
- `auth_failed`
- `permission_denied`
- `timeout`
- `transport_error`

The hosted path is limited to read-only `describeDatasource` execution and
remains opt-in / gated.
