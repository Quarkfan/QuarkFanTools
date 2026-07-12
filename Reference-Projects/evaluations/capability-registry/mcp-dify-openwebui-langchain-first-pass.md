# Capability Registry First Pass: MCP, Dify, Open WebUI, LangChain

- Date: 2026-07-12
- Center: Capability Registry（CR，能力注册中心）
- Capability: capability manifest, provider adapter, package lifecycle, binding resolution, diagnostics

## Inspected Sources

| Project | Local path | Commit | Why it matters |
|---|---|---:|---|
| MCP TypeScript SDK | `Reference-Projects/sources/mcp-typescript-sdk` | `95d28cb` | Protocol, transport, client/server packages, typed schema boundary |
| MCP Python SDK | `Reference-Projects/sources/mcp-python-sdk-lite` | `1216c53` | Tool/resource/prompt managers, client session, discovery and transport |
| MCP Servers | `Reference-Projects/sources/mcp-servers` | `d31124c` | Real server examples and per-server package layout |
| Dify | `Reference-Projects/sources/dify` | `6e5ba18d` | Plugin manifest, plugin sources, marketplace/GitHub/local package lifecycle |
| Open WebUI | `Reference-Projects/sources/open-webui` | `ecd48e2` | Function and pipeline models, valves, active/global flags, admin APIs |
| LangChain | `Reference-Projects/sources/langchain-lite` | `a8fd0da` | Structured tool interface, tool conversion, retriever-as-tool pattern |

Composio, n8n and Pipedream were attempted as light clones. Network interruptions prevented reliable checkout during this pass, so they remain secondary references until a later successful source read.

## MCP Findings

Inspected paths:

- `mcp-python-sdk-lite/src/mcp/server/mcpserver/tools/tool_manager.py`
- `mcp-python-sdk-lite/src/mcp/server/mcpserver/resources/resource_manager.py`
- `mcp-python-sdk-lite/src/mcp/server/mcpserver/prompts/manager.py`
- `mcp-python-sdk-lite/src/mcp/client/session.py`
- `mcp-typescript-sdk/packages/core-internal/src/types/`
- `mcp-typescript-sdk/packages/server/`
- `mcp-typescript-sdk/packages/client/`
- `mcp-servers/src/*`

Useful design points:

- MCP separates tools, resources and prompts at manager level. CR should preserve this distinction as `mcp.tool`, `mcp.resource` and `mcp.prompt`, not collapse everything into `tool`.
- Managers support list/get/add/remove/call or render operations. CR should expose register/list/inspect/diagnose/resolve and let execution live elsewhere.
- Resource templates and URI matching are important for future file/cache/doc capabilities.
- Client session handles discovery, capability negotiation, protocol versions, subscriptions, sampling, elicitation and transports. CR needs provider diagnostics that show transport, discovery and version problems clearly.
- MCP server examples show that each server package has its own dependency/runtime/security posture. CR should register server-level risk and per-capability risk.

Unsuitable assumptions:

- MCP is not the whole CR. Skill, executable, workflow, custom app, model export and context export must normalize into CR-owned DTOs.
- A discovered MCP tool must not become trusted or enabled automatically.
- Protocol types should not leak directly across QuarkfanTools center boundaries.

## Dify Findings

Inspected paths:

- `dify/web/app/components/plugins/types.ts`
- `dify/web/service/plugins.ts`
- `dify/web/app/components/plugins/plugin-permissions.ts`
- `dify/docker/envs/core-services/plugin-daemon.env.example`

Useful design points:

- Plugin declaration covers category, source, version, author, labels, description, endpoint, tool, datasource, model, agent strategy and trigger.
- Plugin source includes marketplace, GitHub, local package and debugging remote. CR can reuse this source taxonomy.
- Package lifecycle is asynchronous: upload/install/update/uninstall returns task/status style data. CR should treat installation and upgrade as operations with observable status.
- Credential and parameter schemas are first-class. CR should preserve `configSchema` and `permissionRequirement`.

Unsuitable assumptions:

- Dify couples plugins to its workspace/app/tenant model. CR should keep package lifecycle but avoid app coupling.
- Dify plugin runtime is broader than CR's registry responsibility; execution belongs to Runtime Center or System/Orchestration Center.

## Open WebUI Findings

Inspected paths:

- `open-webui/backend/open_webui/models/functions.py`
- `open-webui/backend/open_webui/routers/functions.py`
- `open-webui/backend/open_webui/routers/pipelines.py`

Useful design points:

- Function record is compact: id, user_id, name, type, content, meta, valves, active/global flags, timestamps.
- `valves` are a useful concept for user-editable capability configuration.
- CRUD, import-from-url, sync, toggle, global toggle and valve schema/update endpoints form a strong admin reference.
- Pipelines support inlet/outlet filters, target matching and priority ordering. This is useful for future CR pipeline capabilities, but actual chaining belongs to orchestration/runtime.

Unsuitable assumptions:

- Storing arbitrary Python source as capability content is not safe enough for QuarkfanTools without governance, sandbox and diagnostics.
- Global enablement should become scoped enablement by Bot/account/workspace instead of system-wide default.

## LangChain Findings

Inspected paths:

- `langchain-lite/libs/core/langchain_core/tools/base.py`
- `langchain-lite/libs/core/langchain_core/tools/structured.py`
- `langchain-lite/libs/core/langchain_core/tools/simple.py`
- `langchain-lite/libs/core/langchain_core/tools/convert.py`
- `langchain-lite/libs/core/langchain_core/tools/retriever.py`

Useful design points:

- Tool interfaces distinguish simple tools and structured tools.
- Conversion/rendering utilities show how tool schemas become model-callable definitions.
- Retriever-as-tool is a useful pattern, but QuarkfanTools should treat it as a Context Hub export registered in CR.

Unsuitable assumptions:

- LangChain classes should not become CR platform DTOs.
- Agent execution and tool invocation loops are runtime responsibilities, not CR responsibilities.

## Suggested CR Landing Model

CR should begin with QuarkfanTools-owned DTOs:

```text
CapabilityManifest
CapabilityPackage
CapabilityProviderAdapter
CapabilityBinding
CapabilityDiagnostic
CapabilityInstallRecord
CapabilityConflict
CapabilityRuntimeRequirement
CapabilityPermissionRequirement
CapabilityRiskProfile
CapabilityConfigSchema
```

Initial provider adapters:

```text
SkillProviderAdapter
McpProviderAdapter
ExecutableProviderAdapter
ModelExportProviderAdapter
ContextExportProviderAdapter
```

Initial capability types:

```text
skill
mcp.tool
mcp.resource
mcp.prompt
executable
model-export
context-export
```

Later capability types:

```text
workflow
pipeline
custom-app
external-connector.action
external-connector.trigger
ui-extension
```

## Boundary Decisions

1. CR registers and resolves capabilities; it does not execute them.
2. CR stores permission requirements and risk; Governance and Security Center decides authorization.
3. CR can register model/context exports, but MH and CH own the actual invocation.
4. CR should include diagnostics in every binding response.
5. Same Skill/package import must support conflict choices: keep old, use new, edit manually.

## P0 Recommendation

Start with local-first CR inside the standalone app integration path, but keep this repository as the independent module source of truth. Implement Skill, MCP and executable adapters first. Defer marketplace and external SaaS connector catalogs until local capability registration, scoped enablement, governance precheck and diagnostics are stable.
