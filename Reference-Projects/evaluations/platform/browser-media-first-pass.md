# Browser and Media References

## Scope

- Microsoft Playwright: inspected local shallow clone on 2026-08-15
- browser-use: `6c73fced2f6d45a11d88622fe56365a5fe18f28b`
- ClipChat Engine: `71e035de90f984feba089deef7001ca702cc54da`
- QuarkfanTools-Single browser agent, Browser Workflow Kit and video-tools implementation

## Source-Level Findings

- Playwright provides the reliable primitive layer: browser/context/page lifecycle, storage state, downloads, traces, video and strict process cleanup.
- browser-use's session manager is a useful reference for CDP target/session recovery, persistent profiles, domain restrictions, authentication state, keepalive and recording. Its cloud-first recommendations and Python/Rust runtime should remain optional adapters.
- ClipChat provides a clean REST/MCP/job model for twenty FFmpeg operations, progress, retries, local/S3 storage and media metadata. Its BullMQ + Redis dependency is unnecessary for the first QuarkfanTools host, and `fluent-ffmpeg` is not selected for new core code.
- 2.x already has important governance semantics: invisible isolated browser by default, explicit visible-browser intent, Owner approval, authentication wait/continue, Browser Workflow Kit, screenshots/steps/trace/downloads and optional summary video.

## Adopt

- Playwright as the deterministic execution dependency and trace/storage-state implementation.
- A browser session is a durable governed resource with owner, workspace, mode, TTL, state and artifact references.
- Domain allow/deny policies, network/download quotas, one-session-per-key locking and stale-session recovery.
- ClipChat's operation catalog and async job API shape; direct FFmpeg argument arrays, ffprobe metadata and progress parsing.
- Media inputs and outputs are Resource Center references, never arbitrary host paths.

## Do Not Copy

- Do not run user Chrome profiles on the Linux server. Use isolated browser contexts or explicitly configured remote CDP workers.
- Do not allow an LLM to emit raw Playwright JavaScript or FFmpeg shell commands as the normal execution path.
- Do not report browser/video success until expected artifacts and final page/media assertions exist.
- Do not use Redis solely for media jobs while PostgreSQL queue infrastructure is already present.

## Recommendation

Publish Browser and Media as built-in capability providers in CR. Execute them in resource-limited workers through Scheduler, with Governance approval checkpoints and Resource-managed artifacts.
