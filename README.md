# Tableau Chat Assistant Extension PoC

## English

This is a PoC for a chat-style Tableau Dashboard Extension running inside Tableau Cloud dashboards. The React UI captures the current dashboard context through the Tableau Extensions API and sends user questions to a Node.js backend shaped like API Gateway + Lambda.

Answer generation is mocked for now. The backend depends on a `TableauContextProvider` interface, so the chat flow can switch between `DirectTableauApiContextProvider`, a future `TableauMcpContextProvider`, and `MockTableauContextProvider` without changing `ChatService`.

### Architecture

```mermaid
flowchart LR
  A[Tableau Cloud Dashboard] --> B[Dashboard Extension]
  B --> C[React Chat UI]
  C --> D[API Gateway]
  D --> E[Lambda Handler]
  E --> F[ChatService]
  F --> G[TableauContextProvider]
  G --> H[Tableau Connected App JWT]
  H --> I[Tableau REST API / Metadata API]
  F --> J[DynamoDB Chat History]
  F --> K[LLM Provider - mock in PoC]
```

### Local Setup

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Chat API: `POST http://localhost:3001/chat`
- Health API: `GET http://localhost:3001/health`

For browser-only mock development outside Tableau:

```bash
VITE_USE_MOCK_TABLEAU=true
VITE_API_BASE_URL=http://localhost:3001
```

### Loading As A Tableau Extension

Use `frontend/public/tableau-chat-extension.trex` when adding a Dashboard Extension in Tableau Desktop or Tableau Cloud.

The local manifest points to `http://localhost:5173/`. For production, host the built frontend on HTTPS and update the `.trex` `source-location` URL.

Depending on Tableau Cloud / Server settings, an administrator may need to allow network-enabled extensions and approve the extension domain.

### Tableau Connected App Values

The backend needs these values to sign in to Tableau REST API with Direct Trust JWT. Never put secret values in the frontend.

- `TABLEAU_SERVER_URL`: for example `https://prod-useast-a.online.tableau.com`
- `TABLEAU_SITE_CONTENT_URL`: Tableau site content URL, sometimes empty for the default site
- `TABLEAU_API_VERSION`: for example `3.25`
- `TABLEAU_CONNECTED_APP_CLIENT_ID`
- `TABLEAU_CONNECTED_APP_SECRET_ID`
- `TABLEAU_CONNECTED_APP_SECRET_VALUE`
- `TABLEAU_DEFAULT_SUBJECT`: Tableau Cloud user email for the PoC
- `TABLEAU_SCOPES`: comma-separated, defaults to `tableau:content:read`
- `TABLEAU_CONTEXT_PROVIDER`: defaults to `mock`; use `direct-api` for Tableau REST / Metadata API or `mcp` for the MCP provider stub

Chat history settings:

- `USE_IN_MEMORY_REPOSITORY=true`: use memory storage for local development
- `CHAT_HISTORY_TABLE_NAME`: DynamoDB table name
- `CORS_ALLOWED_ORIGIN`: restrict to the frontend origin in deployed environments

Authentication settings:

- Frontend: `VITE_AUTH_REQUIRED=true`
- Frontend: `VITE_COGNITO_USER_POOL_ID`
- Frontend: `VITE_COGNITO_CLIENT_ID`
- Frontend: `VITE_COGNITO_REGION`
- Frontend: `VITE_COGNITO_DOMAIN`: Cognito Hosted UI domain, for example `https://your-domain.auth.ap-northeast-1.amazoncognito.com`
- Frontend: `VITE_COGNITO_REDIRECT_URI`: exact Cognito callback URL, including trailing slash, for example `https://example.cloudfront.net/`
- Frontend: `VITE_COGNITO_LOGOUT_URI`: exact Cognito sign-out URL. Defaults to `VITE_COGNITO_REDIRECT_URI`.
- Backend: `AUTH_REQUIRED=true`
- Backend: `COGNITO_USER_POOL_ID`
- Backend: `COGNITO_CLIENT_ID`
- Backend: `COGNITO_REGION`

