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

## 日本語

### Secrets

- `TABLEAU_CONNECTED_APP_SECRET_VALUE` をフロントエンドコード、Vite env ファイル、`.trex` manifest に置かないでください。
- Connected Apps JWT はバックエンドでのみ生成してください。
- JWT や Connected App Secret Value をログ出力しないでください。
- 本番Secretは、より強い運用管理が必要な場合、単なる Lambda 環境変数ではなく AWS Secrets Manager または SSM Parameter Store に保存してください。

### ユーザーID

この PoC では Tableau JWT の `sub` として `TABLEAU_DEFAULT_SUBJECT` を使います。複数ユーザーに対応する本番環境では、Cognito などのアプリケーション認証レイヤーを導入し、認証済みアプリユーザーを許可された Tableau user subject に対応付けてください。

ブラウザから送られてきた Tableau ユーザー名を、サーバー側の認可なしに JWT subject として信頼しないでください。

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

