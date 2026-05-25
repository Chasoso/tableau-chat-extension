# GitHub Actions AWS Deployment / GitHub Actions AWSデプロイ

## English

`.github/workflows/deploy-aws.yml` deploys the backend, frontend, and AWS resources.

The workflow intentionally avoids printing AWS account IDs, ARNs, bucket names, CloudFront/API URLs, Tableau URLs, Connected App secrets, Cognito identifiers, JWTs, or access tokens.

### Flow

1. Install, typecheck, and test the backend.
2. Bundle Lambda handlers with `esbuild`.
3. Create a Lambda package that includes production `node_modules` so Lambda can launch `@tableau/mcp-server`.
4. Install, typecheck, and build the frontend.
5. Rewrite the built `.trex` with `EXTENSION_SOURCE_URL`.
6. Assume the GitHub OIDC deploy role.
7. Upload the backend artifact to the private artifact bucket.
8. Deploy `infra/cloudformation.yaml`.
9. Sync `frontend/dist` to the private frontend S3 bucket.
10. Invalidate CloudFront.

### GitHub Secrets

Store these as GitHub Secrets:

| Name | Purpose |
| --- | --- |
| `AWS_CFN_STACK_NAME` | CloudFormation stack name. |
| `AWS_GHA_DEPLOY_ROLE_ARN` | GitHub OIDC deploy role ARN. |
| `AWS_CFN_EXECUTION_ROLE_ARN` | CloudFormation execution role ARN. |
| `AWS_ARTIFACT_BUCKET` | Private S3 bucket for Lambda artifacts. |
| `FRONTEND_BUCKET_NAME` | Private S3 bucket for frontend hosting. |
| `VITE_API_BASE_URL` | Usually `/api` when using the CloudFront proxy behavior. |
| `EXTENSION_SOURCE_URL` | Deployed HTTPS frontend URL for `.trex`. |
| `CORS_ALLOWED_ORIGIN` | Allowed frontend origin. |
| `TABLEAU_SERVER_URL` | Tableau Cloud / Server URL. |
| `TABLEAU_SITE_CONTENT_URL` | Tableau site content URL. |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` | Connected App client ID. |
| `TABLEAU_CONNECTED_APP_SECRET_ID` | Connected App secret ID. |
| `TABLEAU_CONNECTED_APP_SECRET_VALUE` | Connected App secret value. |
| `TABLEAU_DEFAULT_SUBJECT` | PoC fallback Tableau subject. |
| `COGNITO_USER_POOL_ID` | Required when auth is enabled. |
| `COGNITO_CLIENT_ID` | Required when auth is enabled. |
| `VITE_COGNITO_DOMAIN` | Cognito Hosted UI domain. |
| `VITE_COGNITO_REDIRECT_URI` | Exact callback URL. |
| `VITE_COGNITO_LOGOUT_URI` | Exact sign-out URL. |
| `TABLEAU_MCP_SERVER_URL` | Optional only for HTTP MCP mode. |
| `TABLEAU_MCP_COMMAND` | Optional override for MCP command. Usually empty. |
| `TABLEAU_MCP_ARGS` | Optional override for MCP args. Usually empty. |

### GitHub Variables

These can be repository Variables if acceptable:

| Name | Default | Purpose |
| --- | --- | --- |
| `AWS_REGION` | none | Main AWS deployment region. |
| `TABLEAU_API_VERSION` | `3.25` | Tableau REST API version. |
| `TABLEAU_SCOPES` | `tableau:content:read` | Connected App scopes. |
| `TABLEAU_CONTEXT_PROVIDER` | `mock` | `mock`, `direct-api`, or `mcp`. |
| `AUTH_REQUIRED` | `false` | Enables Cognito JWT verification. |
| `COGNITO_REGION` | none | Cognito region. |
| `TABLEAU_MCP_TRANSPORT` | `stdio` | Recommended MCP transport for low-cost Lambda PoC. |
| `TABLEAU_MCP_AUTH_MODE` | `direct-trust` | MCP authentication mode. |
| `TABLEAU_MCP_TIMEOUT_MS` | `5000` | MCP timeout. |
| `TABLEAU_MCP_ALLOWED_TOOLS` | empty | Optional comma-separated MCP tool allowlist. |
| `TABLEAU_MCP_MAX_TOOL_CALLS` | `3` | Maximum MCP tool calls per request. |
| `MODEL_PROVIDER` | `mock` | `mock` or `bedrock`. |
| `BEDROCK_REGION` | `us-east-1` | Bedrock model region. |
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` | Bedrock model ID. |
| `BEDROCK_MAX_OUTPUT_TOKENS` | `1200` | Max generated tokens. |
| `BEDROCK_TEMPERATURE` | `0.2` | Generation temperature. |

