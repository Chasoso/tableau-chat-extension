# v0.2.0 Architecture Reset

## 1. 現在の構成の要約

現行の `tableau-chat-extension` は、Tableau Dashboard Extension から取得したダッシュボード文脈を起点に、バックエンドで Tableau 追加文脈の収集、質問解釈、Bedrock 生成、Notion 保存までを一気通貫で扱う PoC になっている。

主要な流れは次の通り。

1. Frontend が Tableau Extensions API から `DashboardContext` を収集する。
2. Frontend は `POST /chat-jobs` で質問を backend に渡し、非同期ジョブとして処理する。
3. `chatHandler` が API 入口となり、`ChatJobService` もしくは `ChatService` に分岐する。
4. `ChatService` が会話履歴を読み、`runLightweightAgentLoop` を実行し、必要なら Tableau MCP または Direct API で追加文脈を集める。
5. `answerGenerator` が Bedrock または deterministic fallback で回答を生成する。
6. 回答後に Notion 下書きの生成・保存や `dashboardContextPatch` の返却を行う。

この構成は PoC としては機能しているが、現在は「質問処理」「文脈収集」「MCP 制御」「LLM 呼び出し」「回答整形」「Notion 連携」「trace 相当のログ」が `ChatService` と `TableauMcpContextProvider` にかなり密結合している。

参考ファイル:

- [backend/src/handlers/chatHandler.ts](../backend/src/handlers/chatHandler.ts)
- [backend/src/services/chatService.ts](../backend/src/services/chatService.ts)
- [backend/src/services/chatAgent.ts](../backend/src/services/chatAgent.ts)
- [backend/src/tableau/tableauMcpContextProvider.ts](../backend/src/tableau/tableauMcpContextProvider.ts)
- [frontend/src/components/ChatPanel.tsx](../frontend/src/components/ChatPanel.tsx)
- [frontend/src/tableau/tableauExtension.ts](../frontend/src/tableau/tableauExtension.ts)

### 現在の入口

- ユーザー質問の主要入口は `frontend/src/components/ChatPanel.tsx` の `handleSend` から `createChatJob()` へ流れる `POST /chat-jobs`。
- `frontend/src/api/chatApi.ts` は `/chat` と `/chat-jobs` の両方を持つが、実運用上の主経路は `/chat-jobs`。
- backend では `backend/src/handlers/chatHandler.ts` が `/chat`、`/context`、`/chat-jobs`、`/notion/*`、`/auth/cognito/*` をまとめて受ける。
- ローカル起動では `backend/src/localServer.ts` が `chatHandler` と `healthHandler` を HTTP サーバーに束ねる。

### Bedrock / MCP / Notion の呼び出し箇所

- Bedrock
  - `backend/src/services/chatAgent.ts`
  - `backend/src/services/answerGenerator.ts`
  - `backend/src/services/tableauMcpToolPlanner.ts`
- Tableau MCP
  - `backend/src/tableau/tableauMcpContextProvider.ts`
- Tableau REST / Metadata API
  - `backend/src/tableau/directTableauApiContextProvider.ts`
  - `backend/src/tableau/tableauRestClient.ts`
  - `backend/src/tableau/tableauMetadataClient.ts`
- Notion
  - `backend/src/notion/notionOAuthService.ts`
  - `backend/src/notion/notionMcpClient.ts`
  - `backend/src/notion/notionService.ts`

## 2. 現在の問題点

### 2.1 LLM が中心に寄りすぎている

現行実装は、質問の入口から最終回答までの間に、少なくとも以下の LLM 介在点がある。

- `BedrockChatAgent.createPlan()`
- `BedrockChatAgent.evaluateContext()` の複数パス
- `TableauMcpToolPlanner.plan()` が有効な場合の tool planning
- `BedrockAnswerGenerator.generate()`

その結果、LLM が「判断・再計画・回答生成」を兼任しやすく、Context / Intent / Plan / Tool / Trace の境界が曖昧になっている。

### 2.2 再試行と再計画の責務が散っている

- `runLightweightAgentLoop()` にフォローアップ質問、評価、再取得、再計画のロジックが混在している。
- `TableauMcpContextProvider` 内でも tool selection、precondition、replan、fallback、cache が混ざっている。
- `ChatService` も fast path、metadata path、deadline fallback、LLM path をすべて抱えている。

### 2.3 Context と Tool 実行が一体化している

現在の `TableauAdditionalContext` は便利だが、以下が同居している。

