# Model Hub First Pass: LiteLLM / Ollama / vLLM / Open WebUI / Dify

## Scope

- Center: Model Hub（MH）
- Capability: provider abstraction, deployment routing, fallback, quota, spend, credential isolation, local model management, OpenAI-compatible serving, multimodal model capabilities, model configuration UI
- Upstream projects:
  - LiteLLM: `https://github.com/BerriAI/litellm.git`
  - Ollama: `https://github.com/ollama/ollama.git`
  - vLLM: `https://github.com/vllm-project/vllm.git`
  - Open WebUI: `https://github.com/open-webui/open-webui.git`
  - Dify: `https://github.com/langgenius/dify.git`
- Inspected commits:
  - LiteLLM: `3e9e520`
  - Ollama: `82f905c`
  - vLLM: `83762b7`
  - Open WebUI: `ecd48e2`
  - Dify: `6e5ba18d`
- Local source paths:
  - `Reference-Projects/sources/litellm`
  - `Reference-Projects/sources/ollama`
  - `Reference-Projects/sources/vllm-lite`
  - `Reference-Projects/sources/open-webui`
  - `Reference-Projects/sources/dify`

This is a first-pass source-level evaluation. It is not a decision to depend on these projects as-is.

Note: the first `vllm` clone failed due to a partial network transfer, so `vllm-lite` is the valid inspected clone.

## Useful Models

### LiteLLM

Inspected paths:

- `litellm/router.py`
- `litellm/types/router.py`
- `litellm/budget_manager.py`
- `litellm/proxy/_types.py`
- `litellm/proxy/read_model_list.py`
- `litellm/proxy/auth/user_api_key_auth.py`
- `litellm/proxy/auth/model_checks.py`
- `litellm/proxy/auth/budget_throttle.py`
- `litellm/proxy/common_utils/model_listing_utils.py`
- `litellm/proxy/common_utils/key_rotation_manager.py`
- `litellm/proxy/spend_tracking/spend_management_endpoints.py`
- `litellm/proxy/spend_tracking/spend_tracking_utils.py`
- `litellm/proxy/management_endpoints/key_management_endpoints.py`
- `litellm/proxy/management_endpoints/model_management_endpoints.py`
- `litellm/proxy/management_endpoints/fallback_management_endpoints.py`
- `litellm/proxy/management_endpoints/budget_management_endpoints.py`
- `tests/router_unit_tests/`
- `tests/proxy_unit_tests/`

Useful ideas:

- `Router` uses `model_list` as the central deployment list. Each deployment has a public `model_name` and provider-specific `litellm_params`. This maps well to `ModelDeployment` under a logical `ModelProvider` / `ModelGroup`.
- Routing strategies are explicit and configurable: simple shuffle, least busy, usage-based, latency-based, cost-based and grouped routing. QuarkfanTools should model `ModelRoutingPolicy` separately from provider config.
- Fallbacks are first-class: generic fallbacks, context-window fallbacks, content-policy fallbacks, retry policy by exception class, max fallbacks, allowed fails, cooldown time and health/cooldown cache. This is the strongest reference for our `ModelFallbackPolicy`.
- `RetryPolicy`, `AllowedFailsPolicy`, cooldown cache and health cache show that "failed provider switch" should be stateful, not just a one-off `try next`.
- Router tests are as valuable as code: they cover weighted failover, retry backoff, exception redaction, prompt caching, deployment addition, model cost isolation, streaming fallback and cooldown handlers.
- Proxy management endpoints split models, keys, budgets, usage, router settings and fallbacks. This is a useful admin surface reference, even if QuarkfanTools P0 remains local-only.
- `BudgetManager` and spend tracking show a simple shape for user/team/model cost records, budget duration and reset. QuarkfanTools can start local and later lift to central accounting.
- LiteLLM makes provider support broad via provider params and cost metadata. We should borrow the provider abstraction and cost model, not the full proxy product.

Borrow carefully:

