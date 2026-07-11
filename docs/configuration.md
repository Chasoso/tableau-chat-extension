# 設定

## 使い分けの基本

- ローカル開発では、まず `mock` 系の設定で起動します。
- デモ環境では、必要な範囲だけ `direct-api` または `mcp` を有効にします。
- 本番では、`AUTH_REQUIRED=true` と `CORS_ALLOWED_ORIGIN` の制限を前提にします。

## フロントエンド環境変数

| 変数                        | 必須         | 意味                                                                                           |
| --------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`         | 任意         | バックエンド API の base URL。ローカルは `http://localhost:3001`、CloudFront 配下は通常 `/api` |
| `VITE_USE_MOCK_TABLEAU`     | 任意         | `true` で Tableau Extensions API の代わりにモック文脈を使う                                    |
| `VITE_AUTH_REQUIRED`        | 任意         | `true` でフロントエンドの認証 UI を有効化                                                      |
| `VITE_COGNITO_USER_POOL_ID` | 認証時に必要 | Cognito User Pool ID                                                                           |
| `VITE_COGNITO_CLIENT_ID`    | 認証時に必要 | Cognito App Client ID                                                                          |
| `VITE_COGNITO_REGION`       | 認証時に必要 | Cognito リージョン                                                                             |
| `VITE_COGNITO_DOMAIN`       | 認証時に必要 | Cognito Hosted UI ドメイン                                                                     |
| `VITE_COGNITO_REDIRECT_URI` | 任意         | フルページ遷移用 callback URL                                                                  |
| `VITE_COGNITO_LOGOUT_URI`   | 任意         | ログアウト後の戻り先                                                                           |

## バックエンド共通

| 変数                               | 必須         | 意味                                                          |
| ---------------------------------- | ------------ | ------------------------------------------------------------- |
| `PORT`                             | ローカルのみ | `backend/src/localServer.ts` の待受ポート                     |
| `USE_IN_MEMORY_REPOSITORY`         | 任意         | `false` 以外ならメモリリポジトリを使う                        |
| `CHAT_HISTORY_TABLE_NAME`          | 本番/永続化  | 会話履歴の DynamoDB テーブル名                                |
| `CHAT_JOBS_TABLE_NAME`             | 本番/永続化  | 非同期ジョブの DynamoDB テーブル名                            |
| `CHAT_JOB_WORKER_FUNCTION_NAME`    | 本番/永続化  | 非同期 worker Lambda 名                                       |
| `CHAT_JOB_TTL_SECONDS`             | 任意         | ジョブ TTL。既定 86400                                        |
| `CHAT_JOB_LEASE_SECONDS`           | 任意         | worker lease 秒数。既定 120                                   |
| `CHAT_JOB_PROGRESS_MESSAGE_LIMIT`  | 任意         | ジョブ進捗メッセージの保持件数。既定 12                       |
| `CHAT_JOB_OWNER_TOKEN_HEADER_NAME` | 任意         | 匿名利用時の所有者トークンヘッダ名。既定 `x-chat-owner-token` |
| `CHAT_MEMORY_MESSAGE_LIMIT`        | 任意         | 同一セッションの会話履歴保持件数。既定 10                     |
| `CORS_ALLOWED_ORIGIN`              | 本番         | API の許可 origin                                             |

## 認証

