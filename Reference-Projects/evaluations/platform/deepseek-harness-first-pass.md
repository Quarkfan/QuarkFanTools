# DeepSeek Harness Source Evaluation

## Scope

- Centers: Runtime Center, Platform Contracts, Capability Registry, Context Hub, Governance Center
- Capabilities: runtime composition, provider seams, session persistence, tool execution, subagents, extension lifecycle and verification
- Upstream: `deepseek-ai/deepseek-harness`
- URL: `https://github.com/deepseek-ai/deepseek-harness`
- Inspected commit: `47f943859bef60e4160492346772ded9b24f765a`
- Upstream version: `0.1.0-rc.5`
- License: MIT, with third-party notices maintained upstream
- Stability: developer preview; upstream explicitly warns that compatibility-breaking changes will occur

Inspected material includes `docs/architecture.md`, `docs/capability-seams.md`, the session, persistence, compaction, core, subagent, extension and defensive-pattern documents, `packages/core/*`, `packages/session/*`, `packages/compaction/*`, `packages/subagent/*`, `packages/bundle/base`, and `vendor/cordis/src`.

## What The Source Demonstrates

### Reversible composition

The runtime is assembled from ordered profiles, bundles and patches. Services, event listeners and registrations are lifecycle effects, so unloading a plugin removes the behavior it contributed. The useful lesson is not that QuarkfanTools should copy Cordis, but that every extension must have an explicit owner, scope and disposer.

### Definition, provider and consumer are different roles

The capability documentation models an extension point as three roles: service definition, service provider and consumer. This is a strong correction to registries that treat a manifest, executable implementation and one Bot binding as one object. QuarkfanTools should add a fourth control-plane role, binding, because providers and consumers are distributed across centers and tenants.

### The session log is the model-visible source of truth

`core/session` uses an append-only event stream. Model history, transcript, replay, persistence and telemetry are projections. The key invariant is that every model-visible input is reconstructable from durable events. Persistence adds contiguous sequence checks, format-version refusal, repair, write-behind batching and explicit flush behavior. This is materially stronger than Runtime Center's current mutable message array and fixed 100-message truncation.

### Tool exposure and tool execution share one scoped registry

The same scoped tool registration determines which schemas enter the prompt and which tools may execute. The guarded pipeline separates pre-execute, execute and post-execute stages, supports approvals and execution modes, and preserves deterministic result ordering. This avoids the security defect where a runtime adapter advertises one capability set but dispatches against another.

### Providers declare capabilities before work starts

Subagent providers expose static capabilities and reject unsupported options before starting. Continuation, activation and ownership remain in one manager rather than creating a second task state machine. QuarkfanTools should require provider descriptors and capability negotiation before accepting an execution.

### Compaction is a durable transformation, not deletion

Compaction has its own events and checkpoints. Source events remain attributable while projections can replace older model-visible ranges with summaries or pruned tool results. This maps well to a Runtime-owned session ledger plus CH-owned context processors and memories.

### The verification system is an architectural asset

The repository has 219 package directories and 821 test/spec/e2e files at the inspected commit. It uses contract suites, property tests, snapshot/replay modes, package invariants, generated catalogs, documentation checks, cross-platform gates and postmortems. The lesson is to make extension contracts executable and test every provider against the same suite.

## What We Should Adapt

1. A platform-wide Definition / Provider / Binding / Consumer model.
2. Versioned provider descriptors with static capabilities, dynamic probes and fail-loud negotiation.
3. A Runtime-owned append-only Session Event Ledger with projections.
4. One governed capability execution pipeline shared by every runtime provider.
5. Declarative Runtime Profiles whose resolved version is snapshotted into executions.
6. Reversible provider lifecycle: install, verify, canary, activate, drain, rollback and dispose.
7. Contract, replay, property, fault and lifecycle tests generated from public contracts.

## What We Should Not Copy

- Do not make the whole harness or a Cordis context a platform-wide dependency. The upstream is explicitly unstable and its in-process plugin model does not replace our center boundaries, network contracts or independent scaling.
- Do not split the platform into hundreds of deployable packages. Extension granularity should stay inside an owning center or isolated worker.
- Do not let arbitrary executable plugins share ambient process authority. CR package trust, Governance policy and Runtime isolation remain mandatory.
- Do not move knowledge, durable memory, model routing or channel routing into Runtime merely because the reference harness can host them as plugins.
- Do not copy source wholesale. Reuse small MIT-compatible implementation techniques only after a focused license and maintenance review.

## Center Landing Map

| Reference idea | QuarkfanTools owner |
| --- | --- |
| Shared contract definitions and event envelopes | Platform Contracts |
| Runtime provider registry, profile resolution and session ledger | Runtime Center |
| Capability definitions, provider packages and bindings | Capability Registry |
| Model-visible tool policy and approval | Runtime + Governance + CR |
| Context retrieval, summarization and memory promotion | Context Hub |
| Provider isolation, process/container lifecycle and workspaces | Runtime + Resource + Governance |
| Installation, canary, rollback and operational manifests | Platform Deployment |

## Cordis Integration Second Pass

The DeepSeek-scoped Core package is small enough to adopt independently: version `4.0.1`, 32 packed files, about 239 KB unpacked and two direct runtime dependencies. A local Runtime Center spike installed with zero reported npm vulnerabilities and verified logical scope isolation, dependency activation/deactivation and awaited cleanup.

The package is not yet a low-risk ambient dependency. The public repository was created on 2026-08-13, has no public tags or GitHub releases, package metadata exposes no `gitHead` or provenance attestation, and both Harness and upstream Cordis warn about unstable APIs. The npm package does carry registry integrity/signature data, is maintained by two accounts including a `deepseek.com` identity, and its release workflow packs, verifies installation, separates publishing credentials and publishes the already-tested artifact. The imported history shows a multi-person engineering effort rather than a new implementation.

The spike also found that `FiberState` is declared as a `const enum` but is not a runtime export. This is manageable behind an adapter and is evidence against direct business-code imports.

## Recommendation

Adopt `@deepseek-ai/cordis` Core as a controlled Runtime-internal composition kernel, exact-pinned and hidden behind the QuarkfanTools Plugin SDK. Do not adopt production loader/HMR initially. Never treat its logical scope as a security boundary. Evaluate the complete DeepSeek Harness separately as an isolated Runtime Provider.

The immediate redesign should remove hard-coded runtime kinds, replace mutable session history with a versioned event ledger, centralize governed capability execution, and introduce provider descriptors plus runtime profiles. Existing adapters remain usable through compatibility wrappers during migration.

Confidence: high for controlled Core adoption; medium for long-term API stability; low for running untrusted plugins in-process, which is explicitly rejected.