- LiteLLM is a full proxy/gateway with server, DB, Redis, management UI, auth and enterprise concerns. QuarkfanTools P0 should not require a running LiteLLM server.
- Do not leak `litellm_params` directly across QuarkfanTools center boundaries; translate into our DTOs.
- Virtual keys are a good model for scoped model credentials, but QuarkfanTools must preserve macOS local secret storage and Bot/provider isolation.
- Spend tracking should avoid logging raw prompts, user secrets or customer data.

### Ollama

Inspected paths:

- `api/types.go`
- `api/client.go`
- `server/routes.go`
- `server/prompt.go`
- `server/sched.go`
- `server/model.go`
- `openai/openai.go`
- `openai/responses.go`
- `discover/`
- `llm/`
- `runner/`
- `integration/`

Useful ideas:

- `GenerateRequest`, `ChatRequest`, `EmbedRequest`, `ListResponse`, `ShowRequest`, `ProcessResponse` and `Version` are clean local-model API shapes. They map to `LocalModelProvider`, `LocalModel`, `LocalModelProcess` and `ModelHealthCheck`.
- API endpoints cover pull, push, create, tags/list, ps/running models, delete, show, embed, version and status. QuarkfanTools local model provider should expose similar list/status/pull/delete/probe operations.
- `KeepAlive` is an important local runtime concept: model loading and unloading must be visible and configurable instead of hidden behind a generic provider.
- Ollama's OpenAI-compatible conversion layer is useful for local models behind an OpenAI-like interface, but QuarkfanTools still needs to know it is local for resource monitoring and UI.
- Hardware discovery and runner separation are valuable future references for CPU/GPU capability probing, especially when the product later moves beyond macOS.

Borrow carefully:

- Ollama is itself a local model runtime and registry client. QuarkfanTools should integrate with it as a provider first, not embed or reimplement model serving.
- Ollama prompt rendering and context shifting belong to runtime/model adapter behavior, not general MH policy.
- Pulling models can be large, slow and user-visible; model center needs progress, cancel, disk checks and cleanup hooks before exposing this broadly.

### vLLM

Inspected paths:

- `vllm/entrypoints/openai/chat_completion/protocol.py`
- `vllm/entrypoints/openai/chat_completion/serving.py`
- `vllm/entrypoints/openai/models/protocol.py`
- `vllm/entrypoints/openai/models/serving.py`
- `vllm/config/scheduler.py`
- `vllm/config/model.py`
- `vllm/config/cache.py`
- `vllm/v1/metrics/`
- `tests/entrypoints/openai/`
- `tests/v1/core/test_scheduler.py`
- `tests/v1/metrics/`

Useful ideas:

- vLLM has strong OpenAI-compatible protocol models for chat completion, streaming chunks, usage, tool calls, reasoning fields and per-request metrics. These are useful for our `ModelInvocationTrace`.
- Scheduler config exposes capacity concepts such as max batched tokens, max sequences, chunked prefill, priority policy, stream interval, KV cache headroom and async scheduling. These map to future `SelfHostedModelDeployment` capacity metadata.
- vLLM separates model paths, LoRA module paths, serving protocol and engine/scheduler. QuarkfanTools should keep provider, deployment and runtime process distinct.
- Tests around OpenAI entrypoints, tool calls, schema, scheduler and metrics are valuable references for contract tests if we support self-hosted endpoints.

Borrow carefully:

- vLLM is a GPU inference server. It is not a desktop P0 dependency and is not suitable for bundled macOS app delivery.
- Its internal scheduler and engine types should not leak into QuarkfanTools DTOs.
- Treat vLLM as a reference for self-hosted deployment metadata and health/metrics, not as the main model center implementation.

### Open WebUI

Inspected paths:

- `backend/open_webui/models/models.py`
- `backend/open_webui/routers/models.py`
- `backend/open_webui/routers/openai.py`
- `backend/open_webui/routers/ollama.py`
- `backend/open_webui/utils/models.py`
- `backend/open_webui/utils/access_control/`
- `backend/open_webui/models/access_grants.py`
- `backend/open_webui/models/config.py`

Useful ideas:

