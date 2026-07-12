# QuarkfanTools Platform

This repository is the parent workspace for QuarkfanTools platform modules.

It no longer contains the macOS standalone app source directly. Each major center or product line lives in its own Git repository and is referenced here as a submodule.

## Modules

| Path | Repository | Purpose |
| --- | --- | --- |
| `QuarkfanTools-Single/` | `git@github.com:Quarkfan/QuarkfanTools-Single.git` | Current macOS standalone QuarkfanTools app. It keeps the full historical codebase and all release tags through `v2.2.6`. |
| `Message-Gateway/` | `git@github.com:Quarkfan/Message-Gateway.git` | Message Gateway center: channel access, Message Hub, Message Store, Sink, RouteBinding, Cursor, Delivery, Trace, and Loop Guard design. |
| `Context-Hub/` | `git@github.com:Quarkfan/Context-Hub.git` | Context Hub center: context sources, knowledge/RAG, short/mid/long-term memory, freshness, scopes, retrieval, and memory governance design. |
| `Model-Hub/` | `git@github.com:Quarkfan/Model-Hub.git` | Model Hub center: model providers, deployments, capabilities, routing, fallback, health, usage, local/self-hosted models, and tool-exportable model abilities. |
| `Capability-Registry/` | `git@github.com:Quarkfan/Capability-Registry.git` | Capability Registry center: capability manifests, packages, providers, bindings, diagnostics, Skill/MCP/executable adapters, and model/context export registration. |
| `Reference-Projects/` | Parent repository directory | Local reference-project workspace for source-level evaluation of projects named in the platform reference matrix. Upstream clones live under `Reference-Projects/sources/` and are ignored by Git. |

Future centers should be added here as independent repositories and registered in `.gitmodules`.

## Platform Docs

- [Platform reference matrix](docs/platform-reference-matrix.md)
- [Platform centers](docs/platform-centers.md)
- [Cross-center protocols](docs/platform-interface-protocols.md)
- [macOS / Linux portability blueprint](docs/macos-linux-portability.md)

Module-specific docs live inside each submodule. Message Gateway-specific design is in [Message-Gateway/docs/message-gateway.md](Message-Gateway/docs/message-gateway.md). Context Hub-specific design is in [Context-Hub/docs/context-hub.md](Context-Hub/docs/context-hub.md), with implementation blueprint in [Context-Hub/docs/implementation-blueprint.md](Context-Hub/docs/implementation-blueprint.md). Model Hub-specific design is in [Model-Hub/docs/model-hub.md](Model-Hub/docs/model-hub.md), with implementation blueprint in [Model-Hub/docs/implementation-blueprint.md](Model-Hub/docs/implementation-blueprint.md). Capability Registry-specific design is in [Capability-Registry/docs/capability-registry.md](Capability-Registry/docs/capability-registry.md), with implementation blueprint in [Capability-Registry/docs/implementation-blueprint.md](Capability-Registry/docs/implementation-blueprint.md).

Reference project evaluation guidance lives in [Reference-Projects/README.md](Reference-Projects/README.md).

## Clone

```bash
git clone --recurse-submodules git@github.com:Quarkfan/QuarkFanTools.git
```

For an existing clone:

```bash
git submodule update --init --recursive
```

## Development

Work inside the module repository that owns the change:

- Standalone app code, packaging, release tags, and user-facing app behavior belong in `QuarkfanTools-Single/`.
- Message Gateway contracts and future MG implementation belong in `Message-Gateway/`.
- Context Hub contracts and future CH implementation belong in `Context-Hub/`.
- Model Hub contracts and future MH implementation belong in `Model-Hub/`.
- Capability Registry contracts and future CR implementation belong in `Capability-Registry/`.
- Source-level reference analysis belongs in `Reference-Projects/`; do not commit cloned upstream source there.
- This parent repository should only track module references, platform-level navigation, and integration status.

When a child module advances, commit and push inside that module first, then update the submodule gitlink in this parent repository.

## New Session Checklist

For a fresh AI or developer session:

1. Read [AGENTS.md](AGENTS.md), then [STATUS.md](STATUS.md).
2. If the work is platform-level modeling or cross-center design, read [docs/README.md](docs/README.md) and the relevant platform docs.
3. If the work is product code, packaging, release, or current customer issues, enter `QuarkfanTools-Single/` and read its `AGENTS.md`, `docs/AI.md`, and `STATUS.md`.
4. If the work is Message Gateway design or implementation, enter `Message-Gateway/` and read its `AGENTS.md`, `STATUS.md`, `docs/message-gateway.md`, and `docs/implementation-blueprint.md`.
5. If the work is Context Hub design or implementation, enter `Context-Hub/` and read its `AGENTS.md`, `STATUS.md`, `docs/context-hub.md`, and `docs/implementation-blueprint.md`.
6. If the work is Model Hub design or implementation, enter `Model-Hub/` and read its `AGENTS.md`, `STATUS.md`, `docs/model-hub.md`, and `docs/implementation-blueprint.md`.
7. If the work is Capability Registry design or implementation, enter `Capability-Registry/` and read its `AGENTS.md`, `STATUS.md`, `docs/capability-registry.md`, and `docs/implementation-blueprint.md`.
8. If the work uses open source projects as references, read [Reference-Projects/README.md](Reference-Projects/README.md) and keep upstream clones under `Reference-Projects/sources/`.
