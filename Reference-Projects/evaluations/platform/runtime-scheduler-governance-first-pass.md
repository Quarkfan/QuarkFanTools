# Runtime, Scheduler, Governance and Observability References

## Scope

- pg-boss: `55ee32f66f0bf683ff823c0ad8be2056dbc91ce4`
- DBOS TypeScript: `186558232f7f87745f57c2f7ec1d03db054ab98a`
- OpenTelemetry JS: `b2ffd97e5d7b04f25525b746eeb84aefa13990ec`
- Open Policy Agent: inspected local shallow clone on 2026-08-15
- OpenAI Agents JS: `0e384ceed488647a97dd3814dadc99b763c14a4d`
- LangGraph JS: `f6b41bf4861322e380e02f746285496e84b0f96b`
- Mastra: `1275be5a05be1e5d2f8f49d8ddf3a41f8c3e2e81`
- QuarkfanTools-Single Claude Agent SDK runtime and workflow implementation

## Source-Level Findings

- pg-boss provides PostgreSQL-backed queue, cron, retry, dead-letter and worker lifecycle with a separately inspectable dashboard. It is the best resource fit for the initial 2C/4G host.
- DBOS demonstrates durable workflow identity, replay, step boundaries and administrative recovery. Its full programming model is stronger than needed for the first release, but its idempotency and workflow history rules should shape Runtime/Scheduler contracts.
- OpenAI Agents exposes provider-independent run state, tool guardrails, MCP approval, sessions, usage and trace processors.
- LangGraph checkpointing and human-in-the-loop examples reinforce that pause/resume state must be a durable execution fact, not an in-memory callback.
- Mastra's separate Claude/OpenAI agent SDK adapters validate a runtime adapter boundary above provider/model routing.
- OPA's decision API and bundle model are useful for future policy distribution. Running OPA as a required sidecar in the first small deployment adds operational weight, so the first evaluator will implement the same input/decision contract behind an adapter.
- OpenTelemetry context propagation matches the platform envelope correlation/causation model and should be used rather than inventing another trace context.

## Adopt

- pg-boss as a dependency for durable queues and schedules.
- Durable execution IDs, idempotency keys, attempts, checkpoints, approval waits and replay-safe side effects.
- Runtime adapters for Claude Agent SDK, OpenAI Agents and a direct MH tool loop.
- OpenTelemetry propagation and semantic resource attributes.
- OPA-compatible policy input/output and a replaceable evaluator.

## Do Not Copy

- Do not adopt DBOS or LangGraph as the platform's public domain model.
- Do not let a runtime SDK own message routing, model credentials, capability authorization or context storage.
- Do not require an extra OPA process before there is a real policy bundle lifecycle.

## Recommendation

Build the Runtime and Scheduler around durable platform contracts, using pg-boss for infrastructure. Keep SDK-specific state behind adapters and keep governance decisions independently replayable and auditable.
