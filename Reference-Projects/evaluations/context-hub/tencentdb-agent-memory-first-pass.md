# Context Hub First Pass: TencentDB Agent Memory

## Scope

- Center: Context Hub（CH）
- Capability: agent memory, memory asset management, L0-L3 memory layering, knowledge tools, ACL, agent loadout, recall/capture pipeline
- Upstream project: `https://github.com/TencentCloud/TencentDB-Agent-Memory.git`
- Inspected commit: `9059e52`
- Local source path: `Reference-Projects/sources/TencentDB-Agent-Memory`

This is a source-level reference evaluation. It is not a decision to depend on this project as-is.

## Project Positioning

TencentDB Agent Memory is closer to a full "team memory platform" than a library:

- `MemoryCore`: memory and metadata core, exposing L0/L1/L2/L3 memory APIs, skill APIs, knowledge metadata, asset metadata, prompt configuration, generation logs, and SDK-facing gateway.
- `MemoryProxy`: transparent OpenAI/Anthropic proxy that injects memory/skills/knowledge before forwarding LLM requests, and writes conversation data back after turns.
- `MemoryKnowledge`: wiki and code-graph service, including document/wiki ingestion, code graph indexing, search tools, and MCP tools.
- `MemoryPanel`: web control plane for team, user, agent, task, asset, ACL, wiki/code graph, skill, and chat memory management.
- `sdk/`: TypeScript and Python SDKs for MemoryCore.

The strongest product idea is not "save chat history"; it is "turn prior agent work into governable memory assets that can be assigned to future agents."

## Inspected Paths

- `README_CN.md`
- `ROADMAP_CN.md`
- `MemoryCore/README_CN.md`
- `MemoryProxy/README_CN.md`
- `MemoryKnowledge/README.md`
- `MemoryPanel/README.md`
- `MemoryCore/src/core/types.ts`
- `MemoryCore/src/core/store/isolation.ts`
- `MemoryCore/src/core/store/types.ts`
- `MemoryCore/src/core/hooks/auto-capture.ts`
- `MemoryCore/src/core/hooks/auto-recall.ts`
- `MemoryCore/src/core/record/l1-writer.ts`
- `MemoryCore/src/core/tools/memory-search.ts`
- `MemoryCore/src/core/memory-prompt/types.ts`
- `MemoryCore/src/metadata/types.ts`
- `MemoryCore/src/gateway/v2-schemas.ts`
- `MemoryCore/src/gateway/v2-router.ts`
- `MemoryPanel/src/panel/domain/chat-memory-governance.ts`
- `MemoryKnowledge/src/mcp/tools.ts`

## Useful Models

### L0-L3 Memory Layers

TencentDB Agent Memory uses a progressive memory hierarchy:

| Layer | Meaning | Useful CH Mapping |
| --- | --- | --- |
| L0 Conversation | raw conversation records | `ContextRecord(type="tool-observation"|"summary")` or short-term source evidence |
| L1 Atom | extracted facts, preferences, instructions, events | `ContextMemory(tier="mid-term" or "long-term")` candidate/record |
| L2 Scenario | scenario/project/work context | `ContextMemory(memoryKind="project-state"|"summary")` and `ContextCollection(kind="memory")` |
| L3 Persona/Core | stable user/team/agent profile | long-term confirmed memory or high-level memory summary |

This is useful because CH already separates short-term, mid-term, and long-term memory, but could more explicitly distinguish:

- raw evidence
- atomic memory
- scenario memory
- stable profile / doctrine

The key borrowing point is the pipeline shape: capture raw evidence first, then asynchronously extract higher-level memory. Do not write directly from model output into confirmed long-term memory.

### Memory Asset + Agent Loadout

TencentDB models Chat Memory, Skill, Wiki, and CodeGraph as assets with owner, team, visibility, status, version, confidence, expiry, usage, and fixed agent bindings.

Relevant types:

- `AssetType = "skill" | "llm_wiki" | "code_graph" | "chat_memory"`
- `AssetVisibility = "private" | "team" | "restricted" | "agent" | "task"`
- `AssetStatus = "draft" | "candidate" | "approved" | "deprecated" | "archived" | "failed"`
- `InjectionMode = "direct" | "summary" | "tool" | "reference"`
- `FixedAssetBindingEntity` with `agent_id`, `asset_id`, `asset_type`, `injection_mode`, and `priority`.

This maps well to CH's `ContextCollection`, `ContextSource`, and Bot-level authorization. For QuarkfanTools, the useful concept is not the exact Team/Agent product model, but the "Bot Loadout" model:

- A Bot should have explicit context bindings.
- Each binding should choose a mode: direct context, summary context, tool/reference only, or disabled.
- Binding priority should be visible and editable.
- Knowledge and memory should not become globally available just because they exist.

### Strict Isolation

`MemoryCore/src/core/store/isolation.ts` requires writes to include `userId`, `agentId`, and `sessionId`, with optional `teamId` and `taskId`.

The CH equivalent should keep `ContextScope` mandatory for memory writes and at least Bot-scoped for P0:

- `botId` is mandatory for active CH records in P0.
- `userId` / `conversationId` / `projectId` narrow private or project memory.
- `workspaceId` / `organizationId` must not imply read access without policy.

Tencent's secondary `rowMatchesIsolation` post-retrieval check is worth borrowing. Even if the underlying index claims it applied metadata filters, CH should re-check scope and policy before returning records.

### Query-Class Knowledge Tools

`MemoryKnowledge/src/mcp/tools.ts` exposes only query-class tools:

- Wiki: search, read, list, graph.
- CodeGraph: search, explore, callers, callees, impact, node, status, files.

Management operations such as create, delete, and sync are not exposed as agent tools; they remain control-plane actions.

This strongly matches the CH boundary:

- Runtime/Agent may retrieve or inspect authorized context.
- Source creation, sync, deletion, sharing, and indexing should go through CH management APIs and governance.
- CodeGraph-style impact search could become a future CH-adjacent source adapter, but should not be P0.

### Recall Injection Strategy

MemoryProxy splits context by stability:

- L2/L3/profile-like memory is stable and appended to system context.
- L1 atomic memory is dynamic per query.
- L0 raw conversation is exposed through tools rather than always injected.
- Skill and Knowledge can be exposed as summaries plus tool instructions.

For QuarkfanTools, this should be translated into Runtime Center behavior, not copied as an LLM proxy:

- CH returns `ContextRetrieveResult`.
- Runtime decides whether a result becomes direct prompt text, compact summary, tool/reference instruction, or citation-only context.
- CH should include enough metadata to support that decision: `memoryTier`, `recordType`, `sensitivity`, `freshness`, `score`, `confidence`, `injectionHint`, and `policyAuditRef`.

### Search Degradation

`memory-search.ts` supports native hybrid, client-side FTS + vector RRF, and degradation when embeddings or FTS are unavailable.

This supports the current CH P0 direction:

- Start with keyword/BM25.
- Keep vector and hybrid behind `ContextIndexAdapter`.
- Report chosen strategy and failures, rather than pretending retrieval was complete.

### Custom Memory Prompts and Generation Logs

MemoryCore supports per-layer memory extraction prompts with priority:

```text
Agent > Team > Instance > system
```

It also records generation logs with prompt ID/version/hash and input/output references.

CH should not expose free-form prompt customization in P0, but two ideas are useful:

- Memory extraction policy should be configurable per Bot or collection later.
- Memory candidates should record extraction policy version and evidence refs so users can debug why a memory was produced.

## Borrow Carefully

### Do Not Copy the Transparent Proxy Architecture

MemoryProxy is designed to sit between external agents and upstream LLM APIs. QuarkfanTools already has a thicker application/runtime layer, and platform docs separate Runtime Center, Model Hub, and CH.

For QuarkfanTools:

- Do not make CH an LLM proxy.
- Do not let CH mutate system prompts.
- Put context injection in Runtime Center after CH retrieval and governance checks.

### Avoid Over-Expanding P0 into Team Memory Hub

Tencent's Memory Hub includes team/user/agent/task/asset management. That is useful as a long-term product reference, but CH P0 should not become a full team collaboration console.

P0 should stay focused on:

- source registry
- Bot context bindings
- retrieval trace
- memory candidates
- confirmed memories
- forget/audit

Team/role/task collaboration can be phased in after the center boundaries stabilize.

### Treat "Auto Capture" as Candidate Generation, Not Confirmation

Tencent's pipeline can automatically capture and derive memories. CH's current governance stance is stricter: long-term memory cannot be automatically confirmed from model output.

Borrow the pipeline, not the trust level:

- L0 or summaries may be captured as evidence.
- L1/L2/L3 extraction should become `MemoryCandidate`.
- Confirmation, policy approval, or multi-evidence reinforcement is required before long-term use.

### Be Careful With Chat Memory Sharing

Tencent's panel has a chat-memory-specific relation allowing a limited number of imported agents. This is productively concrete, but QuarkfanTools should not default to team-wide sharing.

CH should keep:

- private by default
- explicit Bot binding
- explicit cross-Bot import/share
- visible audit trail

### Do Not Merge Skill Registry into CH