- Frontend 由来の dashboard state
- 追加取得した workbook / datasource / metadata
- MCP tools の定義と実行結果
- 評価用の observation
- 実行デバッグ

このため、Context Pack を中心にした設計へ移行する際に、そのままの型では「何が取得済みの事実で、何が実行途中の状態か」が分離しづらい。

### 2.4 trace が構造化されていない

現在の trace は主にログイベントと `ChatResponse.debug` / `ChatJobRecord.progressMessages` に散らばっている。
`agentRunId` を軸に、各ステップを構造化して追跡する仕組みはまだない。

### 2.5 既存コードの責務境界が広すぎる

特に `backend/src/services/chatService.ts` と `backend/src/tableau/tableauMcpContextProvider.ts` が肥大化しており、今後も継ぎ足しすると保守性が下がる。

## 3. 新アーキテクチャ案

v0.2.0 では、LLM 中心ではなく Tableau Context 中心に再設計する。

### 基本原則

- Tableau Context を主語にする。
- Intent ごとの固定 Plan を優先する。
- LLM は「補助的な解釈」「要約」「最終自然文生成」に限定する。
- MCP は必要なときだけ呼ぶ。
- すべての実行に `agentRunId` を付与する。
- Step ごとに trace を残す。
- 将来 `AgentCoreRunner` を差し替え可能な `AgentRunner` 抽象を置く。

### 提案する層

#### Frontend

- Tableau Extension UI
- Dashboard State Collector
- Mark Selection Listener
- AI Context Preview Panel
- Chat / Action UI

#### Backend API

- Auth / Session
- Job API
- Agent Run API

#### Agent Orchestrator

- Context Normalizer
- Intent Resolver
- Plan Builder
- Tool Router
- Execution Engine
- Response Composer
- Trace Logger

#### Tool Layer

- Extension Context 由来の情報
- Tableau MCP Tools
- Tableau REST / Metadata API Tools
- Notion Tools
- 将来の AgentCore Gateway 連携

### 推奨する実行モデル

1. Frontend が Dashboard state を収集し、`ContextPack` の入力を作る。
2. Backend は `agentRunId` を発行する。
3. `ContextNormalizer` が入力を正規化し、実行に必要な最小限の構造化 Context を作る。
4. `IntentResolver` が intent を判定する。
5. `PlanBuilder` が intent ごとの固定 plan を選ぶ。
6. `ToolRouter` が必要なときだけ MCP / REST / Metadata / Notion を呼ぶ。
7. `ExecutionEngine` が plan を実行し、`TraceLogger` に各ステップを送る。
8. `ResponseComposer` が回答をまとめ、必要なら Notion draft を作る。
9. `AgentRunner` は実装差し替え可能にし、v0.2 は `LambdaAgentRunner`、将来は `AgentCoreRunner` を追加する。

### 新しいデータ境界の考え方

- `ContextPack`
  - 画面状態、ダッシュボード状態、選択、フィルタ、パラメータ、選択マーク、取得済み追加文脈を含む。
- `Intent`
  - ユーザーの質問を Tableau 文脈で何として扱うか。
- `Plan`
  - intent ごとの固定手順と、必要なら LLM 補助で微調整する手順。
- `Tool`
  - 実行可能な外部呼び出し。
- `Trace`
  - 実行中に何が起きたかの記録。

## 4. 推奨ディレクトリ構成

以下は v0.2.0 の再編後のイメージ。

```text
backend/src/
  api/
    handlers/
    routes/
  auth/
  session/
  agent/
    orchestrator/
    runner/
    intent/
    plan/
    tool-router/
    execution/
    response/
    trace/
  context/
    pack/
    normalize/
    collectors/
  tools/
    tableau-extension/
    tableau-rest/
    tableau-mcp/
    notion/
  repositories/
  aws/
  logging/
  config/
  types/

frontend/src/
  tableau/
    collector/
    listeners/
    context-pack/
  ai-context-preview/
  chat/
  api/
  auth/
```

### 補足

- 既存の `backend/src/services/chatService.ts` は、最終的には orchestrator から薄い facade に縮退させる。
- `backend/src/tableau/tableauMcpContextProvider.ts` は、将来的には `tools/tableau-mcp` と `agent/tool-router` に分割する。
- `frontend/src/components/ChatPanel.tsx` は残してよいが、状態収集と API 呼び出しは段階的に分ける。

## 5. 既存コードの再利用方針

以下は再利用価値が高い。

### 再利用推奨

