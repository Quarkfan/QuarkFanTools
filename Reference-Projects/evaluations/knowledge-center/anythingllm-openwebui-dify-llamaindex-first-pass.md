# Knowledge Center First Pass: AnythingLLM / Open WebUI / Dify / LlamaIndex

## Scope

- Center: Knowledge Center
- Capability: knowledge source management, document ingestion, chunk/index model, retrieval contract, permissions, freshness, audit
- Upstream projects:
  - AnythingLLM: `https://github.com/Mintplex-Labs/anything-llm.git`
  - Open WebUI: `https://github.com/open-webui/open-webui.git`
  - Dify: `https://github.com/langgenius/dify.git`
  - LlamaIndex: `https://github.com/run-llama/llama_index.git`
- Inspected commits:
  - AnythingLLM: `ce0a7ad`
  - Open WebUI: `ecd48e2`
  - Dify: `6e5ba18d`
  - LlamaIndex: `67514f6`
- Local source paths:
  - `Reference-Projects/sources/anything-llm`
  - `Reference-Projects/sources/open-webui`
  - `Reference-Projects/sources/dify`
  - `Reference-Projects/sources/llama_index`

This is a first-pass source-level evaluation. It is not a decision to depend on these projects as-is.

## Useful Models

### AnythingLLM

Inspected paths:

- `server/models/workspace.js`
- `server/models/documents.js`
- `collector/utils/files/index.js`
- `collector/processRawText/index.js`
- `collector/processLink/convert/generic.js`
- `collector/extensions/resync/index.js`

Useful ideas:

- `Workspace` combines collection-level retrieval settings such as similarity threshold, top N, chat mode, vector search mode, and model selection. For QuarkfanTools, this maps to `KnowledgeCollection` policy, not to runtime session.
- `Document.addDocuments` separates document record persistence from vectorization result and emits progress events like batch/doc start, complete, failed. This is directly useful for user-visible ingestion progress and diagnostics.
- Collector output writes normalized JSON documents into a server documents folder and returns a relative `location` that later embedding APIs can consume. This is a useful local-first ingestion seam for QuarkfanTools.
- `metadata.chunkSource` is used to preserve original source type and path, and resync adapters use it to refetch sources. This maps well to `KnowledgeFreshnessKey` and `KnowledgeSourceRef`.
- Vector DB is resolved through a provider abstraction (`getVectorDbClass`), which supports our principle that vector store choice belongs behind a Knowledge Index adapter.

Borrow carefully:

- AnythingLLM mixes workspace chat product settings with knowledge settings. QuarkfanTools should split `KnowledgeCollection` from runtime/model configuration.
- Do not copy its full chat workspace/product shape.
- Do not expose source credentials or `chunkSource` payloads directly to runtime; use controlled refs and governance checks.

### Open WebUI

Inspected paths:

- `backend/open_webui/models/knowledge.py`
- `backend/open_webui/tools/builtin.py`
- `backend/open_webui/tools/knowledge_fs.py`
- `backend/open_webui/retrieval/utils.py`
- `backend/open_webui/retrieval/vector/`
- `backend/open_webui/utils/middleware.py`
- `backend/open_webui/events.py`

Useful ideas:

- `Knowledge`, `KnowledgeDirectory`, and `KnowledgeFile` separate knowledge base identity, directory organization, and file membership. This is a clean model for `KnowledgeCollection`, `KnowledgeFolder`, and `KnowledgeDocumentBinding`.
- `AccessGrants` are checked before searching knowledge bases. QuarkfanTools should require governance approval before retrieving any source, not after results are already available.
- `query_knowledge_files` accepts model-attached knowledge, explicit knowledge IDs, or all accessible KBs, then normalizes local vector results, notes, and external knowledge into chunks with source metadata. This maps well to `KnowledgeRetrieveRequest.sources` and mixed source retrieval.
- Open WebUI treats knowledge search as a tool-like capability, but it still enforces user context and permissions. QuarkfanTools can expose retrieval to runtime as a center protocol while avoiding direct runtime access to raw stores.
- Events such as knowledge created, updated, reindexed, file moved, and access updated are useful for audit and UI refresh.

Borrow carefully:

