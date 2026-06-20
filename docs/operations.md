# 運用

## デモ当日の利用手順

1. `GET /health` が 200 を返すことを確認します。
2. 対象の Tableau ダッシュボードを開きます。
3. `AUTH_REQUIRED=true` の場合は Cognito でサインインします。
4. Tableau Extension の画面が表示されることを確認します。
5. 回答を生成したい対象のダッシュボード文脈が入っているかを確認します。
6. 必要に応じて Notion 接続を先に済ませます。

## チャット実行手順

1. 質問を入力します。
2. 送信後、ジョブが `queued` になります。
3. その後、進捗が `planning`、`running_mcp_tools`、`generating_answer` の順で進みます。
4. 回答が返ったら内容を確認します。
5. 必要なら同じセッションで追加の質問を続けます。

補足:

- ローカル確認では `VITE_USE_MOCK_TABLEAU=true` と `TABLEAU_CONTEXT_PROVIDER=mock` が扱いやすいです。
- `MODEL_PROVIDER=bedrock` の場合は Bedrock で回答が生成されます。

## Notion投稿の流れ

1. チャット画面の外部アクションメニューから Notion 接続を開始します。
2. ポップアップで認可を完了します。
3. 接続後、画面に Notion の接続状態が表示されます。
4. 回答生成後に Notion 下書きが出たら、内容を確認します。
5. `Notion に登録` を押すと保存されます。
6. 保存後は Notion ページのリンクを開いて内容を確認します。

補足:

- `NOTION_MCP_ENABLED=true` で Notion 連携ルートが有効になります。
- `NOTION_DEFAULT_TARGET_PARENT_PAGE_ID` または `NOTION_DEFAULT_TARGET_DATABASE_ID` が未設定だと、保存先が決まらない場合があります。

## 失敗時の確認ポイント

- `GET /health` が 200 で返るか
- `VITE_API_BASE_URL` が正しいか
- Tableau Extension から API に到達できるか
- `AUTH_REQUIRED=true` の場合に Cognito の設定が揃っているか
- `TABLEAU_CONTEXT_PROVIDER` が意図した値になっているか
- `TABLEAU_SERVER_URL` と `TABLEAU_SITE_CONTENT_URL` が正しいか
- `MODEL_PROVIDER=bedrock` の場合に Bedrock 権限があるか
- `NOTION_MCP_ENABLED=true` の場合に Notion の接続状態が `connected` か
- popup がブラウザ側でブロックされていないか

## 典型的なトラブルシュート

### 1. Tableau 文脈を取得できない

- `VITE_USE_MOCK_TABLEAU=true` でローカル確認しているかを確認します。
- Tableau Extension を Tableau 上で開いているかを確認します。
- `Tableau Extensions API` が初期化できているかを確認します。

### 2. 認証エラーになる

- `AUTH_REQUIRED=true` なら Cognito の値が揃っているかを確認します。
- `COGNITO_POPUP_REDIRECT_URI` と `VITE_COGNITO_REDIRECT_URI` が一致しているかを確認します。
- JWT の audience と issuer が正しいかを確認します。

### 3. 回答が返らない

- `MODEL_PROVIDER` が `mock` か `bedrock` かを確認します。
- backend ログで `chat.request.failed` や `chat.job.request.rejected` を確認します。
- `TABLEAU_MCP_ALLOWED_TOOLS` が狭すぎないかを確認します。

### 4. Notion に保存できない

- Notion が接続済みかを確認します。
- `NOTION_MCP_ENABLED=true` かを確認します。
- `NOTION_DEFAULT_TARGET_PARENT_PAGE_ID` または `NOTION_DEFAULT_TARGET_DATABASE_ID` が設定されているかを確認します。
- `Notion に登録` の前に保存確認カードが表示されているかを確認します。

### 5. このリポジトリで未実装の機能を探している

- Slack 投稿は未実装です。
- Bluesky 投稿は未実装です。
- Google Calendar 連携は未実装です。
- 画像アップロードは未実装です。
- 画像解析は未実装です。