When authentication is enabled, the frontend redirects users to Cognito Hosted UI and sends the access token in the `Authorization` header. The backend verifies the Cognito JWT and derives the Tableau subject from the verified Cognito `email` claim. Frontend-provided usernames are never trusted for Tableau access.

Cognito callback and sign-out URLs must exactly match the frontend redirect URL, including scheme, host, path, and trailing slash. `https://example.cloudfront.net` and `https://example.cloudfront.net/` are different values to Cognito.

Provider selection:

- `mock`: no Tableau API or MCP call; safe local fallback.
- `direct-api`: backend signs in to Tableau using Connected Apps JWT and calls REST / Metadata API.
- `mcp`: backend calls `TableauMcpContextProvider`; currently a safe HTTP stub that returns warnings if MCP is not configured.

MCP settings:

- `TABLEAU_MCP_SERVER_URL`
- `TABLEAU_MCP_TRANSPORT=http`
- `TABLEAU_MCP_AUTH_MODE=none`
- `TABLEAU_MCP_TIMEOUT_MS=5000`

### What Works In This PoC

- React + TypeScript + Vite Dashboard Extension UI
- Tableau Extensions API initialization with mock fallback
- Dashboard context capture for dashboard name, worksheets, filters, parameters, selected marks, and datasources where available
- Chat UI sending questions to `/chat`
- Lambda-style backend handlers and local HTTP server
- Tableau Connected Apps Direct Trust JWT generation
- Tableau REST API sign-in client structure
- Metadata API GraphQL client structure
- DynamoDB repository and local in-memory repository
- Mock answer generation behind an `AnswerGenerator` interface
- Basic AWS auto-deployment through GitHub Actions
- Optional Cognito JWT protection for the chat API
- Provider switching between `mock`, `direct-api`, and `mcp`
- Context-based answer summaries that use dashboard metadata instead of only returning a mock placeholder

### Not Yet Implemented

- Real LLM integration with OpenAI, Bedrock, or another provider
- Production-ready user lifecycle, IdP federation, and Tableau user mapping
- Complete workbook LUID discovery from dashboard context
- Full Metadata API model for workbook -> dashboard -> sheets -> datasources -> fields
- Production-grade AWS additions such as custom domains, WAF, and audit logging
- Verified production MCP authentication and per-user Tableau permission delegation

### GitHub Actions AWS Deployment

`.github/workflows/deploy-aws.yml` and `infra/cloudformation.yaml` provide automated AWS deployment.

The workflow assumes an AWS role through GitHub OIDC, bundles backend Lambda code, deploys CloudFormation, uploads the frontend to S3, and invalidates CloudFront.

To reduce log exposure, ARNs containing AWS account IDs, S3 bucket names, CloudFront/API URLs, Tableau URLs, Connected App values, and Tableau user names are expected to be stored in GitHub Secrets. The workflow also uses `::add-mask::`, `mask-aws-account-id: true`, and avoids CloudFormation Outputs for URLs or physical IDs.

See [docs/github-actions-deployment.md](docs/github-actions-deployment.md).

### Future MCP Integration

The chat flow depends only on `TableauContextProvider`. Today, `DirectTableauApiContextProvider` calls REST API / Metadata API directly.

`TableauMcpContextProvider` is now present as a small backend-side provider. It is intentionally conservative until the exact MCP transport, hosting model, and Tableau authentication method are verified. Confirm whether Tableau MCP supports Connected Apps JWT or another per-user delegation model first. If not, continue direct REST API / Metadata API calls for production Tableau access.

See [docs/future-mcp-integration.md](docs/future-mcp-integration.md).

## 日本語

これは Tableau Cloud のダッシュボード内で動作する、チャット型 Tableau Dashboard Extension の PoC です。React UI が Tableau Extensions API から現在のダッシュボード情報を取得し、API Gateway + Lambda 相当の Node.js バックエンドへユーザーの質問を送信します。

回答生成は現時点ではモックです。バックエンドは `TableauContextProvider` インターフェースに依存する設計にしており、`DirectTableauApiContextProvider`、将来追加する `TableauMcpContextProvider`、`MockTableauContextProvider` を `ChatService` から透過的に差し替えられます。

### アーキテクチャ