| 変数                                   | 必須                 | 意味                                      |
| -------------------------------------- | -------------------- | ----------------------------------------- |
| `AUTH_REQUIRED`                        | 任意                 | `true` で Cognito JWT 検証を有効化        |
| `COGNITO_USER_POOL_ID`                 | `AUTH_REQUIRED=true` | Cognito User Pool ID                      |
| `COGNITO_CLIENT_ID`                    | `AUTH_REQUIRED=true` | Cognito App Client ID                     |
| `COGNITO_REGION`                       | `AUTH_REQUIRED=true` | Cognito リージョン                        |
| `COGNITO_DOMAIN`                       | `AUTH_REQUIRED=true` | Cognito Hosted UI ドメイン                |
| `COGNITO_POPUP_REDIRECT_URI`           | `AUTH_REQUIRED=true` | popup auth callback URL                   |
| `COGNITO_AUTH_TRANSACTIONS_TABLE`      | `AUTH_REQUIRED=true` | popup auth transaction table              |
| `COGNITO_AUTH_TRANSACTION_KEY_PARAM`   | 任意                 | popup auth 用 AES key の SSM parameter 名 |
| `COGNITO_AUTH_TRANSACTION_TTL_SECONDS` | 任意                 | popup auth transaction TTL。既定 600      |

## Tableau

| 変数                       | 必須 | 意味                                                           |
| -------------------------- | ---- | -------------------------------------------------------------- |
| `TABLEAU_SERVER_URL`       | 必須 | Tableau Server / Cloud の URL                                  |
| `TABLEAU_SITE_CONTENT_URL` | 必須 | Tableau site content URL                                       |
| `TABLEAU_API_VERSION`      | 任意 | REST API version。既定 `3.25`                                  |
| `TABLEAU_DEFAULT_SUBJECT`  | 必須 | Connected App で使う Tableau subject の既定値                  |
| `TABLEAU_SCOPES`           | 任意 | Connected App scopes。既定 `tableau:content:read`              |
| `TABLEAU_CONTEXT_PROVIDER` | 任意 | `mock` / `direct-api` / `mcp`。`direct` は `direct-api` と同義 |

### Tableau MCP

| 変数                                    | 必須 | 意味                                          |
| --------------------------------------- | ---- | --------------------------------------------- |
| `TABLEAU_MCP_SERVER_URL`                | 任意 | HTTP transport のときの MCP server URL        |
| `TABLEAU_MCP_TRANSPORT`                 | 任意 | 既定 `stdio`                                  |
| `TABLEAU_MCP_AUTH_MODE`                 | 任意 | 既定 `direct-trust`                           |
| `TABLEAU_MCP_TIMEOUT_MS`                | 任意 | MCP 呼び出し timeout。既定 5000               |
| `TABLEAU_MCP_COMMAND`                   | 任意 | stdio 起動コマンドの上書き                    |
| `TABLEAU_MCP_ARGS`                      | 任意 | stdio 起動引数の上書き                        |
| `TABLEAU_MCP_ALLOWED_TOOLS`             | 任意 | 実行許可する MCP tool の CSV                  |
| `TABLEAU_MCP_MAX_TOOL_CALLS`            | 任意 | 1リクエストあたりの最大 tool 呼び出し数       |
| `TABLEAU_MCP_DEBUG_LOG_RESULTS`         | 任意 | MCP 結果のデバッグログを出すかどうか          |
| `TABLEAU_MCP_TOOL_PLANNING_ENABLED`     | 任意 | Bedrock ベースの tool planning を使うかどうか |
| `TABLEAU_MCP_PLANNER_MAX_OUTPUT_TOKENS` | 任意 | planner の最大出力 token 数                   |
| `TABLEAU_MCP_INTENT_TOOL_FILTER_MODE`   | 任意 | `strict` / `soft` / `off`                     |
| `TABLEAU_MCP_INTENT_CLASSIFIER_MODE`    | 任意 | `heuristic` / `hybrid`                        |
| `TABLEAU_MCP_ARG_SANITIZE_MODE`         | 任意 | `drop` / `mask`                               |
| `TABLEAU_MCP_ARG_MAX_DEPTH`             | 任意 | planner 引数の最大深さ                        |
| `TABLEAU_MCP_ARG_MAX_ARRAY`             | 任意 | planner 引数の最大配列長                      |
| `TABLEAU_MCP_ARG_MAX_OBJECT_KEYS`       | 任意 | planner 引数の最大 object key 数              |
| `TABLEAU_MCP_METADATA_CACHE_ENABLED`    | 任意 | metadata cache の有効化                       |
| `TABLEAU_MCP_METADATA_CACHE_TTL_MS`     | 任意 | metadata cache の TTL                         |
| `TABLEAU_MCP_METADATA_CACHE_TABLE_NAME` | 任意 | DynamoDB ベースの metadata cache table 名     |
| `TABLEAU_MCP_QUERY_MAX_LIMIT`           | 任意 | `query-datasource` の上限 limit               |
| `TABLEAU_MCP_QUERY_MAX_FIELDS`          | 任意 | `query-datasource` の上限 field 数            |