### CloudFormation Execution Role Additions

The CloudFormation execution role needs the existing permissions for Lambda, API Gateway, CloudFront, S3, DynamoDB, Logs, IAM, and Secrets Manager.

For Bedrock, add:

```json
{
  "Sid": "AllowBackendRoleToInvokeConfiguredBedrockModel",
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": [
    "arn:aws:bedrock:<bedrock-region>::foundation-model/<model-id>",
    "arn:aws:bedrock:<bedrock-region>:<account-id>:inference-profile/<model-id>",
    "arn:aws:bedrock:<bedrock-region>::inference-profile/<model-id>"
  ]
}
```

This permission is attached by the CloudFormation template to the Lambda backend role. The CloudFormation execution role must also be allowed to create/update that inline IAM policy.

The CloudFormation execution role also needs `secretsmanager:GetSecretValue` for the managed Connected App secret because CloudFormation may read secret values during updates and rollback.

### Artifact Size Note

The Lambda package now includes production `node_modules` because the MCP provider launches `@tableau/mcp-server` at runtime. If the package becomes too large or cold starts are too slow, move MCP dependencies into a Lambda Layer or a Lambda container image.

### Logging Rules

- Do not use `set -x`.
- Do not print stack outputs.
- Do not print `aws sts get-caller-identity`.
- Keep `mask-aws-account-id: true`.
- Use `--only-show-errors` and `--no-progress` for S3 commands.
- Mask physical resource IDs before using them.
- Keep failure event output sanitized.

## 日本語

`.github/workflows/deploy-aws.yml` は、バックエンド、フロントエンド、AWSリソースをデプロイします。

Actionsログには AWSアカウントID、ARN、バケット名、CloudFront/API URL、Tableau URL、Connected App secret、Cognito識別子、JWT、アクセストークンを出さない方針です。

### 処理の流れ

1. バックエンドを install / typecheck / test する。
2. `esbuild` で Lambda handler を bundle する。
3. Lambda 内で `@tableau/mcp-server` を起動できるように production `node_modules` を含めて zip 化する。
4. フロントエンドを install / typecheck / build する。
5. build済み `.trex` のURLを `EXTENSION_SOURCE_URL` で書き換える。
6. GitHub OIDC deploy role を Assume する。
7. backend artifact を private artifact bucket にアップロードする。
8. `infra/cloudformation.yaml` をデプロイする。
9. `frontend/dist` を private frontend bucket に同期する。
10. CloudFront invalidation を実行する。

### GitHub Secrets

以下は Secrets に保存してください。