```mermaid
flowchart LR
  A[Tableau Cloud Dashboard] --> B[Dashboard Extension]
  B --> C[React Chat UI]
  C --> D[API Gateway]
  D --> E[Lambda Handler]
  E --> F[ChatService]
  F --> G[TableauContextProvider]
  G --> H[Tableau Connected App JWT]
  H --> I[Tableau REST API / Metadata API]
  F --> J[DynamoDB Chat History]
  F --> K[LLM Provider - PoCではmock]
```

### ローカル起動

フロントエンド:

```bash
cd frontend
npm install
npm run dev
```

バックエンド:

```bash
cd backend
npm install
npm run dev
```

デフォルトのローカルURL:

- フロントエンド: `http://localhost:5173`
- バックエンド: `http://localhost:3001`
- Chat API: `POST http://localhost:3001/chat`
- Health API: `GET http://localhost:3001/health`

Tableau 外のブラウザでモック開発する場合:

```bash
VITE_USE_MOCK_TABLEAU=true
VITE_API_BASE_URL=http://localhost:3001
```

### Tableau Extension として読み込む方法

Tableau Desktop または Tableau Cloud で Dashboard Extension を追加するときに、`frontend/public/tableau-chat-extension.trex` を指定します。

ローカル用の manifest は `http://localhost:5173/` を参照します。本番では、ビルド済みフロントエンドを HTTPS でホストし、`.trex` の `source-location` URL を本番URLへ変更してください。

Tableau Cloud / Server の設定によっては、管理者が Network-enabled Extension を許可し、Extension のドメインを許可リストへ追加する必要があります。

### Tableau Connected App 設定値

Direct Trust JWT で Tableau REST API にサインインするため、バックエンドには以下の値が必要です。Secret 値は絶対にフロントエンドへ置かないでください。

- `TABLEAU_SERVER_URL`: 例 `https://prod-useast-a.online.tableau.com`
- `TABLEAU_SITE_CONTENT_URL`: Tableau site content URL。既定サイトでは空文字になる場合があります。
- `TABLEAU_API_VERSION`: 例 `3.25`
- `TABLEAU_CONNECTED_APP_CLIENT_ID`
- `TABLEAU_CONNECTED_APP_SECRET_ID`
- `TABLEAU_CONNECTED_APP_SECRET_VALUE`
- `TABLEAU_DEFAULT_SUBJECT`: PoC では Tableau Cloud ユーザーのメールアドレスを想定
- `TABLEAU_SCOPES`: カンマ区切り。既定は `tableau:content:read`
- `TABLEAU_CONTEXT_PROVIDER`: 既定は `mock`。Tableau REST / Metadata API を呼ぶ場合は `direct-api`、MCP provider stub を使う場合は `mcp`

チャット履歴保存用の設定:

- `USE_IN_MEMORY_REPOSITORY=true`: ローカル開発ではメモリ保存を使う
- `CHAT_HISTORY_TABLE_NAME`: DynamoDB のテーブル名
- `CORS_ALLOWED_ORIGIN`: デプロイ環境ではフロントエンドの Origin に制限する

認証設定:

- Frontend: `VITE_AUTH_REQUIRED=true`
- Frontend: `VITE_COGNITO_USER_POOL_ID`
- Frontend: `VITE_COGNITO_CLIENT_ID`
- Frontend: `VITE_COGNITO_REGION`
- Frontend: `VITE_COGNITO_DOMAIN`: Cognito Hosted UI domain。例 `https://your-domain.auth.ap-northeast-1.amazoncognito.com`
- Frontend: `VITE_COGNITO_REDIRECT_URI`: Cognito callback URL と完全一致させる値。末尾 `/` を含めます。例 `https://example.cloudfront.net/`
- Frontend: `VITE_COGNITO_LOGOUT_URI`: Cognito sign-out URL と完全一致させる値。未指定時は `VITE_COGNITO_REDIRECT_URI` と同じです。
- Backend: `AUTH_REQUIRED=true`
- Backend: `COGNITO_USER_POOL_ID`
- Backend: `COGNITO_CLIENT_ID`
- Backend: `COGNITO_REGION`