Tencent's asset model puts Skill beside memory/wiki/code assets. QuarkfanTools has a separate Capability Registry. CH can manage skill `knowledge/` as a context source, but executable Skill lifecycle belongs to Capability Registry.

## Suggested CH Design Additions

### 1. Add Context Binding / Bot Loadout as a First-Class P0 UI Concept

Current CH docs mention authorized sources and default collections. Tencent's asset binding model suggests making this more explicit:

```ts
interface ContextBinding {
  bindingId: string;
  botId: string;
  sourceId?: string;
  collectionId?: string;
  recordSelector?: Record<string, unknown>;
  bindingMode: "direct" | "summary" | "tool" | "reference" | "disabled";
  priority: number;
  status: "active" | "paused" | "revoked";
  createdBy: ContextActor;
  createdAt: string;
  updatedAt: string;
}
```

This would make "what context does this Bot carry" visible, auditable, and separate from the mere existence of context records.

### 2. Add Memory Derivation Level to ContextMemory

CH already has `MemoryTier`. Tencent's L0-L3 model suggests adding a derivation level or kind:

```ts
type MemoryDerivationLevel = "raw-evidence" | "atomic" | "scenario" | "profile";
```

This is orthogonal to tier:

- L1 atomic can be mid-term candidate or long-term confirmed.
- L2 scenario can be project-scoped mid-term.
- L3 profile can be long-term but should still be editable and auditable.

### 3. Add Injection Hint to Retrieval Records

Tencent's `InjectionMode` is a good product concept. CH can expose a neutral hint without taking over prompt construction:

```ts
type ContextInjectionHint = "direct" | "summary" | "tool" | "reference" | "citation-only";
```

Runtime can ignore or override the hint, but having it in `ContextRetrieveRecord` helps explain why a source was directly included versus only exposed as a tool/reference.

### 4. Add Post-Index Scope Recheck as a Hard Retrieval Rule

Borrow Tencent's `rowMatchesIsolation` safety net:

- Index adapters may pre-filter by scope.
- Retrieval Engine must still re-check scope and policy after candidate retrieval.
- Any dropped rows should be visible in diagnostics as scope/policy filtered counts.

### 5. Add Memory Generation Trace

For every memory candidate, record:

- evidence refs
- extraction policy/prompt ID and version/hash
- extractor model/provider ref if used
- createdBy actor
- candidate risk and confirmation requirement
- audit ref

This is aligned with CH's audit goals and makes memory correction explainable.

### 6. Keep Knowledge Tools Query-Only

For future Wiki/CodeGraph-like adapters:

- expose search/read/status/graph/callers/impact-like query operations
- keep create/sync/delete/reindex in CH management APIs
- require policy checks before tool availability and again before result use-in-model

## Suggested CH Priority Impact

Near-term:

1. Keep P0 implementation inside `QuarkfanTools-Single` as a facade; do not adopt Tencent's multi-service layout.
2. Add explicit Bot context binding / loadout to the CH blueprint.
3. Keep strict Bot/user/conversation scope checks before and after retrieval.
4. Add `injectionHint` or equivalent retrieval metadata.
5. Represent session summaries and automatic memory extraction as candidates with evidence and generation trace.

Mid-term:

1. Evaluate lightweight BM25 + optional vector hybrid with RRF.
2. Add scenario/project memory as a separate derivation level.
3. Add query-only knowledge tools for local wiki/code graph style sources if QuarkfanTools later needs repository-aware context.
4. Add memory prompt/policy versioning only after memory candidates and confirmation UI are stable.

Not recommended for CH P0:

- Transparent LLM proxy.
- Full Team Memory Hub UI.
- Automatic confirmed long-term memory.
- Built-in CodeGraph/Wiki service.
- Merging executable Skill lifecycle into CH.

## Recommendation

TencentDB Agent Memory is a strong second-batch memory reference, especially for product positioning and memory asset governance. It reinforces CH's current direction: context is not just RAG; it is authorized, versioned, scoped, auditable memory and knowledge that can be assigned to agents.

The most valuable ideas to absorb into CH are:

1. Bot context binding / loadout.
2. L0-L3 derivation model as an internal memory production lens.
3. Query-only knowledge tools with management actions kept in the control plane.
4. Strict isolation plus post-retrieval recheck.
5. Memory generation trace and editable memory assets.

Do not copy its deployment architecture into QuarkfanTools. CH should remain a QuarkfanTools-owned contract and start with a local facade, then selectively adopt these patterns.

Confidence: high for product/model inspiration; medium for implementation reuse because the repo is a broad platform stack and would be too heavy for CH P0/macOS 2.x delivery.
