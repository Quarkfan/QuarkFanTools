# QuarkfanTools Platform Docs

These documents describe the parent platform and cross-module boundaries.

- Start a new platform session from `../AGENTS.md` and `../STATUS.md`.
- `platform-reference-matrix.md`: reference matrix for center modeling. It is a design input and comparison checklist, not an implementation mandate.
- `platform-centers.md`: platform center boundaries.
- `platform-interface-protocols.md`: cross-center request, response, error, audit, and protocol contracts.
- `macos-linux-portability.md`: current macOS assumptions and future Linux/server blueprint.

Module-specific documents should live inside their owning submodule. For example, Message Gateway-specific design lives in `../Message-Gateway/docs/message-gateway.md`, Context Hub-specific design lives in `../Context-Hub/docs/context-hub.md` plus `../Context-Hub/docs/implementation-blueprint.md`, Model Hub-specific design lives in `../Model-Hub/docs/model-hub.md` plus `../Model-Hub/docs/implementation-blueprint.md`, and Capability Registry-specific design lives in `../Capability-Registry/docs/capability-registry.md` plus `../Capability-Registry/docs/implementation-blueprint.md`.

Current module handoff entry points:

- Standalone app: `../QuarkfanTools-Single/AGENTS.md`, `../QuarkfanTools-Single/docs/AI.md`, `../QuarkfanTools-Single/STATUS.md`.
- Message Gateway: `../Message-Gateway/AGENTS.md`, `../Message-Gateway/STATUS.md`, `../Message-Gateway/docs/message-gateway.md`, `../Message-Gateway/docs/implementation-blueprint.md`.
- Context Hub: `../Context-Hub/AGENTS.md`, `../Context-Hub/STATUS.md`, `../Context-Hub/docs/context-hub.md`, `../Context-Hub/docs/implementation-blueprint.md`.
- Model Hub: `../Model-Hub/AGENTS.md`, `../Model-Hub/STATUS.md`, `../Model-Hub/docs/model-hub.md`, `../Model-Hub/docs/implementation-blueprint.md`.
- Capability Registry: `../Capability-Registry/AGENTS.md`, `../Capability-Registry/STATUS.md`, `../Capability-Registry/docs/capability-registry.md`, `../Capability-Registry/docs/implementation-blueprint.md`.
- Reference projects: `../Reference-Projects/README.md`.