- Tableau Extension UI
  - [frontend/src/components/ChatPanel.tsx](../frontend/src/components/ChatPanel.tsx)
  - [frontend/src/tableau/tableauExtension.ts](../frontend/src/tableau/tableauExtension.ts)
  - [frontend/src/tableau/dashboardContext.ts](../frontend/src/tableau/dashboardContext.ts)
- 認証まわり
  - [backend/src/auth/cognitoAuth.ts](../backend/src/auth/cognitoAuth.ts)
  - [backend/src/auth/cognitoPopupAuthService.ts](../backend/src/auth/cognitoPopupAuthService.ts)
  - [frontend/src/auth/cognitoAuth.ts](../frontend/src/auth/cognitoAuth.ts)
- API / 基盤
  - `API Gateway`
  - `Lambda`
  - `DynamoDB`
  - `CloudFront`
  - `CloudFormation`
- Tableau 連携の低レベルクライアント
  - [backend/src/tableau/tableauRestClient.ts](../backend/src/tableau/tableauRestClient.ts)
  - [backend/src/tableau/tableauMetadataClient.ts](../backend/src/tableau/tableauMetadataClient.ts)
- Notion 連携
  - [backend/src/notion/notionOAuthService.ts](../backend/src/notion/notionOAuthService.ts)
  - [backend/src/notion/notionMcpClient.ts](../backend/src/notion/notionMcpClient.ts)
  - [backend/src/notion/notionService.ts](../backend/src/notion/notionService.ts)
