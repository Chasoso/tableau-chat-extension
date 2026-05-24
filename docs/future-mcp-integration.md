# Future Tableau MCP Integration / 将来の Tableau MCP 統合

## English

The current PoC supports `MockTableauContextProvider`, `DirectTableauApiContextProvider`, and a first `TableauMcpContextProvider` stub. The MCP provider is selected with `TABLEAU_CONTEXT_PROVIDER=mcp` and calls a configured backend-side MCP endpoint when available.

### Intended Direction

`TableauMcpContextProvider` implements:

```ts
export interface TableauContextProvider {
  getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext>;
}
```

`ChatService` continues to depend only on this interface. It does not know whether context came from REST API, Metadata API, MCP tools, or mocks.

Current MCP environment variables:

- `TABLEAU_MCP_SERVER_URL`
- `TABLEAU_MCP_TRANSPORT`
- `TABLEAU_MCP_AUTH_MODE`
- `TABLEAU_MCP_TIMEOUT_MS`

The current implementation intentionally keeps MCP calls small and safe. If the MCP endpoint is not configured or fails, the provider returns warnings and the chat flow continues with frontend dashboard context. TODO: replace the HTTP stub payload with the exact MCP client protocol once the selected Tableau MCP deployment model is confirmed.

### Hosting Options For MCP

Potential AWS hosting models:

- ECS Fargate
- AWS App Runner
- Lambda Web Adapter

The right choice depends on the MCP server runtime model, connection lifetime, cold start tolerance, and networking requirements.

If Lambda calls MCP over HTTP, keep timeouts short, avoid long-lived streaming assumptions unless explicitly supported, and do not put MCP tokens in frontend code. For streaming or long-running MCP sessions, ECS Fargate or App Runner may be more predictable than Lambda.

### Authentication Considerations

Confirm whether Tableau MCP supports Connected Apps Direct Trust JWT. If it does, the MCP provider can reuse the backend's Connected App secret handling and subject mapping strategy.

If Tableau MCP does not support Connected Apps JWT, keep REST API / Metadata API direct calls for production Tableau access and use MCP only for capabilities that can be safely authenticated.

The MCP execution identity must not exceed the verified user's Tableau permissions. The backend now passes `authenticatedUser` and `tableauSubject` into the provider input. For this PoC, the Tableau subject is derived from the verified Cognito `email` claim. TODO: confirm whether the selected Tableau MCP server can execute as that subject via Connected Apps JWT, OAuth, or another supported delegation model.

Avoid production designs where a broad service account PAT runs all MCP calls. That pattern breaks per-user permission boundaries unless every MCP operation is separately constrained and audited.

### Provider Selection

Suggested configuration:

- `TABLEAU_CONTEXT_PROVIDER=mock`
- `TABLEAU_CONTEXT_PROVIDER=direct-api`
- `TABLEAU_CONTEXT_PROVIDER=mcp`

`mcp` should be used only after the MCP auth and deployment model are verified. `direct` is still accepted as a backward-compatible alias for `direct-api`.

## 日本語

現在の PoC では、`MockTableauContextProvider`、`DirectTableauApiContextProvider`、最初の stub 実装である `TableauMcpContextProvider` を選択できます。MCP provider は `TABLEAU_CONTEXT_PROVIDER=mcp` で選択し、設定済みのバックエンド側 MCP endpoint を呼び出します。

### 目指す方向性

`TableauMcpContextProvider` は以下のインターフェースを実装します。

```ts
export interface TableauContextProvider {
  getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext>;
}
```

`ChatService` は引き続きこのインターフェースだけに依存します。コンテキスト取得元が REST API、Metadata API、MCP tools、モックのどれかを `ChatService` が意識しない設計です。

現在の MCP 用環境変数:

- `TABLEAU_MCP_SERVER_URL`
- `TABLEAU_MCP_TRANSPORT`
- `TABLEAU_MCP_AUTH_MODE`
- `TABLEAU_MCP_TIMEOUT_MS`

現在の実装では、MCP 呼び出しは小さく安全な stub に留めています。MCP endpoint が未設定または失敗した場合、provider は warnings を返し、チャット処理はフロントエンドから得た dashboard context だけで継続します。TODO: 採用する Tableau MCP のデプロイ方式が確定したら、HTTP stub payload を正確な MCP client protocol に置き換えてください。

### MCP のホスティング候補

AWS 上での候補:

- ECS Fargate
- AWS App Runner
- Lambda Web Adapter

適切な方式は、MCP server のランタイムモデル、接続時間、コールドスタート許容度、ネットワーク要件によって変わります。

Lambda から MCP を HTTP で呼ぶ場合は、timeout を短く保ち、明示的にサポートされない限り長時間 streaming を前提にしないでください。MCP token はフロントエンドに置きません。streaming や長時間セッションが必要な MCP では、Lambda より ECS Fargate または App Runner の方が予測しやすい場合があります。

### 認証の確認事項

Tableau MCP が Connected Apps Direct Trust JWT に対応しているか確認してください。対応している場合、MCP provider はバックエンドの Connected App Secret 管理と subject mapping 方針を再利用できます。

Tableau MCP が Connected Apps JWT に対応していない場合は、本番の Tableau アクセスでは REST API / Metadata API の直呼びを継続し、安全に認証できる機能に限って MCP を使います。

MCP の実行主体は、検証済みユーザーの Tableau 権限を超えてはいけません。バックエンドは `authenticatedUser` と `tableauSubject` を provider input に渡します。この PoC では、Tableau subject は検証済み Cognito `email` claim から決定します。TODO: 採用する Tableau MCP server が Connected Apps JWT、OAuth、または他の delegation model により、その subject として実行できるか確認してください。

本番で、広い権限を持つサービスアカウント PAT によって全 MCP 呼び出しを実行する設計は避けてください。この方式は、すべての MCP 操作を別途制限・監査しない限り、ユーザーごとの権限境界を壊します。

### Provider の選択

想定設定:

- `TABLEAU_CONTEXT_PROVIDER=mock`
- `TABLEAU_CONTEXT_PROVIDER=direct-api`
- `TABLEAU_CONTEXT_PROVIDER=mcp`

`mcp` は、MCP の認証方式とデプロイモデルを検証した後に使ってください。`direct` は後方互換の alias として引き続き `direct-api` と同じ扱いです。
