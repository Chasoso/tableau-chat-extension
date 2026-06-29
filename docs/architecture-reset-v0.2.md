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

### v0.2 実装状況

v0.2.0 の土台は次の順で揃った。

- 完了済み
  - Issue #19: `ContextPack` / `AgentIntent` / `AgentPlan` / `ToolAction` / `TraceEvent` などの agent core types
  - Issue #20: `agentRunId` helper と trace schema
  - Issue #21: `AgentRunner` interface
  - Issue #18: `LambdaAgentRunner` wrapper
  - Issue #23: Minimal fixed plan design
- まだ接続していないもの
  - `ChatService` の実行フローは `runLightweightAgentLoop()` のまま
  - `LambdaAgentRunner` は既存 job flow に未接続
  - fixed plan は定義と選択ロジックまでで、ExecutionEngine には未接続
  - ContextPack preview API / UI は未導入
  - `IntentResolver` / `ToolRouter` / `ExecutionEngine` / `TraceLogger` は v0.3 以降の実装対象

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

## 7. v0.2.0 で実装済みの範囲

v0.2.0 の完了時点で、次の基礎部品は揃っている。

### 実装済み

- Issue #19: ContextPack / AgentIntent / AgentPlan / ToolAction / TraceEvent / AgentRunId の core types
- Issue #20: agentRunId helper と trace schema
- Issue #21: AgentRunner interface
- Issue #18: LambdaAgentRunner wrapper
- Issue #23: Minimal fixed plan design
- `backend/src/agent/index.ts` からの export 整理

### まだ接続していない範囲

- `ChatService` の本流はまだ `runLightweightAgentLoop()` のまま
- `LambdaAgentRunner` は既存 job flow に未接続
- fixed plan は定義と選択ロジックまでで、ExecutionEngine に未接続
- `IntentResolver` / `ToolRouter` / `ExecutionEngine` / `TraceLogger` の本体は未実装
- ContextPack preview API / UI は未導入

## 8. v0.3.0 以降に回すべきスコープ

v0.2 で意図的に残した次フェーズ候補。

- ContextPack preview API / UI
- Tableau Extension API context collector の強化
- MarkSelectionChanged listener
- AI Context Preview panel
- Orchestrator facade
- `LambdaAgentRunner` を既存 chat job flow に接続する変更
- ExecutionEngine の最小実装
- IntentResolver の最小実装
- ToolRouter の最小実装
- `selected_mark_explanation` fixed plan の実行接続
- `current_dashboard_summary` fixed plan の実行接続
- AgentCoreRunner への差し替え
- AgentCore Gateway 連携
- Streaming trace UI
- Notion を tool layer へ寄せるかどうかの再整理

## 9. 移行手順

### 現在地

1. v0.2 の基礎型・trace・runner・wrapper・fixed plan は揃った。
2. 既存の実行フローはまだ壊さず、接続点を次フェーズに残している。

### 次の移行順

1. ContextPack preview API / UI を整える。
2. Orchestrator facade を追加し、入口を一本化する。
3. `LambdaAgentRunner` を chat job flow に接続する。
4. 最小の IntentResolver / PlanBuilder / ToolRouter / ExecutionEngine を追加する。
5. fixed plan の実行接続を進める。
6. その後に AgentCoreRunner へ差し替え可能な境界を確認する。

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

- `ContextPack`
- `TraceEvent`
- `AgentRunner`
- `LambdaAgentRunner`
- `buildFixedPlan()`

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

v0.2 の完了により多くは次フェーズへ送れるが、v0.3 へ入る前に再確認したい点を残す。

1. `ContextPack preview` を `/context` の互換維持で進めるか、新 API として分けるか。
2. `agentRunId` を job ID と完全一致させるか、子 ID にするか。
3. trace の永続先は DynamoDB、CloudWatch、S3 のどれを主にするか。
4. `CHAT_AGENT_ENABLED` 相当のスイッチを残すか。
5. fixed plan の追加単位を intent ベースで拡張するか、dashboard task ベースにするか。
6. Notion は action 連携のまま残すか、tool layer に寄せるか。

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
- v0.2 で追加した `backend/src/agent/` の基礎部品は、この既存フローの外側に並ぶ土台として存在しているが、まだ本流には接続していない。

### 13.5 Bedrock call count が増えやすい箇所

- 1 回目: `TableauMcpToolPlanner.plan()`
- 2 回目以降: `BedrockChatAgent.createPlan()`
- 追加で複数回: `BedrockChatAgent.evaluateContext()` の再パス
- 最後: `BedrockAnswerGenerator.generate()`

このため、現在は質問 1 回あたり 1〜2 回に抑えたいという方針に対して、実装上はまだ余地が大きい。

## 14. 次フェーズ候補

Issue 化しやすい粒度で整理した次の候補。

1. `ContextPack preview API` の設計と実装
2. `AI Context Preview panel` の実装
3. Tableau Extension API の `DashboardStateCollector` 強化
4. `MarkSelectionChanged` listener の追加
5. `Orchestrator facade` の導入
6. `LambdaAgentRunner` を chat job flow に接続する Issue
7. `IntentResolver` の最小実装
8. `ToolRouter` の最小実装
9. `ExecutionEngine` の最小実装
10. `current_dashboard_summary` fixed plan の実行接続
11. `selected_mark_explanation` fixed plan の実行接続
12. `TraceLogger` の永続化先を確定する Issue
## 15. v0.3.0 Follow-up

v0.3.0 "Tableau Context First" is now complete on the frontend side.

Completed follow-up issues:

- Issue #33: Frontend Tableau context collector audit
- Issue #34: Define frontend context preview model
- Issue #35: Collect filters and parameters from Tableau Extension API
- Issue #36: Collect selected marks from Tableau worksheets
- Issue #37: Add MarkSelectionChanged listener
- Issue #38: Add summary data preview collector
- Issue #39: Add AI Context Preview panel
- Issue #40: Add selected mark action suggestions

What remains for v0.4.0:

- structured orchestration
- IntentResolver
- PlanBuilder
- ToolRouter
- ExecutionEngine
- trace-first orchestration visibility
- safe connection from preview actions into fixed plans