- Its RAG injection lives close to chat middleware. QuarkfanTools should keep retrieval result generation in Knowledge Center and prompt construction in Runtime Center.
- Notes, model-attached knowledge, and files share a convenient product UX, but our center model should keep `KnowledgeSource` and `ResourceRef` distinct.
- Do not copy the full Open WebUI app/tool surface into Knowledge Center.

### Dify

Inspected paths:

- `api/services/entities/knowledge_entities/knowledge_entities.py`
- `api/services/entities/knowledge_entities/rag_pipeline_entities.py`
- `api/services/entities/knowledge_retrieval_inner.py`
- `api/core/rag/`
- `api/core/workflow/nodes/knowledge_retrieval/`
- `api/models/dataset.py`
- `api/services/dataset_service.py`
- `api/tests/test_containers_integration_tests/services/test_dataset_service_delete_dataset.py`
- `api/tests/test_containers_integration_tests/services/test_document_service_display_status.py`

Useful ideas:

- `KnowledgeConfig` explicitly models data source, process rule, retrieval model, summary index setting, doc form, embedding model, and multimodal flag. This is the strongest reference for our `KnowledgeIngestionConfig` and `KnowledgeIndexConfig`.
- Retrieval supports multiple search modes, reranking, score thresholds, hybrid weights, metadata filtering, and top K. These fields should be in our retrieval contract, even if P0 implements only a subset.
- Dify separates document form: text chunks, hierarchical parent-child chunks, and QA chunks. QuarkfanTools should preserve `chunkKind` and parent/child relationships from the start.
- `InnerKnowledgeRetrieveRequest` is a good internal contract pattern: caller context, dataset IDs, query or attachments, retrieval strategy, metadata filtering, validation, and usage reporting.
- Dataset/document display status tests show that indexing lifecycle and deletion cleanup need explicit tests, not just happy-path ingestion tests.

Borrow carefully:

- Dify is a full app/workflow platform. QuarkfanTools should not put workflow execution or app orchestration into Knowledge Center.
- Its tenant/app/user model should be translated into our Bot/Owner/governance scope, not copied literally.
- We should not adopt all retrieval knobs in UI at P0; keep contract extensible but UI conservative.

### LlamaIndex

Inspected paths:

- `llama-index-core/llama_index/core/schema.py`
- `llama-index-core/llama_index/core/base/base_retriever.py`
- `llama-index-core/llama_index/core/query_engine/retriever_query_engine.py`
- `llama-index-core/llama_index/core/ingestion/`
- `llama-index-core/tests/retrievers/`
- `llama-index-core/tests/schema/`

Useful ideas:

- `Document`, `BaseNode`, `TextNode`, `ImageNode`, `IndexNode`, `NodeWithScore`, `NodeRelationship`, and `MetadataMode` are strong references for our internal retrieval data model.
- Node metadata can be included differently for embedding and LLM context via excluded metadata key lists. QuarkfanTools needs the same split because some metadata is useful for ranking but unsafe or noisy for runtime context.
- Node relationships include source, previous, next, parent, and child. This maps directly to document chunk lineage, hierarchical chunks, and citation reconstruction.
- `NodeWithScore` cleanly couples a retrievable node with a score while leaving content and metadata on the node. This maps to `KnowledgeRetrieveResult.records[].score`.
- `BaseRetriever` gives a stable sync/async interface and performs recursive retrieval through index nodes. We can borrow the interface shape without pulling the entire framework initially.

Borrow carefully:

- LlamaIndex is a broad library ecosystem, not an application boundary. It is best as a model/interface reference or optional adapter, not as the whole Knowledge Center.
- Directly exposing LlamaIndex nodes across center boundaries would leak library-specific types. Translate to QuarkfanTools DTOs at boundaries.
- Recursive retrieval is powerful, but P0 should avoid implicit graph traversal unless trace and governance checks are in place.

## Suggested QuarkfanTools Landing Model

P0 should define stable DTOs before selecting any heavy dependency:

```text
KnowledgeSource
KnowledgeSourceAdapter
KnowledgeCollection
KnowledgeFolder
KnowledgeDocument
KnowledgeDocumentBinding
KnowledgeChunk
KnowledgeChunkRelationship
KnowledgeIndex
KnowledgeIngestionJob
KnowledgeIngestionEvent
KnowledgeRetrieveRequest
KnowledgeRetrieveResult
KnowledgeRetrieveRecord
KnowledgeFreshnessKey
KnowledgePermissionScope
KnowledgeAuditRecord
```

