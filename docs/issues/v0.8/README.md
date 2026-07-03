# v0.8.0 Issue Set

This directory contains the issue templates for the v0.8.0 milestone:

- `00-v0.8.0-hosted-tableau-mcp-metadata-execution.md`
- `01-v0.8.0-planning-and-hosted-mcp-execution-boundaries.md`
- `02-verify-hosted-tableau-mcp-endpoint-and-site-settings.md`
- `03-define-hosted-mcp-integration-test-gating.md`
- `04-implement-hosted-tableau-mcp-transport-skeleton.md`
- `05-add-hosted-mcp-auth-context-adapter-boundary.md`
- `06-connect-describeDatasource-to-hosted-mcp-transport-behind-feature-flag.md`
- `07-normalize-hosted-mcp-metadata-errors.md`
- `08-add-hosted-metadata-execution-trace-coverage.md`
- `09-preserve-fake-no-network-and-stdio-fallback-tests.md`
- `10-evaluate-listfields-hosted-execution-readiness.md`
- `11-document-v0.8.0-hosted-mcp-metadata-execution-result.md`
- `12-v0.8.0-wrap-up.md`

## Usage

Run the creation script from the repository root after confirming `gh` authentication:

```bash
bash docs/issues/v0.8/create-v0.8-issues.sh
```

The script creates the parent issue first, then creates the child issues using the template files in this directory.

If you need to override the defaults, set the environment variables inline:

```bash
MILESTONE=v0.8.0 PARENT_LABELS=tableau-mcp CHILD_LABELS=tableau-mcp bash docs/issues/v0.8/create-v0.8-issues.sh
```

On Windows, use the shell that can run `bash` in your environment, such as Git Bash or WSL.

If the milestone or labels do not exist yet, the script now warns and skips them instead of failing.

If you want to create them first, you can run:

```bash
gh label create tableau-mcp --color 0052cc --description "Tableau MCP work"
gh milestone create v0.8.0 --description "v0.8.0 Hosted Tableau MCP Metadata Execution"
```

## Notes

- `#156` is the boundary-locking issue for v0.8.0.
- `#157` is the endpoint / site-settings verification issue and feeds `docs/v0.8-hosted-mcp-endpoint-site-settings-verification.md`.
- `#158` is the Hosted integration test gating issue and feeds `docs/v0.8-hosted-mcp-integration-test-gating.md`.
- `#159` is the Hosted transport skeleton issue and feeds `docs/v0.8-hosted-tableau-mcp-transport-skeleton.md`.
- `#160` is the Hosted MCP auth context adapter boundary issue and feeds `docs/v0.8-hosted-mcp-auth-context-adapter-boundary.md`.
- `#157` and later child issues should follow the plan in `docs/v0.8-plan.md`.
- The script keeps Hosted MCP work explicitly gated.
- The parent and child issue bodies use `{{PARENT_ISSUE_NUMBER}}`, which the script replaces after the parent issue is created.
- `MILESTONE`, `PARENT_LABELS`, and `CHILD_LABELS` can be overridden from the command line if the repository uses different names.
- The issue templates are docs-only or docs-first by design.
