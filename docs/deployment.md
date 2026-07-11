# デプロイ

## 構成

`infra/cloudformation.yaml` と `.github/workflows/deploy-aws.yml` がデプロイの中心です。

AWS 側の主な構成要素は次の通りです。

- S3: フロントエンド配信用バケット
- CloudFront: `index.html` と `assets/`、`/api/*` の振り分け
- API Gateway HTTP API: `/chat`、`/chat-jobs`、`/context`、`/notion/*`、`/auth/cognito/*`、`/health`
- Lambda: chat、job worker、health
- DynamoDB: chat history、chat jobs、Tableau MCP metadata cache、Cognito popup auth transactions、Notion connections、Notion OAuth states
- SSM: Cognito popup auth key、Notion token key
- CloudWatch Logs: Lambda ログ

## デプロイの流れ

1. `push` to `main` で `.github/workflows/deploy-aws.yml` が起動します。
2. まず CI 相当の検証を実行します。
3. backend を `esbuild` で bundle し、Lambda 用に zip 化します。
4. frontend を build し、`EXTENSION_SOURCE_URL` で `.trex` 内の URL を更新します。
5. GitHub OIDC で AWS ロールを引き受けます。
6. backend artifact を S3 にアップロードします。
7. CloudFormation でスタックを更新します。
8. frontend の `dist/` を S3 に同期し、CloudFront を invalidation します。

## GitHub Actions

### Hosted Tableau MCP settings

Use GitHub Actions Variables for Hosted Tableau MCP connection settings and keep the existing Tableau Connected App values in Secrets.

| Name                                      | Source   | Purpose                                         |
| ----------------------------------------- | -------- | ----------------------------------------------- |
| `TABLEAU_MCP_HOSTED_ENABLED`              | Variable | Enable Hosted Tableau MCP in deployed workflows |
| `TABLEAU_MCP_HOSTED_ENDPOINT`             | Variable | Hosted MCP server URL                           |
| `TABLEAU_MCP_HOSTED_TIMEOUT_MS`           | Variable | Hosted request timeout                          |
| `TABLEAU_MCP_HOSTED_SITE_ID`              | Variable | Tableau site ID for Hosted requests             |
| `TABLEAU_MCP_HOSTED_SITE_CONTENT_URL`     | Variable | Tableau site content URL for Hosted requests    |
| `TABLEAU_MCP_HOSTED_TEST_DATASOURCE_ID`   | Variable | Optional hosted test datasource ID              |
| `TABLEAU_MCP_HOSTED_TEST_DATASOURCE_NAME` | Variable | Optional hosted test datasource name            |
| `TABLEAU_MCP_HOSTED_INTEGRATION_TESTS`    | Variable | Opt-in hosted integration tests                 |

### ワークフロー

- `ci.yml`
  - `pull_request` to `main`
  - `push` to `develop`
  - `push` to `main`
- `deploy-aws.yml`
  - `push` to `main` のみ

### 役割

- `ci.yml` は lint / typecheck / unit tests / build / Playwright E2E を実行します。
- `deploy-aws.yml` は同じ品質ゲートに加えて AWS へのデプロイを行います。

## 初回セットアップ

1. AWS で OIDC 用の GitHub Actions ロールを用意します。
2. backend artifact 用の S3 バケットを用意します。
3. frontend 配信用の S3 バケットを用意します。
4. CloudFormation の実行ロールを用意します。
5. Tableau Connected App の値を用意します。
6. Cognito を使う場合は User Pool と App Client、Hosted UI ドメインを用意します。
7. Bedrock を使う場合は Lambda 実行ロールに Bedrock 権限を付けます。
8. Notion を使う場合は Notion 接続用の設定と SSM の鍵を用意します。

## 必要な GitHub Secrets / Variables

詳細な意味は [docs/configuration.md](configuration.md) を参照してください。  
デプロイに直接必要なものだけを抜粋します。

