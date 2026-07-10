# Reference Projects

This directory manages code-level reference work for projects named in `../docs/platform-reference-matrix.md`.

It is not a product module and it is not part of the shipped QuarkfanTools runtime. Its purpose is to give the platform design work a stable place to:

- clone selected open source projects locally for source reading;
- compare their domain models, data models, APIs, lifecycle, permission model, error handling, observability, and tests;
- record which ideas are useful for QuarkfanTools and which product assumptions should not be copied;
- extract reference points for each center before final architecture decisions are made.

## Directory Layout

```text
Reference-Projects/
  README.md
  .gitignore
  sources/       # local clones of upstream projects, ignored by Git
  evaluations/   # tracked evaluation notes and extraction records
```

`sources/` is for local clones only. Do not commit upstream project source code into this parent repository. If a reference project needs to become a long-lived managed dependency later, add it deliberately as a separate repository or submodule after a decision is made.

`evaluations/` is for our own notes, comparison tables, source-reading summaries, and extracted design points. Notes should cite the upstream project, commit or version, inspected paths, and the QuarkfanTools center or capability they inform.

## Evaluation Template

Use one note per reference project or per focused capability:

```md
# <Project or Capability>

## Scope

- Center:
- Capability:
- Upstream project:
- Upstream URL:
- Inspected commit or version:
- Inspected paths:

## Useful Models

- Domain objects:
- Data or state model:
- Public interfaces:
- Lifecycle:
- Extension or adapter model:

## Operational Lessons

- Error handling:
- Retry and recovery:
- Logs, audit, and diagnostics:
- Configuration:
- Tests:

## Borrow Carefully

- Ideas worth adapting:
- Product assumptions not suitable for QuarkfanTools:
- Security or privacy risks:
- Complexity to avoid:

## Recommendation

- Suggested QuarkfanTools landing point:
- Confidence:
- Open questions:
```

## Current Priority

Message Gateway references already evaluated:

- Chatwoot: multi-channel, inbox/channel/conversation, contact binding, outbound delivery.
- Matrix / Synapse: event, room, timeline, pagination, sync token, cursor thinking.
- Mattermost: channel, thread, post, group collaboration message shape.
- GitHub Webhook / Slack Events: event envelope, signature verification, retry, idempotency.

Context Hub references currently cloned for source-level evaluation:

- AnythingLLM: local-first workspace, documents, vector DB, document pipeline.
- Open WebUI: knowledge model, RAG/retrieval, access grants, knowledge tools.
- Dify: dataset/knowledge configuration, ingestion/retrieval DTOs, metadata filtering, reranking.
- LlamaIndex: Document/Node/Index/Retriever abstractions.

Tracked first-pass notes:

- `evaluations/context-hub/anythingllm-openwebui-dify-llamaindex-first-pass.md`

The reference matrix is an input to modeling, not a replacement for QuarkfanTools decisions.

## Collaboration Rule

Final product and architecture decisions are made by Dean. For work that does not itself decide product direction, repository ownership, release scope, external commitments, or irreversible architecture choices, Codex has independent judgment.

Codex must proactively think, identify risks, compare tradeoffs, suggest alternatives, and recommend low-risk improvements. It should not behave as a purely passive executor when source-level reference reading exposes better modeling options or avoidable architecture risks.

Open source reuse must be evaluated deliberately. A useful upstream project can become a full dependency, a submodule, an adapted component, a model for interfaces or state machines, a test-design reference, or a source of small license-compatible snippets. Do not copy upstream projects wholesale into this repository by default, and do not ignore mature open source implementations when they would reduce risk.
