# Future Tableau MCP Integration / 将来の Tableau MCP 統合

## English

### Current Direction

The backend now has three `TableauContextProvider` implementations:

- `MockTableauContextProvider`
- `DirectTableauApiContextProvider`
- `TableauMcpContextProvider`

`ChatService` depends only on the provider interface, so it does not need to know whether Tableau context comes from REST API, Metadata API, MCP tools, or mock data.

### Lambda-local stdio MCP

The first MCP implementation uses stdio transport and launches `@tableau/mcp-server` inside the Lambda invocation. This avoids the baseline cost of always-on ECS or App Runner for a low-usage PoC.

Configuration:

- `TABLEAU_CONTEXT_PROVIDER=mcp`
- `TABLEAU_MCP_TRANSPORT=stdio`
- `TABLEAU_MCP_AUTH_MODE=direct-trust`
- `TABLEAU_MCP_TIMEOUT_MS=5000`
- `TABLEAU_MCP_ALLOWED_TOOLS`: optional comma-separated tool allowlist
- `TABLEAU_MCP_MAX_TOOL_CALLS=3`

If `TABLEAU_MCP_COMMAND` and `TABLEAU_MCP_ARGS` are omitted, the backend resolves the installed `@tableau/mcp-server` package and runs it with the Lambda Node.js runtime.

### Cost Considerations

For low traffic, Lambda-local stdio is usually cheaper than running ECS Fargate or App Runner continuously. The tradeoff is cold start and package size. If MCP startup becomes too slow or the deployment package becomes too large, consider:

- Lambda Layer for MCP runtime dependencies
- Lambda container image
- App Runner with scale-to-low settings
- ECS Fargate only when long-lived sessions or predictable warm capacity are required

### Authentication and Permission Boundary

The PoC passes the verified Cognito email as the Tableau subject for Connected Apps Direct Trust. The MCP child process receives:

- `SERVER`
- `SITE_NAME`
- `AUTH=direct-trust`
- `JWT_SUB_CLAIM`
- Connected App client ID, secret ID, and secret value

These values are backend-only and are not logged.

The goal is that MCP calls execute as the verified Tableau subject, not as a broad service account. Production must verify that the selected Tableau MCP server and Tableau Cloud configuration enforce the same per-user permissions as Tableau itself.

Avoid using a service-account PAT for all users in production. If a PAT is used temporarily, all returned Tableau context reflects the service account's permissions, not the user's permissions.

### Tool Selection

The provider supports an explicit `TABLEAU_MCP_ALLOWED_TOOLS` allowlist. This should be used in production. Without an allowlist, the PoC only attempts a small number of metadata-oriented tools and skips tools whose required arguments cannot be inferred safely.

TODO:

- Decide the exact MCP tools to allow for workbook, dashboard, datasource, and metadata lookup.
- Add screenshot capture and multimodal prompt construction.
- Add per-tool audit logging without logging credentials or data payloads.
- Evaluate package size and cold start after MCP dependencies are included.

## 日本語

### 現在の方針

バックエンドには以下の `TableauContextProvider` があります。

- `MockTableauContextProvider`
- `DirectTableauApiContextProvider`
- `TableauMcpContextProvider`

`ChatService` はこのインターフェースだけに依存します。そのため、Tableau 情報の取得元が REST API、Metadata API、MCP、mock のどれであっても、チャット処理側の構造は変えません。

### Lambda 内 stdio MCP

最初の MCP 実装では、Lambda の実行中に `@tableau/mcp-server` を stdio transport で子プロセス起動します。利用頻度が低いPoCでは、常時起動の ECS Fargate や App Runner よりコストを抑えやすい構成です。

主な設定:

- `TABLEAU_CONTEXT_PROVIDER=mcp`
- `TABLEAU_MCP_TRANSPORT=stdio`
- `TABLEAU_MCP_AUTH_MODE=direct-trust`
- `TABLEAU_MCP_TIMEOUT_MS=5000`
- `TABLEAU_MCP_ALLOWED_TOOLS`: 呼び出しを許可する tool 名のカンマ区切り
- `TABLEAU_MCP_MAX_TOOL_CALLS=3`

`TABLEAU_MCP_COMMAND` と `TABLEAU_MCP_ARGS` を省略した場合は、Lambda に同梱された `@tableau/mcp-server` を Node.js ランタイムで起動します。

### コスト観点

低頻度利用では、Lambda 内 stdio MCP がもっとも安価になりやすいです。一方で、コールドスタートとパッケージサイズが課題になります。問題が出た場合は以下を検討します。

- MCP 依存を Lambda Layer に分離する
- Lambda コンテナイメージにする
- App Runner の低スケール構成を使う
- 長時間セッションや常時ウォームが必要な場合のみ ECS Fargate を使う

### 認証と権限境界

PoCでは、検証済み Cognito email を Tableau subject として Connected Apps Direct Trust に使います。MCP 子プロセスには以下を渡します。

- `SERVER`
- `SITE_NAME`
- `AUTH=direct-trust`
- `JWT_SUB_CLAIM`
- Connected App client ID、secret ID、secret value

これらはバックエンド内だけで扱い、ログには出しません。

目標は、MCP呼び出しが広い権限のサービスアカウントではなく、検証済み Tableau subject の権限で実行されることです。本番では、選択した Tableau MCP サーバーと Tableau Cloud 設定がユーザーごとの Tableau 権限を正しく反映することを検証してください。

サービスアカウント PAT ですべてのユーザーの MCP 呼び出しを代行する方式は、本番では避けます。その場合、取得結果はユーザー本人ではなくサービスアカウントの権限になります。

### Tool 選択

本番では `TABLEAU_MCP_ALLOWED_TOOLS` で明示的に tool を allowlist 化してください。未指定時のPoC実装では、メタデータ系と推測できる tool を少数だけ試し、必要引数を安全に推測できない tool はスキップします。

TODO:

- workbook、dashboard、datasource、metadata 取得に使う正式な MCP tool を決める
- スクリーンショット取得とマルチモーダルプロンプトを追加する
- credential や data payload を出さない範囲で tool 実行監査ログを追加する
- MCP 依存を含めた Lambda サイズとコールドスタートを評価する