- `Model` stores a workspace model entry with `id`, `base_model_id`, display name, params, metadata, active flag and access grants. This is a good UI-facing model record.
- `ModelMeta.capabilities`, description and tags are useful for model discovery and operator UX.
- Access grants are attached to model records. QuarkfanTools should have Bot/user/provider-scope access checks before model selection.
- `routers/openai.py` proxies OpenAI-compatible upstreams, handles custom headers, auth modes and model list fetching. This is useful for provider connection config and probe behavior.
- It distinguishes base models from user/workspace wrappers. QuarkfanTools should similarly separate `ModelDeployment` from a user-facing `ModelAlias` or `ModelProfile`.

Borrow carefully:

- Open WebUI combines chat product UX, workspace models, access grants and provider proxying. QuarkfanTools should borrow UI/config models but keep runtime/session out of MH.
- Forwarding user info headers and cookies is product-specific and should go through governance/security.
- Direct pass-through can bypass accounting unless wrapped by MH trace and usage recording.

### Dify

Inspected paths:

- `api/core/entities/model_entities.py`
- `api/core/entities/provider_entities.py`
- `api/core/entities/provider_configuration.py`
- `api/core/model_manager.py`
- `api/core/provider_manager.py`
- `api/core/app/llm/quota.py`
- `api/core/app/llm/model_access.py`
- `api/core/plugin/impl/model_runtime.py`
- `api/core/plugin/impl/model_runtime_factory.py`
- `api/tests/unit_tests/core/test_model_manager.py`
- `api/tests/unit_tests/core/entities/test_entities_model_entities.py`
- `api/tests/unit_tests/core/entities/test_entities_provider_configuration.py`

Useful ideas:

- `ModelStatus` has concrete user-facing states: active, no-configure, quota-exceeded, no-permission, disabled and credential-removed. This is exactly the kind of status the model center UI needs.
- Provider configuration separates system configuration, custom provider credentials, per-model credentials, quota configuration and load balancing settings.
- `ModelSettings` includes enabled and load-balancing configs per model. This maps to `ModelDeployment` plus `ModelRoutingPolicy`.
- `ModelInstance` resolves credentials per tenant/provider/model and only then invokes LLM/embedding/rerank/moderation/speech/TTS model types. QuarkfanTools should support model purpose/capability, not assume every model is chat.
- Dify's `LBModelManager` does round-robin over credential configs and cools down failed credentials based on error class. This is a simpler P0 reference than LiteLLM's full router.
- Provider/model entity tests are useful for validating DTO semantics and migration compatibility.

Borrow carefully:

- Dify is an application/workflow platform; do not copy app model config, tenant/app coupling or workflow runtime into MH.
- Its plugin model runtime is powerful but should belong to Tool/Capability or Runtime Center boundaries if adopted later.
- Tenant concepts should be translated into local owner/Bot/workspace scope, not copied literally.

## Suggested QuarkfanTools Landing Model

P0 should define stable DTOs before selecting any heavy dependency:

```text
ModelProvider
ModelProviderConfig
ModelCredential
ModelCredentialRef
ModelCapability
ModelDeployment
ModelAlias
ModelProfile
ModelRoutingPolicy
ModelFallbackPolicy
ModelRetryPolicy
ModelHealthCheck
ModelUsageRecord
ModelCostRecord
ModelQuota
ModelBudget
ModelInvocationTrace
ModelCapabilityExport
LocalModelProvider
LocalModelProcess
SelfHostedModelDeployment
```

P0 interfaces:

```ts
interface ModelHub {
  listProviders(request: ModelProviderListRequest): Promise<ModelProviderSummary[]>;
  listModels(request: ModelListRequest): Promise<ModelCandidate[]>;
  selectModel(request: ModelSelectRequest): Promise<ModelSelection>;
  recordUsage(record: ModelUsageRecord): Promise<void>;
  probeDeployment(request: ModelProbeRequest): Promise<ModelHealthCheck>;
}

interface ModelProviderAdapter {
  providerId: string;
  listModels(request: ProviderModelListRequest): Promise<ModelDeployment[]>;
  probe(request: ProviderProbeRequest): Promise<ModelHealthCheck>;
  invoke?(request: ModelInvokeRequest): AsyncIterable<ModelInvocationEvent>;
}

interface LocalModelProviderAdapter extends ModelProviderAdapter {
  listLocalModels(request: LocalModelListRequest): Promise<LocalModelSummary[]>;
  pullModel(request: LocalModelPullRequest): AsyncIterable<LocalModelPullEvent>;
  deleteModel(request: LocalModelDeleteRequest): Promise<void>;
  listRunning(request: LocalModelProcessRequest): Promise<LocalModelProcess[]>;
}
```

