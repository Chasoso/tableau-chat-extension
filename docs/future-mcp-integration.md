# Future Tableau MCP Integration / 将来の Tableau MCP 統合

## English

The current PoC uses `DirectTableauApiContextProvider`, which calls Tableau REST API and Metadata API directly from the backend.

### Intended Direction

Add a future `TableauMcpContextProvider` that implements:

```ts
export interface TableauContextProvider {
  getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext>;
}
```

`ChatService` should continue to depend only on this interface. It should not know whether context came from REST API, Metadata API, MCP tools, or mocks.

### Hosting Options For MCP

Potential AWS hosting models:

- ECS Fargate
- AWS App Runner
- Lambda Web Adapter

The right choice depends on the MCP server runtime model, connection lifetime, cold start tolerance, and networking requirements.

### Authentication Considerations

Confirm whether Tableau MCP supports Connected Apps Direct Trust JWT. If it does, the MCP provider can reuse the backend's Connected App secret handling and subject mapping strategy.

If Tableau MCP does not support Connected Apps JWT, keep REST API / Metadata API direct calls for production Tableau access and use MCP only for capabilities that can be safely authenticated.

### Provider Selection

Suggested configuration:

- `TABLEAU_CONTEXT_PROVIDER=mock`
- `TABLEAU_CONTEXT_PROVIDER=direct`
- `TABLEAU_CONTEXT_PROVIDER=mcp`

`mcp` should be added only after the MCP auth and deployment model are verified.

## 日本語

現在の PoC では、バックエンドから Tableau REST API と Metadata API を直接呼び出す `DirectTableauApiContextProvider` を使います。

### 目指す方向性

将来的に、以下のインターフェースを実装する `TableauMcpContextProvider` を追加します。

```ts
export interface TableauContextProvider {
  getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext>;
}
```

`ChatService` は引き続きこのインターフェースだけに依存します。コンテキスト取得元が REST API、Metadata API、MCP tools、モックのどれかを `ChatService` が意識しない設計にします。

### MCP のホスティング候補

AWS 上での候補:

- ECS Fargate
- AWS App Runner
- Lambda Web Adapter

適切な方式は、MCP server のランタイムモデル、接続時間、コールドスタート許容度、ネットワーク要件によって変わります。

### 認証の確認事項

Tableau MCP が Connected Apps Direct Trust JWT に対応しているか確認してください。対応している場合、MCP provider はバックエンドの Connected App Secret 管理と subject mapping 方針を再利用できます。

Tableau MCP が Connected Apps JWT に対応していない場合は、本番の Tableau アクセスでは REST API / Metadata API の直呼びを継続し、安全に認証できる機能に限って MCP を使います。

### Provider の選択

想定設定:

- `TABLEAU_CONTEXT_PROVIDER=mock`
- `TABLEAU_CONTEXT_PROVIDER=direct`
- `TABLEAU_CONTEXT_PROVIDER=mcp`

`mcp` は、MCP の認証方式とデプロイモデルを検証した後に追加してください。