| 種別     | 名前                                 | 用途                              |
| -------- | ------------------------------------ | --------------------------------- |
| Secret   | `AWS_CFN_STACK_NAME`                 | CloudFormation スタック名         |
| Secret   | `AWS_GHA_DEPLOY_ROLE_ARN`            | GitHub OIDC 用 IAM role ARN       |
| Secret   | `AWS_CFN_EXECUTION_ROLE_ARN`         | CloudFormation execution role ARN |
| Secret   | `AWS_ARTIFACT_BUCKET`                | Lambda artifact 用 S3 バケット    |
| Secret   | `FRONTEND_BUCKET_NAME`               | frontend 配信用 S3 バケット       |
| Secret   | `VITE_API_BASE_URL`                  | frontend から見た API base URL    |
| Secret   | `EXTENSION_SOURCE_URL`               | `.trex` に書き込む公開 URL        |
| Secret   | `CORS_ALLOWED_ORIGIN`                | 許可する frontend origin          |
| Secret   | `TABLEAU_SERVER_URL`                 | Tableau Server / Cloud URL        |
| Secret   | `TABLEAU_SITE_CONTENT_URL`           | Tableau site content URL          |
| Secret   | `TABLEAU_CONNECTED_APP_CLIENT_ID`    | Connected App client ID           |
| Secret   | `TABLEAU_CONNECTED_APP_SECRET_ID`    | Connected App secret ID           |
| Secret   | `TABLEAU_CONNECTED_APP_SECRET_VALUE` | Connected App secret value        |
| Secret   | `TABLEAU_DEFAULT_SUBJECT`            | Tableau subject の既定値          |
| Variable | `AWS_REGION`                         | デプロイ先リージョン              |
| Variable | `TABLEAU_API_VERSION`                | Tableau REST API version          |
| Variable | `TABLEAU_SCOPES`                     | Connected App scopes              |
| Variable | `TABLEAU_CONTEXT_PROVIDER`           | `mock` / `direct-api` / `mcp`     |
| Variable | `AUTH_REQUIRED`                      | Cognito 認証の有効化              |
| Variable | `COGNITO_REGION`                     | Cognito リージョン                |

### 認証を有効にする場合

以下も必要です。

- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `VITE_COGNITO_DOMAIN`
- `VITE_COGNITO_REDIRECT_URI`
- `VITE_COGNITO_LOGOUT_URI`
- `COGNITO_POPUP_REDIRECT_URI`

### Notion を使う場合

以下を追加します。

- `NOTION_MCP_ENABLED`
- `NOTION_REDIRECT_URI`
- `NOTION_TOKEN_ENCRYPTION_KEY_PARAM`
- `NOTION_CONNECTIONS_TABLE`
- `NOTION_OAUTH_STATES_TABLE`
- `NOTION_MCP_ALLOWED_TOOLS`

### Bedrock を使う場合

以下を確認します。

- `MODEL_PROVIDER=bedrock`
- `BEDROCK_REGION`
- `BEDROCK_MODEL_ID`
- `BEDROCK_FOUNDATION_MODEL_ID`
- `BEDROCK_MAX_OUTPUT_TOKENS`
- `BEDROCK_TEMPERATURE`

## デプロイ後の確認

1. `GET /health` が 200 を返すことを確認します。
2. Tableau 拡張機能からフロントエンドを開けることを確認します。
3. `tableau-chat-extension.trex` の `source-location` が公開 URL を向いていることを確認します。
4. `AUTH_REQUIRED=true` の場合は Cognito ログインが通ることを確認します。
5. `TABLEAU_CONTEXT_PROVIDER=mcp` または `direct-api` の場合はダッシュボード文脈が取得できることを確認します。
6. Notion を有効にした場合は `GET /notion/status` と保存フローを確認します。

## 参考

- CloudFormation 定義: `infra/cloudformation.yaml`
- フロントエンドの `.trex` 更新: `frontend/scripts/update-trex-url.mjs`
- 実行コマンド: `package.json`