| Name | 用途 |
| --- | --- |
| `AWS_CFN_STACK_NAME` | CloudFormation stack名 |
| `AWS_GHA_DEPLOY_ROLE_ARN` | GitHub OIDC deploy role ARN |
| `AWS_CFN_EXECUTION_ROLE_ARN` | CloudFormation execution role ARN |
| `AWS_ARTIFACT_BUCKET` | Lambda artifact用private S3 bucket |
| `FRONTEND_BUCKET_NAME` | frontend hosting用private S3 bucket |
| `VITE_API_BASE_URL` | 通常は CloudFront proxy を使うため `/api` |
| `EXTENSION_SOURCE_URL` | `.trex` に埋め込む HTTPS frontend URL |
| `CORS_ALLOWED_ORIGIN` | 許可するfrontend origin |
| `TABLEAU_SERVER_URL` | Tableau Cloud / Server URL |
| `TABLEAU_SITE_CONTENT_URL` | Tableau site content URL |
| `TABLEAU_CONNECTED_APP_CLIENT_ID` | Connected App client ID |
| `TABLEAU_CONNECTED_APP_SECRET_ID` | Connected App secret ID |
| `TABLEAU_CONNECTED_APP_SECRET_VALUE` | Connected App secret value |
| `TABLEAU_DEFAULT_SUBJECT` | PoC用 fallback Tableau subject |
| `COGNITO_USER_POOL_ID` | 認証有効時に必要 |
| `COGNITO_CLIENT_ID` | 認証有効時に必要 |
| `VITE_COGNITO_DOMAIN` | Cognito Hosted UI domain |
| `VITE_COGNITO_REDIRECT_URI` | Cognito callback URL |
| `VITE_COGNITO_LOGOUT_URI` | Cognito sign-out URL |
| `TABLEAU_MCP_SERVER_URL` | HTTP MCP mode の場合のみ任意 |
| `TABLEAU_MCP_COMMAND` | MCP command override。通常は空 |
| `TABLEAU_MCP_ARGS` | MCP args override。通常は空 |

### GitHub Variables

以下は組織上問題なければ Variables に保存できます。

| Name | Default | 用途 |
| --- | --- | --- |
| `AWS_REGION` | なし | メインAWSリージョン |
| `TABLEAU_API_VERSION` | `3.25` | Tableau REST API version |
| `TABLEAU_SCOPES` | `tableau:content:read` | Connected App scopes |
| `TABLEAU_CONTEXT_PROVIDER` | `mock` | `mock`, `direct-api`, `mcp` |
| `AUTH_REQUIRED` | `false` | Cognito JWT検証を有効化 |
| `COGNITO_REGION` | なし | Cognito region |
| `TABLEAU_MCP_TRANSPORT` | `stdio` | 低コストPoCの推奨MCP transport |
| `TABLEAU_MCP_AUTH_MODE` | `direct-trust` | MCP認証方式 |
| `TABLEAU_MCP_TIMEOUT_MS` | `5000` | MCP timeout |
| `TABLEAU_MCP_ALLOWED_TOOLS` | 空 | MCP tool allowlist |
| `TABLEAU_MCP_MAX_TOOL_CALLS` | `3` | 1リクエストあたりの最大MCP tool呼び出し数 |
| `MODEL_PROVIDER` | `mock` | `mock` または `bedrock` |
| `BEDROCK_REGION` | `us-east-1` | Bedrock model region |
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` | Bedrock model ID |
| `BEDROCK_MAX_OUTPUT_TOKENS` | `1200` | 最大生成token数 |
| `BEDROCK_TEMPERATURE` | `0.2` | temperature |

### CloudFormation Execution Role の追加権限

CloudFormation execution role には、既存の Lambda、API Gateway、CloudFront、S3、DynamoDB、Logs、IAM、Secrets Manager 権限が必要です。

Bedrock利用のため、Lambda backend role に `bedrock:InvokeModel` と `bedrock:InvokeModelWithResponseStream` を付与します。CloudFormation execution role は、その inline IAM policy を作成・更新できる必要があります。

また、Connected App secret の更新や rollback 時に CloudFormation が secret value を読むことがあるため、CloudFormation execution role には対象 Secret への `secretsmanager:GetSecretValue` も必要です。

### Artifact サイズ

MCP provider が Lambda 実行時に `@tableau/mcp-server` を起動するため、Lambda zip に production `node_modules` を含めています。サイズやコールドスタートが問題になった場合は、Lambda Layer または Lambda container image に分離してください。

### ログルール

- `set -x` を使わない。
- stack outputs を出さない。
- `aws sts get-caller-identity` を実行しない。
- `mask-aws-account-id: true` を維持する。
- S3コマンドでは `--only-show-errors` と `--no-progress` を使う。
- physical resource ID は使用前に mask する。
- CloudFormation 失敗イベントは sanitize して出す。