- 型・テスト・運用資産
  - [backend/src/types/*](../backend/src/types/chat.ts)
  - [backend/test/*](../backend/test)
  - [README.md](../README.md)
  - [docs/deployment.md](../docs/deployment.md)
  - [docs/configuration.md](../docs/configuration.md)

### 再利用するが、境界は変える

- [backend/src/services/questionInterpretation.ts](../backend/src/services/questionInterpretation.ts)
  - intent の基礎素材として再利用するが、最終的には `IntentResolver` に移す。
- [backend/src/services/answerGenerator.ts](../backend/src/services/answerGenerator.ts)
  - Bedrock 呼び出しユーティリティとしては再利用可能だが、最終的な責務は `ResponseComposer` から切り離す。
- [backend/src/services/chatProgress.ts](../backend/src/services/chatProgress.ts)
  - job progress の仕組みとしては再利用可能だが、trace とは分ける。
- [backend/src/repositories/*](../backend/src/repositories/chatHistoryRepository.ts)
  - 永続化層として再利用する。

## 6. 破壊的に作り直すべき箇所

以下は小さく足すより、明確に作り直したほうがよい。

### 6.1 エージェントループ

- `runLightweightAgentLoop()` は v0.2 で廃止候補。
- 「LLM に聞いて評価し、足りなければ再度聞く」というループは、Intent ごとの固定 Plan に置き換える。

### 6.2 planner / tool 実行フロー

- `TableauMcpContextProvider` の大規模な tool selection / execution / recovery / caching は分割対象。
- `TableauMcpToolPlanner` の Bedrock prompt 依存も再設計対象。
- MCP 呼び出しは `ToolRouter` の責務に寄せる。

### 6.3 Bedrock とのやり取りの制御

- `BedrockChatAgent` と `BedrockAnswerGenerator` は、いまのままだと「計画用 LLM」「評価用 LLM」「回答用 LLM」に散る。
- v0.2 では `LLM Gateway` を薄い共通層としてまとめ、呼び出し回数と用途を固定化する。

### 6.4 MCP 呼び出しの判断ロジック

- 現在は `ChatService`、`ChatAgent`、`TableauMcpContextProvider` に判断ロジックが分散している。
- v0.2 では `IntentResolver` と `PlanBuilder` に集約する。

### 6.5 エラー処理

- 現在は各層で `warnings` や `fallbackReason` を個別に積んでいる。
- v0.2 では `TraceEvent` と `RunStatus` を中心に、エラーを構造化する。

### 6.6 実行ログ・trace 構造

- `ChatResponse.debug` と `ChatJobRecord.progressMessages` だけでは将来の trace 要件を満たしにくい。
- `agentRunId` / `stepId` / `traceEventType` を持つ共通 trace モデルが必要。

## 7. v0.2.0 で実装する最小スコープ

v0.2.0 の目標は「将来差し替え可能な骨格を作ること」であり、機能増強ではない。

### 必須

- `AgentOrchestrator` の設計と実装方針
- `Context / Intent / Plan / Tool / Trace` の型定義案
- 既存処理の分解単位の提案
- `AgentRunner` interface の設計案
- `LambdaAgentRunner` を既存構成からどう移行するかの方針
- 将来 `AgentCoreRunner` を追加できる抽象化方針
- すべての実行に `agentRunId` を付与
- trace を残せる共通フォーマット案

### 実装しない

- AgentCore 移植
- 音声入力
- 新規の高度なツール追加
- 既存 UI の大幅刷新
- 既存デプロイ方式の全面変更

### v0.2 の実行方針

1. 現行 API を壊さずに、内部の agent 処理を新しい境界へ寄せる。
2. まず `ContextPack` と `Trace` を導入する。
3. 次に `AgentRunner` で current flow を包む。
4. 最後に fixed plan へ移行する。

## 8. v0.3.0 以降に回すべきスコープ

v0.2 で無理に入れないほうがよいもの。

- AgentCoreRunner 実装
- AgentCore Gateway 連携
- 音声入力 / 音声応答
- 高度な streaming trace UI
- 複数 tool provider の動的レジストリ化
- Notebook/Canvas 的な長期ワークスペース
- Notion を含む action 層の細かなプラグイン化
- ルールベースを超える汎用エージェントループの再導入

## 9. 移行手順

### Phase 0: 現状凍結

- 既存の `/chat-jobs`、`/chat-jobs/{id}`、`/context`、Notion の基本フローを integration test で固定する。
- 既存出力の互換性を確認する。

### Phase 1: 型と trace の導入

- `ContextPack`、`Intent`、`Plan`、`ToolAction`、`TraceEvent` の型を追加する。
- `agentRunId` を request ごとに生成する。
- `ChatJobRecord` に `agentRunId` を紐づける方針を決める。

### Phase 2: Orchestrator の薄い導入

- `AgentRunner` interface を追加する。
- `LambdaAgentRunner` を作り、既存の `ChatService` を内部的に包む。
- まずは behavior を変えずに trace だけ収集する。

### Phase 3: 固定 Plan 化

- Intent ごとに `fixed plan` を定義する。
- ループ型の再計画をやめ、必要な tool set を事前に決める。
- MCP は「必要なときだけ」呼ぶように分岐を移す。

### Phase 4: 実行エンジン分離

- `ToolRouter` と `ExecutionEngine` を分離する。
- Tableau MCP / REST / Metadata / Notion を個別 tool として扱う。

### Phase 5: `ChatService` の縮退

- `ChatService` を API facade とし、orchestrator へ委譲する。
- 既存の fast path や fallback は必要最小限に残す。

## 10. リスクと注意点

- Tableau MCP の挙動を壊すと、データ分析系のデモ価値が一気に下がる。
- LLM 呼び出し回数を減らす際、回答品質が下がる可能性がある。
- Context を圧縮しすぎると、既存の便利な推論材料が失われる。
- `agentRunId` と trace を増やすと、個人情報やダッシュボード固有情報の取り扱い注意が増える。
- Notion OAuth と token refresh は既に複雑なので、agent 再設計と同時に深く触りすぎないほうがよい。
- 既存の `/chat` と `/chat-jobs` をどう扱うかで、Frontend の変更量が大きく変わる。
- `TableauContextProvider` の実装を壊すと、`direct-api` と `mcp` の両モードに影響する。

## 11. テスト方針

### 11.1 Unit

- `ContextNormalizer`
- `IntentResolver`
- `PlanBuilder`
- `ToolRouter`
- `TraceLogger`
- `AgentRunner` の各アダプタ

### 11.2 Contract

- `POST /chat-jobs`
- `GET /chat-jobs/{jobId}`
- `POST /context`
- Notion の connect / status / save

### 11.3 Integration

- Tableau Extension から `ContextPack` が組み上がること
- job 進行と trace の紐づきが維持されること
- Bedrock なしでも mock 経路で動くこと

### 11.4 回帰ガード

- LLM 呼び出し回数が想定以上に増えないこと
- MCP 呼び出しが intent 依存で過剰にならないこと
- 保存先 Notion の draft 生成が壊れないこと

## 12. 実装前に確認すべき未解決事項

1. v0.2 で主要入口は `/chat` ではなく `/chat-jobs` に統一するか。
2. `ContextPack` は frontend で完結させるか、backend でも正規化するか。
3. `agentRunId` を `ChatJobRecord` と完全に一致させるか、job 配下の子 ID にするか。
4. trace の永続先は DynamoDB、CloudWatch、S3 のどれを主にするか。
5. Notion は v0.2 では action 連携のまま残すか、tool layer に寄せるか。
6. `TableauContextProvider` の `mock / direct-api / mcp` 切り替えを残すか、v0.2 では新しい collector abstraction に寄せ始めるか。
7. `CHAT_AGENT_ENABLED` 相当のスイッチを残すか。
8. 失敗時の fallback を「回答生成の fallback」に限定するか、「tool plan fallback」も許容するか。
9. 固定 Plan の単位を intent ベースにするか、より細かい dashboard task ベースにするか。
10. 既存の `POST /context` を v0.2 でも残すか、context pack preview API に置き換えるか。

## 13. 既存コードの処理フロー詳細

### 13.1 Frontend

- `App` が auth 画面か通常画面かを切り替える。
- `initializeTableauExtension()` が Tableau Extensions API から `DashboardContext` を収集する。
- `ChatPanel` が `dashboardContext` を保持し、必要なら `enrichDashboardContext()` で backend の `/context` を呼ぶ。
- `ChatPanel` の送信で `createChatJob()` が呼ばれ、job polling で `GET /chat-jobs/{jobId}` を追う。
- Notion は `getNotionStatus()`、`startNotionConnect()`、`savePostIdeaToNotion()` で別経路の action として扱われる。

### 13.2 Backend entry

- `chatHandler` が `/chat-jobs`、`/chat`、`/context`、`/notion/*`、`/auth/cognito/*` を一つにまとめて受ける。
- `/chat-jobs` は `ChatJobService` に送られる。
- `/context` は `ChatService.getDashboardContextPatch()` に送られる。
- `/chat` は `ChatService.generateAnswer()` に送られる。

### 13.3 Job flow

- `ChatJobService.createChatJob()` が DynamoDB に record を作る。
- もし worker Lambda が設定されていれば `InvokeCommand` で非同期実行する。
- worker 側の `chatJobWorkerHandler` が `processChatJob()` を呼ぶ。
- `processChatJob()` は `createChatService().generateAnswer()` を実行し、結果を DynamoDB に保存する。

### 13.4 Agent flow

- `ChatService.generateAnswer()` が会話履歴を取り、`interpretQuestion()` で初期分類する。
- 軽量 fast path があれば `buildDatasourceInventoryFastPathAnswer()` などで即答する。
- そうでなければ `runLightweightAgentLoop()` に入る。
- `runLightweightAgentLoop()` は `ChatAgent.shouldRun()`、`createPlan()`、`evaluateContext()` を使う。
- `ChatAgent` が Bedrock ベースの場合、planning と evaluation に Bedrock を呼ぶ。
- `TableauContextProvider.getAdditionalContext()` が必要な文脈を集める。
- `TableauMcpContextProvider` は MCP を起動し、tool planning と execution を行う。
- `AnswerGenerator.generate()` が最後の自然文回答を作る。
- `buildNotionDraft()` が必要なら Notion 下書きを作る。
- `persistAndBuildResponse()` が履歴を保存してレスポンスを返す。

### 13.5 Bedrock call count が増えやすい箇所

- 1 回目: `TableauMcpToolPlanner.plan()`
- 2 回目以降: `BedrockChatAgent.createPlan()`
- 追加で複数回: `BedrockChatAgent.evaluateContext()` の再パス
- 最後: `BedrockAnswerGenerator.generate()`

このため、現在は質問 1 回あたり 1〜2 回に抑えたいという方針に対して、実装上はまだ余地が大きい。

## 14. 次の実装依頼で Codex に渡すべき具体的タスクリスト

1. `backend/src/agent/` 配下に `ContextPack`、`Intent`、`Plan`、`ToolAction`、`TraceEvent` の型を追加する。
2. `AgentRunner` interface と `LambdaAgentRunner` の骨組みを作る。
3. `ChatService` から `runLightweightAgentLoop()` を切り離し、orchestrator 経由に差し替える。
4. `TableauMcpContextProvider` を `ContextCollector` と `ToolExecutor` に分割する。
5. `POST /chat-jobs` に `agentRunId` を返し、job と trace を追えるようにする。
6. `TraceLogger` の保存先と JSON schema を決めて実装する。
7. `POST /context` を `ContextPack preview` として再定義するか、互換維持するかを確定する。
8. `ChatPanel` 側で `ContextPack preview` を表示する導線を整理する。
9. `notion` を action と tool のどちらに置くかを確定し、実装境界を固定する。
10. 既存の integration test を固定してから、固定 Plan 化を進める。

