# Roadmap v0.7.0 to v0.10.0

## 1. Purpose

This roadmap sets the high-level direction for v0.7.0 through v0.10.0 after the v0.6.0 AgentCore spike wrap-up.

Its goals are to:

- align the next milestones around Hosted Tableau MCP readiness
- keep the AgentCore deferred decision consistent
- define when legacy chat should shrink
- preserve the deterministic `selected_mark_explanation` baseline while the system expands
- give humans the major decision points before each milestone starts

## 2. Current state after v0.6.0

By the end of v0.6.0, the project has:

- Tableau context-first UI
- `selected_mark_explanation`
- structured orchestration
- Tool Layer
- context-derived pseudo tools
- deterministic `ResponseComposer` baseline
- `AgentRunner` abstraction
- `LambdaAgentRunner` as the default runtime
- deferred partial AgentCore adoption
- legacy free-form chat still on `ChatService` / `runLightweightAgentLoop`
- Tableau MCP still centered on stdio-based integration
- no full migration yet for Tableau MCP, LLM ResponseComposer, or AgentCore

This means the project already has comparison-ready boundaries, but it has not yet shifted to hosted remote MCP or richer runtime management.

## 3. New assumption: Hosted Tableau MCP

v0.7.0 onward assumes Tableau will offer or require a Hosted / remote MCP path as the preferred direction.

Current:

```text
backend / Lambda
↓
stdio Tableau MCP server
↓
Tableau Cloud
```

Target candidate:

```text
backend / Lambda
↓
remote MCP client / Hosted Tableau MCP transport
↓
Hosted Tableau MCP on Tableau Cloud
↓
Tableau Cloud content
```

What changes:

- transport becomes a first-class concern
- Tool Layer should not know whether transport is stdio or hosted
- OAuth, user context, site settings, and token handling become more important
- local development needs a fake or stdio fallback path
- read-only metadata tools should be the first migration target

## 4. Roadmap principles

- AgentCore stays deferred for now
- Hosted Tableau MCP preparation takes priority over broad runtime expansion
- MCP transport should be separated from tool definitions
- raw MCP tools should not be exposed directly to users
- app-specific wrapper tools should live in ToolRegistry
- read-only metadata comes before query or write tools
- arbitrary query execution is still out of scope
- underlying data access is still out of scope
- deterministic `ResponseComposer` remains the baseline
- optional LLM composition stays later and guarded
- no-network local tests must remain possible
- existing `selected_mark_explanation` behavior should not be broken

## 5. Version overview

| Version | Theme | Primary outcome | Explicitly not doing |
| --- | --- | --- | --- |
| v0.7.0 | Hosted Tableau MCP Migration Foundation | Define transport boundaries, Hosted MCP readiness, and read-only metadata tool shape | Full Hosted MCP migration, arbitrary query tools |
| v0.8.0 | Hosted Tableau MCP Metadata Execution | Connect read-only metadata tools to hosted or transport-aware execution | Free-form chat full migration, broad query exposure |
| v0.9.0 | Structured Data Discovery and Legacy Chat Reduction | Add discovery-oriented structured intents and shrink legacy chat coverage | Full `ChatService` replacement |
| v0.10.0 | LLM ResponseComposer or Exploration Session | Choose between safer natural-language composition or session-oriented exploration | AgentCore full migration |

## 6. v0.7.0: Hosted Tableau MCP Migration Foundation

### Theme

Hosted Tableau MCP Migration Foundation.

### Purpose

- audit current stdio Tableau MCP usage
- define a transport abstraction
- document Hosted Tableau MCP readiness requirements
- define the first read-only metadata tool family
- keep tests runnable without a hosted dependency

### Scope

- current stdio Tableau MCP usage audit
- Hosted Tableau MCP readiness audit
- transport abstraction design
- stdio vs hosted configuration strategy
- OAuth / user-context / site-settings boundary
- read-only metadata tool definitions
- metadata input/output schema
- metadata preconditions and governance
- ToolRegistry registration plan or limited implementation boundary
- fake / no-network handlers
- output normalization policy
- trace policy

