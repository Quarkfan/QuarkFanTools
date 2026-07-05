# QuarkfanTools Platform Docs

These documents describe the parent platform and cross-module boundaries.

- Start a new platform session from `../AGENTS.md` and `../STATUS.md`.
- `platform-reference-matrix.md`: reference matrix for center modeling. It is a design input and comparison checklist, not an implementation mandate.
- `platform-centers.md`: platform center boundaries.
- `platform-interface-protocols.md`: cross-center request, response, error, audit, and protocol contracts.
- `macos-linux-portability.md`: current macOS assumptions and future Linux/server blueprint.

Module-specific documents should live inside their owning submodule. For example, Message Gateway-specific design lives in `../Message-Gateway/docs/message-gateway.md`.

Current module handoff entry points:

- Standalone app: `../QuarkfanTools-Single/AGENTS.md`, `../QuarkfanTools-Single/docs/AI.md`, `../QuarkfanTools-Single/STATUS.md`.
- Message Gateway: `../Message-Gateway/AGENTS.md`, `../Message-Gateway/STATUS.md`, `../Message-Gateway/docs/message-gateway.md`, `../Message-Gateway/docs/implementation-blueprint.md`.
- Reference projects: `../Reference-Projects/README.md`.