認証を有効化すると、フロントエンドは Cognito Hosted UI へリダイレクトし、API 呼び出し時に access token を `Authorization` header へ付与します。バックエンドは Cognito JWT を検証し、検証済み Cognito `email` claim から Tableau subject を決定します。フロントエンドから送られたユーザー名は Tableau access には使いません。

Cognito の callback URL と sign-out URL は、scheme、host、path、末尾スラッシュまで完全一致が必要です。Cognito では `https://example.cloudfront.net` と `https://example.cloudfront.net/` は別の値として扱われます。

Provider の切り替え:

- `mock`: Tableau API / MCP を呼ばない安全なローカルフォールバック。
- `direct-api`: バックエンドが Connected Apps JWT で Tableau にサインインし、REST / Metadata API を呼ぶ。
- `mcp`: `TableauMcpContextProvider` を使う。現時点では安全な HTTP stub で、MCP 未設定時は warnings を返します。

MCP 設定:

- `TABLEAU_MCP_SERVER_URL`
- `TABLEAU_MCP_TRANSPORT=http`
- `TABLEAU_MCP_AUTH_MODE=none`
- `TABLEAU_MCP_TIMEOUT_MS=5000`

### このPoCでできること

- React + TypeScript + Vite の Dashboard Extension UI
- Tableau Extensions API の初期化とモックフォールバック
- ダッシュボード名、ワークシート、フィルター、パラメーター、選択マーク、データソース情報の取得
- チャットUIから `/chat` API への質問送信
- Lambda 形式のバックエンドハンドラーとローカルHTTPサーバー
- Tableau Connected Apps Direct Trust JWT の生成
- Tableau REST API sign-in クライアント構造
- Metadata API GraphQL クライアント構造
- DynamoDB Repository とローカル用 In-memory Repository
- `AnswerGenerator` インターフェース越しのモック回答生成
- GitHub Actions から AWS へ自動デプロイするための基本構成
- Chat API の Cognito JWT 保護を任意で有効化
- `mock`、`direct-api`、`mcp` の Provider 切り替え
- 単なるモック文ではなく、取得済みダッシュボードメタデータを使ったコンテキスト要約回答

### まだできないこと

- OpenAI / Bedrock などの実LLM連携
- 本番レベルのユーザーライフサイクル、IdP 連携、Tableau ユーザーマッピング
- ダッシュボードコンテキストからの完全な workbook LUID 特定
- workbook -> dashboard -> sheets -> datasources -> fields までの完全な Metadata API モデル化
- 独自ドメイン、WAF、監査ログなどを含む本番運用向けAWS構成
- 本番利用できる MCP 認証とユーザー別 Tableau 権限 delegation の検証

### GitHub Actions によるAWSデプロイ

`.github/workflows/deploy-aws.yml` と `infra/cloudformation.yaml` で、AWS への自動デプロイ構成を用意しています。

ワークフローは GitHub OIDC で AWS ロールを Assume し、バックエンドの Lambda bundle、CloudFormation デプロイ、フロントエンドの S3 配置、CloudFront invalidation を実行します。

ログ露出を抑えるため、AWSアカウントIDを含むARN、S3 bucket名、CloudFront/API URL、Tableau URL、Connected App 情報、Tableau ユーザー名などは GitHub Secrets に置く前提です。Actions 内でも `::add-mask::` と `mask-aws-account-id: true` を使い、CloudFormation Outputs にはURLや物理IDを出さない設計にしています。

詳しくは [docs/github-actions-deployment.md](docs/github-actions-deployment.md) を参照してください。

### 今後のMCP統合方針

チャット処理は `TableauContextProvider` だけに依存しています。現在は REST API / Metadata API を直接呼ぶ `DirectTableauApiContextProvider` を用意しています。

`TableauMcpContextProvider` は、バックエンド側の小さな provider として追加済みです。ただし、正確な MCP transport、ホスティング方式、Tableau 認証方式が確定するまでは保守的な stub 実装に留めています。Tableau MCP 側が Connected Apps JWT またはユーザー別 delegation model に対応しているか確認してください。対応していない場合は、REST API / Metadata API の直呼びを継続します。

詳細は [docs/future-mcp-integration.md](docs/future-mcp-integration.md) を参照してください。