### Out of scope

- full Hosted Tableau MCP production migration
- arbitrary query execution
- Tableau MCP query tools
- underlying data access
- write-capable tools
- free-form chat full migration
- LLM ResponseComposer implementation
- AgentCore implementation

### Candidate child issues

1. v0.7.0 planning and boundaries
2. Audit current stdio Tableau MCP usage
3. Audit Hosted Tableau MCP requirements and constraints
4. Define Tableau MCP transport abstraction
5. Define stdio vs hosted transport configuration strategy
6. Define Hosted MCP OAuth / user-context / site-settings boundary
7. Define read-only Tableau metadata tool definitions
8. Define metadata tool input/output schemas
9. Define metadata tool preconditions and governance boundaries
10. Register metadata tools with fake / no-network handlers
11. Add transport-aware metadata tool execution boundary
12. Add metadata output normalization and trace events
13. Document migration path from stdio to Hosted Tableau MCP
14. v0.7.0 wrap-up

## 7. v0.8.0: Hosted Tableau MCP Metadata Execution

### Theme

Hosted Tableau MCP Metadata Execution.

### Purpose

- connect the read-only metadata tools to real Hosted or transport-aware execution
- verify the stdio fallback story
- validate permission, auth, timeout, and trace behavior
- keep arbitrary query and write tools out of scope

### Scope

- remote / hosted MCP client adapter
- stdio fallback
- read-only metadata execution
- metadata result normalization
- MCP error normalization
- OAuth / token boundary verification
- timeout / retry / budget handling
- trace events
- no arbitrary query
- no underlying data

### Out of scope

- full free-form chat migration
- LLM query generation
- broad Tableau MCP tool exposure
- write tools
- AgentCore adoption

### Candidate child issues

1. Implement hosted metadata client adapter
2. Wire read-only metadata tools to the adapter
3. Add stdio fallback and config switching
4. Add metadata result normalization and error mapping
5. Add transport-aware trace events
6. Validate OAuth / token handling boundaries
7. v0.8.0 wrap-up

## 8. v0.9.0: Structured Data Discovery and Legacy Chat Reduction

### Theme

Structured Data Discovery and Legacy Chat Reduction.

### Purpose

- add discovery-oriented structured intents
- move a subset of free-form discovery into structured orchestration
- shrink legacy chat responsibilities without removing the fallback path too early

### Scope

- `metadata_discovery` intent
- data source / workbook / view ambiguity handling
- clarification responses
- structured plan updates
- ToolLayer metadata execution
- deterministic response shaping
- legacy chat fallback
- selected_mark_explanation regression protection

### Out of scope

- `ChatService` full replacement
- arbitrary data query
- LLM-generated Tableau MCP query
- underlying data access
- LLM composer default enablement

### Candidate child issues

1. Define metadata_discovery intent
2. Define ambiguity and clarification handling
3. Add structured metadata discovery plan
4. Connect metadata discovery to ToolLayer
5. Reduce legacy chat coverage for discovery cases
6. Validate selected_mark_explanation regression behavior
7. v0.9.0 wrap-up

## 9. v0.10.0: LLM ResponseComposer or Exploration Session

### Theme

LLM ResponseComposer or Exploration Session.

### Branch A: LLM ResponseComposer phase

Goal:

- keep deterministic composition as the baseline
- add optional LLM composition behind safe boundaries
- improve wording without losing evidence discipline

Value:

- better natural-language explanation
- controlled generation with prompt and response-material boundaries
- possible support for more polished user-facing summaries

### Branch B: Exploration Session phase

Goal:

- capture selected marks, metadata discovery, and interaction history as a session
- support exploratory analysis and cross-step memory
- provide a future bridge toward richer runtime/session management

Value:

- better analysis continuity
- stronger session and revisit story
- more direct connection to future managed runtime decisions

### Recommendation

Prefer to decide after v0.9.0 data is available.

If the main need is better wording, choose LLM ResponseComposer.
If the main need is workflow continuity and memory, choose Exploration Session.

