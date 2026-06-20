# tableau-chat-extension

Tableau ダッシュボードの文脈を読み取り、分析質問への回答や投稿案の下書きを生成するチャット拡張です。  
React ベースのフロントエンド、Lambda ベースのバックエンド、Tableau 連携、Cognito 認証、Bedrock による生成、Notion への保存をまとめて扱います。

## 何をするアプリか

- Tableau Dashboard Extension として動作します。
- Tableau Extensions API からダッシュボード文脈を取得します。
- 必要に応じて Tableau の REST API / Metadata API / Tableau MCP から追加文脈を取得します。
- 生成結果をチャットで返し、必要なら Notion に投稿案や分析メモを保存します。
- 認証は任意で、Cognito を有効にするとバックエンドで JWT を検証します。

## 主な機能

- ダッシュボード文脈の取得と表示
- 非同期チャットジョブの作成とポーリング
- Tableau 文脈取得の切り替え
  - `mock`
  - `direct-api`
  - `mcp`
- 回答生成の切り替え
  - `mock`
  - `bedrock`
- Cognito によるサインイン
- Notion への接続と下書き保存
- CloudFront + S3 によるフロントエンド配信
- Lambda / API Gateway / DynamoDB によるバックエンド実行

## 現在の実装で確認できる範囲

- Tableau
- Cognito
- Amazon Bedrock
- AWS S3
- AWS CloudFront
- AWS Lambda
- AWS API Gateway
- AWS DynamoDB
- Notion

以下は現在のコードベースでは確認できません。

- Slack 連携
- Bluesky 連携
- Google Calendar 連携
- 画像アップロード
- 画像解析

## 技術構成

- フロントエンド: React + Vite
- バックエンド: Node.js + TypeScript + Lambda
- 認証: Cognito
- Tableau 連携: Extensions API / REST API / Metadata API / Tableau MCP
- 生成AI: Amazon Bedrock または mock
- 外部保存: Notion
- AWS: API Gateway / Lambda / DynamoDB / S3 / CloudFront / SSM / CloudWatch

## ローカル実行方法

### 1. 依存関係のインストール

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

### 2. フロントエンド起動

```bash
cd frontend
npm run dev
```

デフォルトでは `http://127.0.0.1:5173` で起動します。

### 3. バックエンド起動

```bash
cd backend
npm run dev
```

デフォルトでは `http://localhost:3001` で起動します。

### 4. Tableau 外での確認

Tableau 外で画面を確認する場合は、モック文脈を使います。

```bash
VITE_USE_MOCK_TABLEAU=true
VITE_API_BASE_URL=http://localhost:3001
TABLEAU_CONTEXT_PROVIDER=mock
MODEL_PROVIDER=mock
```

認証を使わないローカル確認では、`AUTH_REQUIRED=false` のままで問題ありません。

### 5. 動作確認

```bash
curl http://localhost:3001/health
```

チャット API を直接叩く場合は `POST /chat-jobs` を使います。  
フロントエンドからは Tableau Extension として利用する想定です。

### 6. Tableau Extension の確認

- `frontend/public/tableau-chat-extension.trex` を Tableau の拡張機能として読み込みます。
- ローカル確認では `source-location` が `http://localhost:5173/` を指します。
- デプロイ時は `EXTENSION_SOURCE_URL` によりビルド済み `.trex` の URL が書き換わります。

## 必要な環境変数

詳細は [docs/configuration.md](docs/configuration.md) を参照してください。  
README では、まず押さえるべき項目だけをまとめます。

- フロントエンド
  - `VITE_API_BASE_URL`
  - `VITE_USE_MOCK_TABLEAU`
  - `VITE_AUTH_REQUIRED`
  - Cognito を使う場合の `VITE_COGNITO_*`
- バックエンド
  - `TABLEAU_SERVER_URL`
  - `TABLEAU_SITE_CONTENT_URL`
  - `TABLEAU_CONTEXT_PROVIDER`
  - `MODEL_PROVIDER`
  - `AUTH_REQUIRED`
  - Cognito を使う場合の `COGNITO_*`
  - Notion を使う場合の `NOTION_*`
- ローカルのみ
  - `PORT`
  - `USE_IN_MEMORY_REPOSITORY`

## デプロイ概要

詳細は [docs/deployment.md](docs/deployment.md) に分離しています。  
要点は次の通りです。

- GitHub Actions の `push` to `main` で AWS へデプロイします。
- バックエンドは Lambda 用に bundle / zip 化します。
- フロントエンドは build して S3 にアップロードします。
- CloudFront は S3 と API Gateway を背後に持ちます。
- `.trex` の `source-location` は `EXTENSION_SOURCE_URL` で差し替えます。

## ディレクトリ構成

```text
frontend/   React フロントエンド
backend/    API, Lambda, Tableau/Notion/認証ロジック
infra/      CloudFormation
docs/       役割別ドキュメント
.github/    CI/CD workflow
```

## 関連ドキュメント

- [docs/architecture.md](docs/architecture.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/configuration.md](docs/configuration.md)
- [docs/operations.md](docs/operations.md)

