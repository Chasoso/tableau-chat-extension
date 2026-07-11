# Approved Log Groups

Use only approved dev log groups for local Codex diagnostics.

Default investigation window: `reported time ±10 minutes`

## Mapping

| Logical component      | Environment | Log group pattern                          | Expected structured fields                                                                                                                             | Search priority | Sensitive content risk |
| ---------------------- | ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------- |
| Chat API Lambda        | dev         | `/aws/lambda/<stack-name>-chat`            | `timestamp`, `level`, `service`, `environment`, `version`, `component`, `operation`, `requestId`, `correlationId`, `errorCode`, `durationMs`, `result` | 1               | Low, summary-only      |
| Chat job worker Lambda | dev         | `/aws/lambda/<stack-name>-chat-job-worker` | Same as above plus job progress markers                                                                                                                | 2               | Low, summary-only      |
| Health Lambda          | dev         | `/aws/lambda/<stack-name>-health`          | `timestamp`, `level`, `service`, `environment`, `version`, `component`, `operation`, `result`                                                          | 3               | Low, summary-only      |

## Notes

- Replace `<stack-name>` with the approved dev stack name only.
- Do not add staging or production patterns to this list.
- Keep the search scope limited to the component that matches the incident.
- Prefer structured fields before scanning message text.
- Never rely on raw log bodies to summarize the incident in GitHub.