P0 selection request should include:

- caller: runtime / CH / tool / scheduler
- purpose: chat, agent, embedding, rerank, moderation, speech-to-text, TTS, image, vision
- botId / ownerId / workspace scope
- required capabilities: streaming, tools, JSON/schema, vision, reasoning, context length, local-only
- policy: round-robin or random for multiple deployments
- fallback enabled flag
- budget and quota context
- trace/correlation IDs

P0 selection result should include:

- selected provider, deployment, model and credentialRef
- ordered attempt plan, including fallback candidates
- per-attempt timeout, retry and cooldown metadata
- capability summary
- price/cost estimate if available
- audit refs and policy obligations

## Initial Design Recommendations

1. Treat LiteLLM as the main MH reference for provider abstraction, router, fallback, cooldown, retry, budget, spend and management API shape.
2. Treat Dify as the best simpler reference for provider/model status, per-model load balancing credentials and model type separation.
3. Treat Open WebUI as the best UI-facing reference for model entries, base model wrapping, capabilities metadata and access grants.
4. Treat Ollama as the best local model provider reference. Integrate it through provider adapter first; do not embed its runtime.
5. Treat vLLM as a future self-hosted deployment reference. It should influence `SelfHostedModelDeployment`, metrics and OpenAI-compatible serving tests, not desktop P0 packaging.
6. MH should select and account for models; Runtime Center still executes agent sessions and decides how to use the selected model in a specific runtime.
7. MH should not build prompts, inject tools, manage CH records or hold MG message state.
8. Provider credential storage must use scoped references. Raw API keys should not appear in model selection results, traces, diagnostics or UI logs.

## Proposed P0 Build Order

1. Contract doc for `ModelProvider`, `ModelDeployment`, `ModelCapability`, `ModelRoutingPolicy`, `ModelFallbackPolicy`, `ModelUsageRecord` and `ModelInvocationTrace`.
2. Local provider registry for OpenAI-compatible providers, Anthropic, Ollama and custom endpoint.
3. Provider status/probe and model list refresh.
4. Selection policy: manual default, round-robin, random.
5. Failure switch: retry/fallback attempt plan with cooldown state.
6. Usage recording: tokens, latency, provider, model, success/failure, estimated cost.
7. UI split from system settings: provider management, model list, credential status, routing policy, fallback toggle and health logs.
8. Optional local Ollama adapter: list, status, ps/running, pull progress, delete.
9. Contract tests modeled after LiteLLM router tests and Dify provider entity tests.

## Open Questions

- Should P0 call providers through LiteLLM library, direct SDK adapters, or OpenAI-compatible HTTP adapters?
- Should LiteLLM become an optional provider adapter later, or remain only a reference?
- How much cost tracking is needed in local desktop before central billing exists?
- Should Ollama model pull/delete be exposed in P0, or only detect/list/use existing local models?
- Should model selection return an executable adapter handle, or only an attempt plan for Runtime Center?
- How should Claude Code SDK runtime model settings map to MH without breaking existing behavior?

## Recommendation

Start with QuarkfanTools-owned DTOs and adapters. Do not require a LiteLLM proxy or vLLM server in P0. Build direct provider adapters for current desktop needs, but keep the DTOs close enough to LiteLLM's router concepts that a LiteLLM-backed adapter can be added later. Broaden the next pass with diffusion/image/audio references such as ComfyUI, Stable Diffusion WebUI, InvokeAI and Diffusers.

Confidence: high for LiteLLM as the main reference and DTO direction; medium for dependency strategy until we test packaging and current runtime integration constraints.