### Hosted Tableau MCP

Hosted Tableau MCP settings are usually supplied by GitHub Actions Variables / Secrets in deployed environments rather than `.env`.

| 変数                                      | 必須                              | 意味                                                          |
| ----------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `TABLEAU_MCP_HOSTED_ENABLED`              | 任意                              | GitHub Actions Variables で管理する hosted execution の有効化 |
| `TABLEAU_MCP_HOSTED_ENDPOINT`             | 任意                              | GitHub Actions Variables で管理する Hosted MCP server URL     |
| `TABLEAU_MCP_HOSTED_TIMEOUT_MS`           | 任意                              | Hosted execution の timeout                                   |
| `TABLEAU_MCP_HOSTED_SITE_ID`              | `TABLEAU_MCP_HOSTED_ENABLED=true` | Hosted execution 用 Tableau site ID                           |
| `TABLEAU_MCP_HOSTED_SITE_CONTENT_URL`     | `TABLEAU_MCP_HOSTED_ENABLED=true` | Hosted execution 用 site content URL                          |
| `TABLEAU_MCP_HOSTED_TEST_DATASOURCE_ID`   | 任意                              | opt-in hosted integration test で使う datasource ID           |
| `TABLEAU_MCP_HOSTED_TEST_DATASOURCE_NAME` | 任意                              | opt-in hosted integration test で使う datasource name         |
| `TABLEAU_MCP_HOSTED_INTEGRATION_TESTS`    | 任意                              | opt-in hosted integration test switch                         |

Hosted execution を有効にする場合は `TABLEAU_MCP_HOSTED_ENDPOINT` が必要ですが、`TABLEAU_MCP_HOSTED_SITE_ID` と `TABLEAU_MCP_HOSTED_SITE_CONTENT_URL` は任意です。

## 生成AI / Bedrock

| 変数                                   | 必須                     | 意味                                           |
| -------------------------------------- | ------------------------ | ---------------------------------------------- |
| `MODEL_PROVIDER`                       | 任意                     | `mock` または `bedrock`                        |
| `BEDROCK_REGION`                       | `MODEL_PROVIDER=bedrock` | Bedrock region。既定 `us-east-1`               |
| `BEDROCK_MODEL_ID`                     | `MODEL_PROVIDER=bedrock` | Bedrock model ID または inference profile ID   |
| `BEDROCK_FOUNDATION_MODEL_ID`          | `MODEL_PROVIDER=bedrock` | inference profile の基盤 model ID              |
| `BEDROCK_MAX_OUTPUT_TOKENS`            | 任意                     | 最大出力 token 数                              |
| `BEDROCK_TEMPERATURE`                  | 任意                     | 生成 temperature                               |
| `BEDROCK_DEBUG_LOG_PROMPT_EXCHANGE`    | 任意                     | prompt / response のデバッグログを出すかどうか |
| `BEDROCK_DEBUG_MAX_CHARS`              | 任意                     | デバッグログに出す最大文字数                   |
| `CHAT_AGENT_ENABLED`                   | 任意                     | 軽量エージェントループの有効化                 |
| `CHAT_AGENT_MAX_CONTEXT_PASSES`        | 任意                     | 追加文脈取得の上限回数                         |
| `CHAT_AGENT_PLAN_MAX_OUTPUT_TOKENS`    | 任意                     | agent plan の最大出力 token 数                 |
| `CHAT_AGENT_EVAL_MAX_OUTPUT_TOKENS`    | 任意                     | agent evaluation の最大出力 token 数           |
| `CHAT_AGENT_DEBUG_LOG_PROMPT_EXCHANGE` | 任意                     | agent prompt / response のデバッグログ         |
| `CHAT_AGENT_DEBUG_MAX_CHARS`           | 任意                     | agent debug log の最大文字数                   |