P0 interfaces:

```ts
interface KnowledgeSourceAdapter {
  listDocuments(request: ListKnowledgeDocumentsRequest): Promise<KnowledgeDocumentSummary[]>;
  fetchDocument(request: FetchKnowledgeDocumentRequest): Promise<KnowledgeDocumentContent>;
  getFreshness(request: KnowledgeFreshnessRequest): Promise<KnowledgeFreshnessKey>;
}

interface KnowledgeIngestionPipeline {
  ingest(request: KnowledgeIngestRequest): AsyncIterable<KnowledgeIngestionEvent>;
}

interface KnowledgeRetriever {
  retrieve(request: KnowledgeRetrieveRequest): Promise<KnowledgeRetrieveResult>;
}
```

P0 retrieval request should include:

- caller: bot/user/owner/context scope
- source selectors: skill knowledge, lark doc, lark drive, wiki, local folder, external connector
- query text and optional attachment/resource refs
- retrieval mode: semantic, keyword, hybrid
- top K, score threshold, rerank flag
- metadata filters
- freshness requirement
- audit/correlation IDs

P0 retrieval result should include:

- records with content, source, document ID, chunk ID, score, metadata, freshness, permission scope, and citation refs
- partial failures per source
- stale records separated from fresh records
- audit records or audit refs

## Initial Design Recommendations

1. Treat AnythingLLM as the main local-first product reference, but do not copy its chat workspace. Its collector/document/vectorization seam is more valuable than its full app shape.
2. Treat Open WebUI as the best reference for knowledge permissions, knowledge-directory/file membership, and tool-like retrieval. Keep RAG injection outside Knowledge Center.
3. Treat Dify as the best reference for ingestion/retrieval configuration and internal retrieval DTOs. Keep its workflow and tenant model out of Knowledge Center.
4. Treat LlamaIndex as the best reference for internal chunk/node/retriever abstractions. Translate its concepts into QuarkfanTools DTOs rather than leaking its types.
5. Keep Knowledge Center independent from Resource Center: Knowledge stores semantic facts and indexes; Resource Center owns raw files, caches, materialized workspace files, logs, and diagnostics bundles.
6. Keep Knowledge Center independent from Runtime Center: it returns retrieval results; Runtime decides how to fit them into the current runtime prompt/context.
7. Freshness must be first-class from the beginning. The existing customer worry about “07 knowledge file has data” means we need source snapshots, mtime/hash/version tracking, and safe update semantics.
8. Bot-level authorization must wrap every retrieval. A Bot can only retrieve explicitly authorized sources, even if a file exists locally or in a shared cache.

## Proposed P0 Build Order

1. Contract doc for Knowledge Center DTOs and interfaces.
2. Read-only adapter for existing Skill `knowledge/`.
3. Read-only adapter for existing controlled Lark file/doc cache refs.
4. Local JSONL/SQLite metadata store for `KnowledgeSource`, `KnowledgeDocument`, `KnowledgeChunk`, freshness and audit.
5. Basic keyword retrieval over text chunks.
6. Optional vector index adapter behind `KnowledgeIndex`, not directly in runtime.
7. UI/diagnostics: source list, stale/fresh status, last indexed time, failed documents, and per-Bot authorization view.

## Open Questions

- Should Skill `knowledge/` be indexed automatically when a Skill is authorized, or only after explicit Bot-level knowledge enablement?
- Should Lark docs be indexed persistently, or retrieved/exported on demand and indexed per Bot?
- Which vector store is acceptable for self-contained macOS packaging without creating brittle native dependency issues?
- How much of Knowledge Center P0 should live inside `QuarkfanTools-Single` before becoming a separate submodule?
- Should knowledge freshness be strict by default, or allow stale-but-marked results when a source is temporarily unavailable?

## Recommendation

Start with a QuarkfanTools-owned contract and minimal implementation. Do not directly embed Dify/Open WebUI/AnythingLLM as product dependencies at P0. Consider LlamaIndex only as an optional adapter/reference after our DTO boundaries are stable.

Confidence: medium-high for data model direction; medium for implementation dependency choices until packaging constraints and vector store options are tested on macOS arm64.
