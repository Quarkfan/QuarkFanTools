# Changelog

This file tracks parent-workspace changes only. Product release history for the macOS standalone app lives in `QuarkfanTools-Single/CHANGELOG.md`.

## Unreleased

- Converted the root repository into a parent workspace for independent modules.
- Added `Message-Gateway/` as a submodule pointing to `git@github.com:Quarkfan/Message-Gateway.git`.
- Added `QuarkfanTools-Single/` as a submodule pointing to `git@github.com:Quarkfan/QuarkfanTools-Single.git`.
- Moved the standalone app source of record to `QuarkfanTools-Single/`, preserving full history and all release tags through `v2.2.6`.
- Removed standalone app source, build configuration, bundled skills, Electron code, and old product docs from the parent root.
- Added new-session handoff navigation for the parent workspace, Message Gateway, standalone app, and reference-project workspace.
- Renamed the former Knowledge Center concept to Context Hub (CH), adding a first design for knowledge, RAG, short/mid/long-term memory, freshness, and context governance.
- Split Context Hub into `Context-Hub/` as an independent module directory with its own handoff docs and future remote `git@github.com:Quarkfan/Context-Hub.git`.
- Added Context Hub implementation blueprint covering P0 contracts, storage, APIs, memory governance, retrieval, cleanup, tests, and migration.
- Added first-pass Model Center source-level evaluation for LiteLLM, Ollama, vLLM, Open WebUI, and Dify.
