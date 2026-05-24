# Security Notes / セキュリティメモ

## English

### Secrets

- Do not put `TABLEAU_CONNECTED_APP_SECRET_VALUE` in frontend code, Vite env files, or the `.trex` manifest.
- Generate Connected Apps JWTs only in the backend.
- Do not log JWTs or Connected App secret values.
- Store production secrets in AWS Secrets Manager or SSM Parameter Store, not plain Lambda environment variables when stronger operational controls are required.

### User Identity

This PoC uses `TABLEAU_DEFAULT_SUBJECT` as the Tableau JWT `sub`. For multi-user production use, introduce an application identity layer such as Cognito and map each authenticated app user to an allowed Tableau user subject.

Do not trust a browser-provided Tableau username as the JWT subject without server-side authorization.

When `AUTH_REQUIRED=true`, the backend verifies the Cognito JWT and derives the Tableau subject from the verified Cognito `email` claim. The frontend must not send `userEmail`, Tableau username, roles, or permissions as trusted authorization input. Browser-provided identity values can be forged, replayed, or modified by the user, so they are useful only for display hints.

For this PoC, Cognito `email` is treated as the Tableau Cloud username. This only works when the Cognito email exactly matches a valid Tableau Cloud username, usually the Tableau user's email address. Production deployments should use federated IdP configuration or an explicit user mapping table so renamed users, multiple Tableau sites, and account lifecycle events are handled safely.

Avoid using a service-account PAT to execute MCP or Tableau API calls on behalf of all users in production. A service account sees data according to the service account's Tableau permissions, not the current user's permissions. If a service account is used temporarily in a PoC, document the difference clearly and restrict the account to the smallest possible Tableau permissions.

To preserve user permission boundaries, prefer Connected Apps Direct Trust JWT, OAuth, or an MCP authentication model that can execute as the verified Tableau subject. The backend must decide the Tableau subject from verified Cognito claims or a server-side mapping, never from frontend-provided claims.

### CORS

Local development can use permissive CORS. Deployed API Gateway should restrict `Access-Control-Allow-Origin` to the approved frontend / Tableau extension host.

### Dashboard Context

The frontend-provided `dashboardContext` is useful but not authoritative. Treat it as user-provided input:

- Validate shape and required fields.
- Avoid using it to authorize Tableau API access.
- Prefer backend Tableau REST / Metadata API calls for trusted enrichment.

### LLM Data Minimization

When replacing the mock answer generator with OpenAI, Bedrock, or another LLM provider:

- Send only the minimum dashboard metadata needed to answer the question.
- Avoid row-level data unless explicitly approved and governed.
- Do not send personal data, secrets, credentials, raw extracts, or confidential business data by default.
- Consider redaction, allowlisted fields, and audit logging before enabling selected mark or underlying data analysis.
- Keep MCP / Tableau API enrichment scoped to metadata needed for the user's question, such as workbook, worksheet, datasource, field, filter, and parameter names. Avoid sending full data rows to an LLM unless a reviewed governance policy allows it.

## 日本語

### Secrets

- `TABLEAU_CONNECTED_APP_SECRET_VALUE` をフロントエンドコード、Vite env ファイル、`.trex` manifest に置かないでください。
- Connected Apps JWT はバックエンドでのみ生成してください。
- JWT や Connected App Secret Value をログ出力しないでください。
- 本番Secretは、より強い運用管理が必要な場合、単なる Lambda 環境変数ではなく AWS Secrets Manager または SSM Parameter Store に保存してください。

### ユーザーID

この PoC では Tableau JWT の `sub` として `TABLEAU_DEFAULT_SUBJECT` を使います。複数ユーザーに対応する本番環境では、Cognito などのアプリケーション認証レイヤーを導入し、認証済みアプリユーザーを許可された Tableau user subject に対応付けてください。

ブラウザから送られてきた Tableau ユーザー名を、サーバー側の認可なしに JWT subject として信頼しないでください。

`AUTH_REQUIRED=true` の場合、バックエンドは Cognito JWT を検証し、検証済み Cognito `email` claim から Tableau subject を決定します。フロントエンドが送る `userEmail`、Tableau ユーザー名、role、permission は認可判断に使ってはいけません。ブラウザから送られたID情報はユーザーが改変できるため、表示上のヒント以上に扱わないでください。

この PoC では Cognito の `email` を Tableau Cloud username として扱います。これは Cognito email が Tableau Cloud の username、通常はメールアドレス、と完全一致する場合だけ成立します。本番では、IdP 連携またはユーザーマッピングテーブルを導入し、ユーザー名変更、複数 Tableau site、アカウントライフサイクルを安全に扱えるようにしてください。

本番で、全ユーザーの代わりにサービスアカウント PAT で MCP や Tableau API を実行する方式は避けてください。サービスアカウントで取得できる情報はサービスアカウントの Tableau 権限に依存し、現在のユーザー本人の権限とは一致しません。PoC で一時的に使う場合でも、その違いを明記し、サービスアカウントの Tableau 権限を最小化してください。

ユーザーの権限境界を保つには、Connected Apps Direct Trust JWT、OAuth、または検証済み Tableau subject として実行できる MCP 認証方式を優先してください。Tableau subject は、フロントエンド申告値ではなく、検証済み Cognito claim またはサーバー側マッピングから決定します。

### CORS

ローカル開発では緩い CORS を使えます。本番の API Gateway では `Access-Control-Allow-Origin` を承認済みのフロントエンド / Tableau Extension ホストに制限してください。

### Dashboard Context

フロントエンドから送られる `dashboardContext` は便利ですが、信頼できる情報源ではありません。ユーザー入力として扱ってください。

- 形状と必須フィールドを検証する。
- Tableau API アクセスの認可判断には使わない。
- 信頼できる補足情報は、バックエンドから Tableau REST / Metadata API を呼び出して取得する。

### LLM へ送るデータの最小化

モック回答生成を OpenAI、Bedrock、その他LLMに差し替える場合:

- 質問に答えるために必要な最小限のダッシュボードメタデータだけを送る。
- 明示的な承認とガバナンスがない限り、行レベルデータを送らない。
- 個人情報、Secret、認証情報、生データ抽出、機密性の高い業務データを既定では送らない。
- 選択マークや underlying data 分析を有効化する前に、マスキング、許可フィールド、監査ログを検討する。
- MCP / Tableau API から補足取得する情報は、質問回答に必要な workbook、worksheet、datasource、field、filter、parameter 名などのメタデータに絞る。レビュー済みのガバナンスポリシーがない限り、行データ全体を LLM に送らない。
