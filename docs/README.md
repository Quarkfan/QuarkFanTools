# QuarkfanTools Platform Docs

These documents describe the parent platform and cross-module boundaries.

- Start a new platform session from `../AGENTS.md`, `../STATUS.md` and `session-handoff.md`.
- `session-handoff.md`: concise current production state, exact module baseline, latest completed work, known issues and continuation procedure.
- `platform-reference-matrix.md`: reference matrix for center modeling. It is a design input and comparison checklist, not an implementation mandate.
- `platform-centers.md`: platform center boundaries.
- `platform-interface-protocols.md`: cross-center request, response, error, audit, and protocol contracts.
- `extensibility-architecture.md`: Definition / Provider / Binding / Consumer model, Runtime Profile, Session Event Ledger, governed capability pipeline and controlled Cordis adoption boundary.
- `server-readiness-roadmap.md`: 3.0 server-ready P0 roadmap for turning MG / CH / MH / CR contracts into deployable services.
- `3.0-implementation-program.md`: implementation topology, technical baseline, milestones, resource budget, and release gates.
- `2x-to-3x-capability-matrix.md`: complete capability migration baseline from QuarkfanTools-Single 2.3.2.
- `3.0-current-release.md`: implemented 3.0 service topology, capability status, acceptance evidence, security boundaries and controlled degradations.
- `3.0-configuration-lifecycle.md`: required CRUD, dependency protection, advanced-setting and non-CRUD runtime-record rules.
- `3.0-completion-audit.md`: requirement-by-requirement implementation evidence, controlled degradations and remaining external publication gap.
- `macos-linux-portability.md`: current macOS assumptions and future Linux/server blueprint.

Module-specific documents should live inside their owning submodule. For example, Message Gateway-specific design lives in `../Message-Gateway/docs/message-gateway.md`, Context Hub-specific design lives in `../Context-Hub/docs/context-hub.md` plus `../Context-Hub/docs/implementation-blueprint.md`, Model Hub-specific design lives in `../Model-Hub/docs/model-hub.md` plus `../Model-Hub/docs/implementation-blueprint.md`, and Capability Registry-specific design lives in `../Capability-Registry/docs/capability-registry.md` plus `../Capability-Registry/docs/implementation-blueprint.md`.

Current module handoff entry points:

- Standalone app: `../QuarkfanTools-Single/AGENTS.md`, `../QuarkfanTools-Single/docs/AI.md`, `../QuarkfanTools-Single/STATUS.md`.
- Message Gateway: `../Message-Gateway/AGENTS.md`, `../Message-Gateway/STATUS.md`, `../Message-Gateway/docs/message-gateway.md`, `../Message-Gateway/docs/implementation-blueprint.md`, `../Message-Gateway/docs/lark-cli-compatibility.md`.
- Platform Console: `../Platform-Console/README.md`, `../Platform-Console/STATUS.md`, `../Platform-Console/docs/information-architecture.md`.
- Context Hub: `../Context-Hub/AGENTS.md`, `../Context-Hub/STATUS.md`, `../Context-Hub/docs/context-hub.md`, `../Context-Hub/docs/implementation-blueprint.md`.
- Model Hub: `../Model-Hub/AGENTS.md`, `../Model-Hub/STATUS.md`, `../Model-Hub/docs/model-hub.md`, `../Model-Hub/docs/implementation-blueprint.md`.
- Capability Registry: `../Capability-Registry/AGENTS.md`, `../Capability-Registry/STATUS.md`, `../Capability-Registry/docs/capability-registry.md`, `../Capability-Registry/docs/implementation-blueprint.md`.
- Runtime Center: `../Runtime-Center/README.md`, `../Runtime-Center/STATUS.md`, `../Runtime-Center/docs/runtime-extension-blueprint.md`, `../Runtime-Center/docs/cordis-adoption.md`.
- Platform Contracts: `../Platform-Contracts/README.md`, `../Platform-Contracts/STATUS.md`, `../Platform-Contracts/docs/extensibility-contracts.md`.
- Platform Deployment: `../Platform-Deployment/README.md`, `../Platform-Deployment/STATUS.md`, `../Platform-Deployment/docs/operations.md`, `../Platform-Deployment/docs/release-handoff.md`.
- Reference projects: `../Reference-Projects/README.md`.