## Notion

| 変数                                   | 必須                      | 意味                                                   |
| -------------------------------------- | ------------------------- | ------------------------------------------------------ |
| `NOTION_MCP_ENABLED`                   | 任意                      | Notion 連携ルートの有効化                              |
| `NOTION_MCP_URL`                       | 任意                      | Notion MCP endpoint。既定 `https://mcp.notion.com/mcp` |
| `NOTION_REDIRECT_URI`                  | `NOTION_MCP_ENABLED=true` | Notion OAuth callback URL                              |
| `NOTION_CONNECTIONS_TABLE`             | `NOTION_MCP_ENABLED=true` | Notion connection 保存先 DynamoDB table                |
| `NOTION_OAUTH_STATES_TABLE`            | `NOTION_MCP_ENABLED=true` | OAuth state 保存先 DynamoDB table                      |
| `NOTION_TOKEN_ENCRYPTION_KEY_PARAM`    | `NOTION_MCP_ENABLED=true` | Notion token AES key の SSM parameter 名               |
| `NOTION_MCP_ALLOWED_TOOLS`             | 任意                      | 許可する Notion MCP tool の CSV                        |
| `NOTION_DEFAULT_TARGET_PARENT_PAGE_ID` | 任意                      | 保存先の既定 parent page                               |
| `NOTION_DEFAULT_TARGET_DATABASE_ID`    | 任意                      | 保存先の既定 database / data source                    |
| `NOTION_LOCAL_DEV_USER_ID`             | 任意                      | auth 無効時のローカルユーザー ID                       |
| `NOTION_OAUTH_CLIENT_ID`               | 任意                      | DCR が使えない場合の fallback client ID                |
| `NOTION_OAUTH_CLIENT_SECRET`           | 任意                      | DCR が使えない場合の fallback client secret            |
| `NOTION_OAUTH_AUTHORIZE_URL`           | 任意                      | authorize endpoint override                            |
| `NOTION_OAUTH_TOKEN_URL`               | 任意                      | token endpoint override                                |
| `NOTION_OAUTH_STATE_TTL_SECONDS`       | 任意                      | OAuth state TTL。既定 600                              |

## 環境別のおすすめ設定

### ローカル開発

- `VITE_USE_MOCK_TABLEAU=true`
- `VITE_API_BASE_URL=http://localhost:3001`
- `TABLEAU_CONTEXT_PROVIDER=mock`
- `MODEL_PROVIDER=mock`
- `AUTH_REQUIRED=false`
- `NOTION_MCP_ENABLED=false`

### デモ

- `VITE_USE_MOCK_TABLEAU=false`
- `TABLEAU_CONTEXT_PROVIDER=mcp` または `direct-api`
- `MODEL_PROVIDER=bedrock` または `mock`
- `AUTH_REQUIRED=true` を使う場合は Cognito を先に用意する

### 本番

- `CORS_ALLOWED_ORIGIN` を公開フロントエンドの origin に限定する
- `TABLEAU_MCP_ALLOWED_TOOLS` を明示する
- `TABLEAU_MCP_DEBUG_LOG_RESULTS=false`
- `BEDROCK_DEBUG_LOG_PROMPT_EXCHANGE=false`
- `CHAT_AGENT_DEBUG_LOG_PROMPT_EXCHANGE=false`
- `TABLEAU_MCP_TOOL_PLANNING_ENABLED` は必要時のみ有効化する
