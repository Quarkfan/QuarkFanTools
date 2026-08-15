# Changelog

This file tracks parent-workspace changes only. Product release history for the macOS standalone app lives in `QuarkfanTools-Single/CHANGELOG.md`.

## Unreleased

- Implemented and deployed the 3.0 platform across shared contracts, eight centers, authenticated Console and Docker Compose deployment while preserving the 2.x/3.x architecture boundary.
- Added strong internal authentication, exact browser-state key validation, least-privilege container capabilities, bounded/redacted diagnostic ZIP collection and independent liveness/readiness/version visibility.
- Added verified online/quiesced PostgreSQL plus five-volume backups, guarded restore, fail-safe cross-center acceptance and disposable-account desktop/mobile Dashboard acceptance.
- Fixed Capability page rendering on internal HTTP deployments by removing the secure-context-only `crypto.randomUUID()` assumption.
- Added the 3.0 server readiness roadmap and clarified that MG / CH / MH / CR should move from blueprint contracts toward deployable service skeletons, while `QuarkfanTools-Single/` remains the separate 2.x line.
- Updated `QuarkfanTools-Single/` submodule to the `v2.2.15` standalone release commit and refreshed the parent status pointers.
- Converted the root repository into a parent workspace for independent modules.
- Added `Message-Gateway/` as a submodule pointing to `git@github.com:Quarkfan/Message-Gateway.git`.
- Added `QuarkfanTools-Single/` as a submodule pointing to `git@github.com:Quarkfan/QuarkfanTools-Single.git`.
- Moved the standalone app source of record to `QuarkfanTools-Single/`, preserving full history and all release tags through `v2.2.6`.
- Removed standalone app source, build configuration, bundled skills, Electron code, and old product docs from the parent root.
- Added new-session handoff navigation for the parent workspace, Message Gateway, standalone app, and reference-project workspace.
- Renamed the former Knowledge Center concept to Context Hub (CH), adding a first design for knowledge, RAG, short/mid/long-term memory, freshness, and context governance.
- Split Context Hub into `Context-Hub/` as an independent module directory with its own handoff docs and future remote `git@github.com:Quarkfan/Context-Hub.git`.
- Added Context Hub implementation blueprint covering P0 contracts, storage, APIs, memory governance, retrieval, cleanup, tests, and migration.
- Added first-pass Model Hub source-level evaluation for LiteLLM, Ollama, vLLM, Open WebUI, and Dify.
- Renamed the model center concept to Model Hub (MH), broadened it beyond LLMs, and split `Model-Hub/` as an independent module with design and implementation blueprint.
- Formally named the former tool/capability center as Capability Registry (CR), split `Capability-Registry/` as an independent module, and added first-pass source-level evaluation for MCP, Dify, Open WebUI, and LangChain.
- Clarified the roadmap boundary: `QuarkfanTools-Single/` is the 2.x standalone business line, while MG / CH / MH / CR are 3.0/5.0 platform blueprint modules and should not be forced into ordinary Single development.
