# AWS Infrastructure Plan

This PoC includes a CloudFormation template at `infra/cloudformation.yaml` and a GitHub Actions workflow at `.github/workflows/deploy-aws.yml`.

The deployed architecture is:

- S3 + CloudFront for the React frontend
- API Gateway HTTP API for `/chat` and `/health`
- Lambda for backend handlers
- DynamoDB table for chat history
- Secrets Manager for Tableau Connected App values
- CloudWatch Logs with JWT and secret redaction discipline

## Suggested DynamoDB Table

Table name: `tableau-chat-history`

Keys:

- Partition key: `pk` string, for example `SESSION#<sessionId>`
- Sort key: `sk` string, for example `MESSAGE#<timestamp>#<messageId>`

Optional indexes can be added later for user, dashboard, or workbook lookups.

## Lambda Environment

- `TABLEAU_SERVER_URL`
- `TABLEAU_SITE_CONTENT_URL`
- `TABLEAU_API_VERSION`
- `TABLEAU_CONNECTED_APP_SECRET_ARN`
- `TABLEAU_DEFAULT_SUBJECT`
- `TABLEAU_SCOPES`
- `TABLEAU_CONTEXT_PROVIDER`
- `CHAT_HISTORY_TABLE_NAME`
- `USE_IN_MEMORY_REPOSITORY=false`
- `CORS_ALLOWED_ORIGIN`

## Deployment Notes

Restrict API Gateway CORS to the CloudFront frontend origin. If Tableau Cloud loads the extension inside a dashboard, ensure the hosted frontend domain is approved in Tableau extension settings and in the Connected App domain allowlist where applicable.

The template intentionally does not output API Gateway URLs, CloudFront domains, bucket names, distribution IDs, role ARNs, or account-specific identifiers. The GitHub Actions workflow retrieves physical resource IDs only when needed and immediately masks them.