## 10. AgentCore revisit strategy

AgentCore remains deferred in v0.7.0 through v0.10.0 unless the runtime becomes meaningfully more complex.

Revisit when:

- hosted MCP and metadata execution become multi-step and harder to observe
- cross-run session or memory becomes a real product need
- current trace and runtime visibility are no longer enough
- Lambda/API Gateway timeout constraints become a bottleneck
- a no-network AgentCore stub can still preserve local testability
- cost, IAM, and deployment trade-offs become clear enough to justify it

This roadmap does not plan AgentCore adoption as a v0.7.0 goal.

## 11. Legacy ChatService / runLightweightAgentLoop reduction strategy

Current legacy path:

```text
free-form chat
↓
ChatService / runLightweightAgentLoop
↓
legacy planning / legacy Tableau MCP usage
```

Desired future shape:

```text
free-form user message
↓
IntentResolver
↓
structured intent
↓
Plan
↓
ToolLayer
↓
ResponseComposer
```

Planned reduction:

- v0.7.0: audit only, no major reduction
- v0.8.0: metadata tools become available, but legacy chat still stays
- v0.9.0: discovery-oriented intents start moving into structured paths
- v0.10.0: selected free-form intents can start shrinking further
- later: `ChatService` / `runLightweightAgentLoop` can be reduced or retired if coverage becomes broad enough

## 12. Tableau MCP transport migration strategy

The transport migration should be handled as a boundary change, not a tool rewrite.

Suggested shape:

- `StdioTableauMcpTransport`
- `HostedTableauMcpTransport` or `RemoteTableauMcpTransport`
- shared transport-aware tool adapter
- feature flag or environment-variable switching
- local fake transport
- no-network tests
- auth boundary
- user-context boundary
- token handling boundary
- output normalization
- trace correlation
- stdio fallback
- gradual rollout

The Tool Layer should keep transport details hidden behind the adapter.

## 13. Safety and governance boundaries

Across v0.7.0 to v0.10.0, keep these boundaries in place:

- read-only metadata first
- no raw MCP tool exposure
- no arbitrary query execution
- no underlying data access by default
- no write-capable tools
- row and column limits
- output truncation
- datasource ambiguity preconditions
- permission and auth preconditions
- user-facing limitation notes
- no raw stack traces in responses
- no secrets or tokens in trace payloads
- JSON-safe output only
- local tests must not require Hosted MCP

## 14. Validation strategy across versions

- docs-only issues: verify docs exist, are consistent, and do not conflict
- backend changes: run backend lint, typecheck, and tests
- tool-layer contract changes: add contract tests and no-network tests
- transport changes: add fake / stdio fallback tests
- trace changes: add trace event tests
- legacy chat reduction: keep regression tests for the old path
- frontend changes only if the UI changes
- hosted integration tests should stay optional or gated

## 15. Proposed milestone sequence

1. v0.7.0 Hosted Tableau MCP Migration Foundation
2. v0.8.0 Hosted Tableau MCP Metadata Execution
3. v0.9.0 Structured Data Discovery and Legacy Chat Reduction
4. v0.10.0 LLM ResponseComposer or Exploration Session

## 16. Open questions before v0.7.0

- What exact Hosted Tableau MCP access model is available?
- Which OAuth or user-context flow is required?
- Can backend Lambda reach Hosted MCP directly?
- Should local dev use stdio fallback only, or also a fake transport?
- Should v0.7.0 stop at transport and schema design, or include one metadata tool registration?
- Should the first metadata tool be `describeDatasource` or `listFields`?
- Can v0.7.0 avoid frontend changes entirely?
- How much of legacy chat should remain untouched until v0.9.0?

## 17. Relationship to v0.6 docs

This roadmap is consistent with the v0.6 wrap-up and the AgentCore decision record:

- `docs/v0.6-wrap-up.md`
- `docs/v0.6-agentcore-spike-decision-record.md`

Those docs establish the v0.6 baseline; this roadmap defines the next stage after it.
