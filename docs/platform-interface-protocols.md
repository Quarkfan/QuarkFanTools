# 平台中心交互接口协议

本文定义八个中心之间的交互协议。它不是一次性代码重构清单，而是后续拆接口、移动代码、设计 IPC、落测试和排障时的稳定契约。

相关中心边界见 [`platform-centers.md`](platform-centers.md)。本文只描述中心之间如何请求、响应、授权、审计和失败处理。

## 1. 设计目标

- 让消息、知识、模型、工具、运行时、资源、调度和治理之间通过明确协议协作。
- 让未来多 runtime、RAG、知识图谱、本地模型、工具市场、资源监控可以逐步接入，而不重写消息主流程。
- 让所有跨中心调用都有统一身份、来源、权限、关联 ID、失败语义和审计字段。
- 让 UI、日志、排障包和测试能复用同一套事件语义。

## 2. 通用协议信封

所有跨中心请求应使用同一类信封字段。具体 TypeScript 类型可以分阶段落地，但字段语义应稳定。

```ts
type PlatformCenter =
  | "message-gateway"
  | "knowledge"
  | "model"
  | "capability"
  | "runtime"
  | "resource"
  | "scheduler"
  | "governance";

interface PlatformEnvelope<TPayload> {
  protocolVersion: "2026-07-04";
  requestId: string;
  correlationId: string;
  causationId?: string;
  sourceCenter: PlatformCenter;
  targetCenter: PlatformCenter;
  intent: string;
  actor: PlatformActor;
  scope: PlatformScope;
  policy: PlatformPolicyContext;
  payload: TPayload;
  deadlines?: PlatformDeadlines;
  trace?: PlatformTraceContext;
}

interface PlatformActor {
  botId?: string;
  ownerOpenId?: string;
  userOpenId?: string;
  chatId?: string;
  provider?: "lark" | "wecom" | "dingtalk" | "system";
  trigger: "message" | "command" | "scheduled" | "manual" | "system" | "backfill" | "owner";
}

interface PlatformScope {
  conversationKey?: string;
  sessionId?: string;
  workspaceId?: string;
  taskId?: string;
  capabilityRef?: string;
  routeId?: string;
}

interface PlatformPolicyContext {
  requireGovernanceCheck: boolean;
  policyDecisionId?: string;
  auditRequired: boolean;
  sensitiveDataClass?: "none" | "user-content" | "credential" | "file" | "external";
}

interface PlatformDeadlines {
  timeoutMs?: number;
  notBefore?: string;
  deadlineAt?: string;
}

interface PlatformTraceContext {
  parentSpanId?: string;
  spanId?: string;
  logTags?: Record<string, string>;
}
```

### 2.1 字段约定

| 字段 | 约定 |
| --- | --- |
| `requestId` | 本次中心调用的唯一 ID，用于幂等和单次失败定位 |
| `correlationId` | 一条用户消息、定时任务或手工操作贯穿全链路的 ID |
| `causationId` | 当前请求由哪个上游请求触发 |
| `actor` | 谁触发了动作；必须能表达 Bot、用户、chat、provider 和 trigger |
| `scope` | 本次动作被限制在哪个会话、workspace、任务、能力或投递路由内 |
| `policy` | 是否需要治理判定、审计和敏感数据分类 |
| `deadlines` | 调度、运行时和工具执行的超时与截止时间 |
| `trace` | 用于日志、排障包和未来 OpenTelemetry 风格追踪 |

## 3. 通用响应与错误

跨中心响应统一返回 `PlatformResult`，不能只抛裸异常。底层异常可以保留在日志中，但跨中心边界必须有可展示、可审计的错误结构。

```ts
interface PlatformResult<TData> {
  ok: boolean;
  data?: TData;
  error?: PlatformError;
  events?: PlatformEvent[];
  audit?: PlatformAuditRecord[];
  resourceUsage?: PlatformResourceUsage;
}

interface PlatformError {
  code:
    | "UNAUTHORIZED"
    | "POLICY_BLOCKED"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INVALID_REQUEST"
    | "UNAVAILABLE"
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "UPSTREAM_FAILED"
    | "PARTIAL_FAILURE"
    | "UNSUPPORTED"
    | "INTERNAL";
  message: string;
  userMessage?: string;
  retryable: boolean;
  failedCenter: PlatformCenter;
  details?: Record<string, unknown>;
}

interface PlatformEvent {
  eventId: string;
  correlationId: string;
  center: PlatformCenter;
  type: string;
  level: "debug" | "info" | "success" | "warn" | "error";
  message: string;
  createdAt: string;
  data?: Record<string, unknown>;
}
```

错误对用户展示时优先使用 `userMessage`；排障包和开发日志可以保留 `details`，但必须经过资源中心脱敏。

## 4. 中心接口总览

| 接口 | 调用方 | 被调用方 | 用途 |
| --- | --- | --- | --- |
| `NormalizeInboundMessage` | IM Provider | Message Gateway（MG，消息网关） | 外部消息变成平台消息 |
| `CreateOrUpdateSink` | 调度 / 运行台 / 资源 / 测试 | Message Gateway（MG，消息网关） | 创建或更新内部逻辑消息流 |
| `ProduceSinkEvent` | 后方中心 / 测试 | Message Gateway（MG，消息网关） | 向 Sink 写入消息，触发后续 RouteBinding |
| `ConsumeSinkEvents` | 调度 / 运行台 / 资源 / 测试 | Message Gateway（MG，消息网关） | 基于 Cursor 消费 Sink Event Log |
| `ManageRouteBinding` | UI / 调度 / 治理 | Message Gateway（MG，消息网关） | 管理 Channel 与 Sink 之间的统一流转规则 |
| `QueryMessages` | 调度 / 运行台 / 资源 / 排障包 | Message Gateway（MG，消息网关） | 按 Bot、会话、时间窗口或 Cursor 查询消息 |
| `UpdateMessageCursor` | 调度 / Message Hub | Message Gateway（MG，消息网关） | 更新某 consumer 在某 Sink 上的受控消费进度 |
| `QueryDeliveries` | UI / 调度 / 排障包 | Message Gateway（MG，消息网关） | 查询投递状态、失败原因、重试和死信 |
| `QueryTrace` | UI / 资源 / 排障包 | Message Gateway（MG，消息网关） | 查询一条消息的完整流转链路 |
| `channels add/remove` | UI / 调度 | Message Gateway（MG，消息网关） | 添加或移除某个消息通道账号 |
| `channels list` | UI / 调度 / 资源 | Message Gateway（MG，消息网关） | 查看已安装、已配置、已启用的 channel 账号 |
| `channels status` | UI / 调度 / 资源 | Message Gateway（MG，消息网关） | 查看 channel 运行状态、心跳、错误和能力缺口 |
| `channels capabilities` | UI / 调度 / 资源 | Message Gateway（MG，消息网关） | 探测某个 channel 支持的能力 |
| `channels resolve` | UI / 调度 / 运行时 | Message Gateway（MG，消息网关） | 把人名、群名、频道名解析成平台内部 ID |
| `channels logs` | UI / 资源 / 排障包 | Message Gateway（MG，消息网关） | 查看按 Bot / channel / account / instance 切片的脱敏日志 |
| `CreateTaskFromMessage` | Message Gateway（MG，消息网关） | 调度与系统基础中心 | 入队并获得任务生命周期 |
| `CheckPolicy` | 任意中心 | 治理与安全中心 | 判断某动作是否允许 |
| `ResolveCapabilities` | 运行时 / 调度 | Capability Registry（CR，能力注册中心） | 获取当前 Bot 可见且可绑定的能力 |
| `RetrieveContext` | 运行时 / 工具 | Context Hub（CH，上下文中心） | 获取带来源、权限、freshness 和记忆层级的上下文结果；`RetrieveKnowledge` 作为兼容别名 |
| `SelectModel` | 运行时 / 后处理 / CH / 工具 | Model Hub（MH，模型枢纽） | 获取模型调用候选和失败切换计划 |
| `ListModelCapabilityExports` | CR / UI | Model Hub（MH，模型枢纽） | 获取可封装为能力的模型能力 |
| `RunAgent` | 调度 / MG | 运行时中心 | 执行一次 Agent 任务 |
| `RunCapability` | 运行时 / 调度 / 命令 | Capability Registry（CR，能力注册中心） | 解析 Skill、MCP、套件、Workflow 或应用的能力绑定；实际执行由运行时或编排中心完成 |
| `MaterializeResource` | CH / 运行时 / 工具 | 资源中心 | 物化缓存文件、workspace 文件或诊断附件 |
| `RecordAudit` | 任意中心 | 治理与安全中心 / 资源中心 | 写入授权、能力执行和敏感数据审计 |
| `DeliverResult` | MG / 工具 | Message Gateway（MG，消息网关） | 把最终结果或受控投递发回 IM |
| `ExportDiagnostics` | UI / 用户 | 资源中心 | 生成脱敏排障包 |

## 5. 核心请求协议

### 5.1 MG 协议

Message Gateway（MG，消息网关）的专门设计见 [`message-gateway.md`](message-gateway.md)。本节只保留跨中心协议摘要。

MG 的接口应围绕五个原语闭环设计：接入不同消息源、统一消息格式、识别发送人/群/会话/账号、把消息送进正确订阅路径、把输出重新格式化并投递到指定通道。

MG 内部以六个核心模块承载这些接口：Channel Registry、Account Registry、Inbound Pipeline、Routing Engine、Message Manager、Outbound Pipeline。Message Manager 内部再拆为 Message Hub 和 Message Store：Hub 是以 Channel、Sink、RouteBinding 为核心的通用消息中枢，负责信息交换、Sink Event Log、Delivery、Trace、Loop Guard 和策略编排；Store 负责消息事实、历史、Cursor、去重和受控资源引用。数据流以 MG 为中心：channel 进入 MG，MG 向后方服务投递、发布订阅或响应查询，同时通过 admin 管理面向控制面提供 `channels *` 能力。

每个通道适配器至少拆成以下模块：Account Manager、Inbound Receiver、Message Normalizer、Access Control、Target Resolver、Capability Provider、Outbound Sender、Formatter、Health Probe / Logs。管理面必须提供 `channels add/remove/list/status/capabilities/resolve/logs`，让 UI、调度中心、资源中心和排障包能看见当前通道是否可用、缺什么权限、最近错在哪里。

```ts
interface Attachment {
  attachmentId: string;
  kind: "image" | "file" | "audio" | "video" | "link" | "unknown";
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  resourceRef?: string;
}

interface InboundMessage {
  messageId: string;
  eventId?: string;
  channel: string;
  accountId: string;
  channelInstanceId: string;
  botId: string;
  sourceBotId?: string;
  conversationId: string;
  conversationType: "dm" | "group" | "channel" | "thread";
  threadId?: string;
  parentMessageId?: string;
  senderId: string;
  senderName?: string;
  senderType?: "user" | "bot" | "system" | "unknown";
  mentionedBotIds: string[];
  text?: string;
  attachments?: Attachment[];
  timestamp: number;
  receivedAt: string; // MG receive time, ISO string
  rawRef?: string;
}

interface RouteMessageRequest {
  message: InboundMessage;
  routingMode: "strict-mention" | "private" | "subscription" | "history-query";
}

interface RouteMessageResult {
  targetBotId?: string;
  conversationKey?: string;
  action: "ignore" | "publish" | "requires-policy-decision";
  reason?: string;
  deliveryContextId?: string;
}

type MessageSinkKind =
  | "inbound"
  | "outbound"
  | "internal"
  | "audit"
  | "dead_letter";

interface MessageSink {
  sinkId: string;
  name: string;
  kind: MessageSinkKind;
  source: "message" | "event" | "command";
  botId?: string;
  channel?: string;
  accountId?: string;
  conversationId?: string;
  filter: MessageQueryFilter;
  deliveryMode: "push" | "pull" | "both";
  status: "active" | "paused" | "failed";
}

type HubEndpointType = "channel" | "sink";
type HubDirection = "inbound" | "outbound" | "internal" | "bridge";

interface RouteBinding {
  bindingId: string;
  sourceType: HubEndpointType;
  sourceId: string;
  targetType: HubEndpointType;
  targetId: string | "origin";
  direction: HubDirection;
  filter?: MessageQueryFilter & {
    channelAccountIds?: string[];
    externalConversationIds?: string[];
    messageTypes?: string[];
    keywords?: string[];
    metadataRules?: Record<string, unknown>;
  };
  transform?: {
    normalizer?: string;
    formatter?: string;
    mappingRules?: Record<string, unknown>;
  };
  delivery?: {
    mode: "sync" | "async";
    retryPolicy?: string;
    deadLetterSinkId?: string;
    rateLimitPolicy?: string;
    maxHops?: number;
    allowLoop?: boolean;
  };
  priority: number;
  enabled: boolean;
}

interface MessageQuery {
  queryId: string;
  botId: string;
  channel?: string;
  accountId?: string;
  conversationId?: string;
  cursor?: MessageCursor;
  since?: string;
  until?: string;
  limit: number;
  filter?: MessageQueryFilter;
}

interface MessageCursor {
  cursorId: string;
  sinkId: string;
  consumerId: string;
  cursorType: "offset" | "timestamp" | "message_id";
  position: string;
  lastMessageId?: string;
  lastConsumedAt?: string;
  status: "active" | "paused" | "expired";
  updatedAt: string;
}

interface MessageQueryFilter {
  conversationType?: InboundMessage["conversationType"];
  senderId?: string;
  status?: Array<"ignored" | "queued" | "processing" | "succeeded" | "failed" | "no-reply">;
  routeReason?: string[];
  hasAttachments?: boolean;
  textContains?: string;
}

interface DeliveryRecord {
  deliveryId: string;
  messageId: string;
  routeBindingId?: string;
  source: { type: HubEndpointType; id: string };
  target: {
    type: HubEndpointType;
    id: string;
    channelAccountId?: string;
    externalConversationId?: string;
  };
  status:
    | "pending"
    | "sending"
    | "sent"
    | "failed"
    | "retrying"
    | "dead_lettered"
    | "loop_blocked";
  retryCount: number;
  nextRetryAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface MessageTrace {
  traceId: string;
  rootMessageId?: string;
  parentMessageId?: string;
  correlationId?: string;
  inboundMessageId?: string;
  hops: Array<{ type: HubEndpointType; id: string; at: number }>;
  maxHops: number;
}

interface ChannelInstanceSummary {
  channel: string;
  instanceId: string;
  botId: string;
  accountLabel?: string;
  status: "stopped" | "starting" | "connected" | "reconnecting" | "failed";
  capabilities: ChannelCapabilitySummary;
  lastHeartbeatAt?: string;
  lastError?: PlatformError;
}

interface ChannelAccountRequest {
  channel: string;
  botId: string;
  accountId?: string;
  profile?: string;
  homeDir?: string;
  credentialsRef?: string;
}

interface ChannelLogsRequest {
  channel?: string;
  accountId?: string;
  instanceId?: string;
  botId?: string;
  since?: string;
  limit?: number;
}

interface ChannelResolveRequest {
  channel: string;
  accountId: string;
  botId: string;
  query: string;
  targetType: "user" | "group" | "channel" | "chat" | "thread" | "message";
}

interface ChannelProbeResult {
  instanceId: string;
  ok: boolean;
  checkedAt: string;
  checks: Array<{
    name: string;
    ok: boolean;
    message?: string;
    error?: PlatformError;
  }>;
}
```

规则：

- 群聊 mention、sender、chat 等只作为标准化消息事实；上下文免艾特是否进入 Agent 职责判断由调度中心和治理中心决定。
- Message Gateway（MG，消息网关）不调用模型、不读取知识、不执行工具，也不创建业务处理队列。
- MG 提供被动获取和主动获取原语：被动获取通过 Message Hub 的 Sink Event Log 发布消息流；主动获取通过 Message Store 的 Query / Cursor 按游标查询历史、按时间窗口拉取、定时或周期订阅触发增量拉取。
- Sink 是内部逻辑消息流，不是具体订阅者、业务模块或任务队列；Query 是主动读取，不改变消息处理状态；Cursor 只表示某个 consumer 在某个 Sink 上消费到哪里。
- RouteBinding 是唯一流转规则，统一表达 `Channel -> Sink`、`Sink -> Channel`、`Sink -> Sink` 和 `Channel -> Channel`；Channel 不允许直接调用另一个 Channel，必须经过 Gateway、Message Store、RouteBinding、Delivery 和 Trace。
- `targetId = "origin"` 表示回流到原始 channel、channel account 和外部会话，适用于原路回复和异步回调，但仍必须经过 Delivery、Trace 和 Loop Guard。
- 允许 `Sink -> Channel` 或 `Channel -> Channel` 时必须内建 Loop Guard、Echo Suppression、fingerprint 去重、hops / maxHops、频率窗口检测和 dead-letter。
- 消息发布或查询前可调用治理中心做基础可用性判断，例如 Bot 是否启用、Provider 是否封闭。
- 接收和投递不要求硬绑定，但必须保持同等级隔离。默认回复使用源消息投递上下文；显式投递路由使用已授权 route 的投递上下文。

### 5.2 调度任务协议

```ts
interface PlatformTaskRequest {
  taskKind: "message" | "scheduled" | "command" | "manual" | "backfill";
  priority: "low" | "normal" | "high";
  targetBotId: string;
  conversationKey?: string;
  input: TaskInput;
  retryPolicy?: TaskRetryPolicy;
}

interface PlatformTaskState {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "paused" | "cancelled";
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  nextRunAt?: string;
  lastError?: PlatformError;
}
```

规则：

- 调度中心只负责任务生命周期、并发、重试和可见性。
- 调度中心触发能力、命令或 Agent 前必须调用治理中心。
- 历史补处理、处理中表情、长任务提示和手动立即执行等用户可见策略由调度中心编排；调度中心通过 MG 的历史查询、订阅、reaction 和投递原语完成动作。
- 定时任务运行态与定义分离，状态写资源中心。

### 5.3 治理判定协议

```ts
interface PolicyCheckRequest {
  action:
    | "route-message"
    | "run-agent"
    | "retrieve-knowledge"
    | "run-capability"
    | "materialize-file"
    | "deliver-result"
    | "export-diagnostics";
  subject: PlatformActor;
  object: PolicyObjectRef;
  context: Record<string, unknown>;
}

interface PolicyDecision {
  decisionId: string;
  effect: "allow" | "deny" | "require-owner-approval" | "require-user-confirmation";
  reason: string;
  obligations: PolicyObligation[];
}

interface PolicyObligation {
  type: "audit" | "redact" | "sandbox" | "owner-approval" | "rate-limit" | "workspace-scope";
  params?: Record<string, unknown>;
}
```

规则：

- 治理中心给出判定和义务，不执行具体业务。
- `allow` 不代表永久授权，只对当前 `requestId` / `correlationId` 和上下文有效。
- `require-owner-approval` 必须返回可恢复的 pending 状态，不能假装失败后静默。

### 5.4 CH 上下文召回协议

```ts
interface ContextRetrieveRequest {
  query: string;
  botId: string;
  conversationKey?: string;
  sources: ContextSourceSelector[];
  memoryTiers?: Array<"short-term" | "mid-term" | "long-term">;
  maxResults: number;
  freshness?: "fresh-only" | "allow-stale-marked" | "snapshot";
}

interface ContextRecord {
  recordId: string;
  source:
    | "skill-knowledge"
    | "lark-doc"
    | "lark-drive"
    | "wiki"
    | "local-rag"
    | "memory"
    | "conversation-summary"
    | "external";
  type: "document" | "chunk" | "summary" | "memory" | "preference" | "fact" | "entity" | "relationship";
  title: string;
  summary: string;
  contentRef?: string;
  freshnessKey?: string;
  updatedAt?: string;
  memoryTier?: "short-term" | "mid-term" | "long-term";
  confidence?: number;
  authorizedForBotId: string;
  auditRef: string;
}

interface ContextRetrieveResult {
  records: ContextRecord[];
  missingPermissions: PolicyObjectRef[];
  staleRecords: ContextRecord[];
  memoryCandidates?: ContextRecord[];
}
```

规则：

- CH 返回上下文召回结果，不直接修改 runtime prompt。
- 召回前必须由治理中心确认 Bot 对上下文源和记忆层级的访问权。
- 大文件或云文档必须通过资源中心物化为受控引用，不能直接给 runtime 全局缓存路径。
- 长期记忆写入不能由模型输出直接落库，必须先进入候选、确认或策略判定流程。

### 5.5 MH 模型选择协议

```ts
interface ModelSelectRequest {
  purpose:
    | "agent"
    | "chat"
    | "text-postprocess"
    | "vision"
    | "ocr"
    | "embedding"
    | "rerank"
    | "moderation"
    | "speech-to-text"
    | "text-to-speech"
    | "image-generation"
    | "image-editing";
  requiredCapabilities: Array<
    | "tools"
    | "vision"
    | "streaming"
    | "json"
    | "structured-output"
    | "embedding"
    | "image-input"
    | "image-output"
    | "audio-input"
    | "audio-output"
    | "local-only"
  >;
  botId?: string;
  ownerId?: string;
  capabilityRef?: string;
  fallbackAllowed: boolean;
}

interface ModelAttemptPlan {
  attempts: ModelAttempt[];
  strategy: "round-robin" | "random" | "fixed";
}

interface ModelAttempt {
  providerId: string;
  deploymentId: string;
  endpointRef?: string;
  model: string;
  capabilities: string[];
  secretRef: string;
}
```

规则：

- MH 只输出候选和尝试顺序，不执行 Agent。
- `secretRef` 只能被主进程模型调用层解析，不能传给自定义应用、Skill 或 runtime workspace。
- runtime 选择和 model provider 选择必须保持两个字段，不得混用。
- CR 可以基于 MH 的 `ModelCapabilityExport` 登记能力，但能力授权、能力展示和工作流编排不属于 MH。

### 5.6 运行时协议

```ts
interface AgentRuntimeRequest {
  runtimeId: "claude-code" | string;
  mode: "agent" | "text" | "vision";
  botId: string;
  conversationKey?: string;
  input: RuntimeInput;
  modelPlan?: ModelAttemptPlan;
  context?: ContextRecord[];
  capabilities?: RuntimeCapabilityBinding[];
  workspacePolicy: WorkspacePolicy;
  progressMode: "silent" | "local-log" | "user-visible";
}

interface AgentRuntimeResult {
  finalText: string;
  runtimeSessionId?: string;
  outputResources: ResourceRef[];
  toolCalls: RuntimeToolCallSummary[];
  noReply?: boolean;
}
```

规则：

- 运行时中心消费模型、知识、工具绑定和 workspace policy，但不自行扩大权限。
- 不同 runtime 必须声明能力差异，例如是否支持工具、MCP、Bash、session resume、文件写入、流式事件。
- `QFT_NO_REPLY` 这类 runtime 专属约定应被转换成统一 `noReply`。

### 5.7 Capability Registry 协议

```ts
interface CapabilityResolveRequest {
  botId: string;
  trigger: "agent" | "command" | "scheduled" | "workflow";
  filter?: CapabilityFilter;
}

interface RuntimeCapabilityBinding {
  kind: "skill" | "mcp" | "app" | "suite" | "workflow";
  id: string;
  displayName: string;
  trigger: "agent" | "command" | "scheduled" | "workflow";
  policyDecisionId: string;
  manifestRef?: string;
  runtimeAdapter: "claude-skill" | "mcp-stdio" | "custom-app" | "workflow" | "prompt-only";
}

interface CapabilityRunRequest {
  binding: RuntimeCapabilityBinding;
  input: string;
  workspaceId: string;
  deliveryRoutes?: DeliveryRouteSummary[];
}
```

规则：

- CR 输出能力绑定前必须带上治理判定结果。
- 自定义应用的 `deliveries` 仍只是投递请求，必须交回 MG 二次校验。
- Workflow 每一步都要继承同一个 `correlationId`，但每步有自己的 `requestId`。

### 5.8 资源协议

```ts
interface ResourceRef {
  resourceId: string;
  kind: "workspace-file" | "cached-file" | "log" | "diagnostic-zip" | "artifact";
  ownerBotId?: string;
  workspaceId?: string;
  pathRef?: string;
  contentHash?: string;
  expiresAt?: string;
  sensitivity: "none" | "user-content" | "credential" | "external";
}

interface MaterializeResourceRequest {
  source: "lark-drive" | "lark-doc-export" | "runtime-output" | "custom-app-artifact" | "diagnostics";
  botId?: string;
  workspaceId?: string;
  sourceRef: Record<string, unknown>;
  desiredName?: string;
}
```

规则：

- 资源中心可以返回当前 workspace 可访问的 `pathRef`，不能把全局缓存路径暴露给 Agent。
- 清理策略必须以 `ResourceRef` 的所有者、用途和保留期为依据。
- 排障包导出必须走资源中心脱敏，不允许其他中心直接打包日志和配置。

## 6. 典型组合链路

### 6.1 飞书消息触发 Agent 回复

1. IM Provider 收到事件，调用 MG `NormalizeInboundMessage`。
2. Message Gateway（MG，消息网关）标准化并归属消息，生成 `InboundMessage`。
3. Message Gateway（MG，消息网关）调用调度中心 `CreateTaskFromMessage`。
4. 调度中心调用治理中心 `CheckPolicy(action=run-agent)`。
5. 运行时中心请求 MH `SelectModel(purpose=agent)`。
6. 运行时中心请求 CR `ResolveCapabilities(trigger=agent)`。
7. 运行时中心按需请求 CH `RetrieveContext`。
8. 运行时中心执行 `RunAgent`，输出统一 `AgentRuntimeResult`。
9. Message Gateway（MG，消息网关）执行 `DeliverResult`；资源中心记录日志和会话事件。

### 6.2 定时任务立即执行

1. UI 请求调度中心执行已保存任务。
2. 调度中心读取任务定义和运行态，创建 `PlatformTaskRequest(taskKind=manual)`。
3. 调度中心调用治理中心确认目标 capability / command / agent 是否允许定时或手动执行。
4. 若目标是 Agent，进入运行时协议；若目标是 capability，进入 Capability Registry 协议。
5. 结果写入定时任务运行历史；如果配置投递 chat，则 MG 执行投递。
6. 手动执行不扰动原自动计划的 `nextRunAt`，除非用户显式修改任务定义。

### 6.3 上下文增强问答

1. 运行时中心根据任务上下文向 CH 发起 `RetrieveContext`。
2. CH 对每个候选上下文源和记忆层级调用治理中心做授权判定。
3. CH 必要时调用资源中心物化受控文件或缓存引用。
4. CH 返回 `ContextRecord[]`，包含来源、权限、freshness、记忆层级、置信度和审计引用。
5. 运行时中心把上下文结果转换成当前 runtime 的上下文格式。
6. 最终回复中可附带上下文来源摘要；详细来源写入资源中心和审计记录。

### 6.4 自定义应用受控投递

1. CR 解析自定义应用能力绑定，执行方传入当前 Bot 可见的 `DeliveryRouteSummary[]`。
2. 自定义应用返回 `reply` 和可选 `deliveries[]`。
3. CR 不直接发送跨平台消息，只登记和解析投递相关能力；投递请求由调用方交给 MG。
4. Message Gateway（MG，消息网关）按 routeId 查当前 Bot 启用路由，并调用治理中心确认 `deliver-result`。
5. Message Gateway（MG，消息网关）投递结果，资源中心记录审计和失败详情。

### 6.5 断网恢复后历史补处理

1. 用户在运行台点击“补处理历史 Beta”。
2. 调度中心创建 `PlatformTaskRequest(taskKind=backfill)`。
3. 调度中心调用 MG 的历史查询能力，只从已记录游标后的 chat 拉取历史消息，不扫描未知会话。
4. MG 返回标准化历史消息和新游标，不决定是否补处理。
5. 调度中心逐条创建处理任务，并让每条历史消息重新进入 `RouteMessageRequest(routingMode=history-query)` 或等价订阅分发链路。
6. 后续链路与实时消息一致，但 `trigger=backfill` 必须贯穿审计和日志。

### 6.6 一键排障包

1. UI 请求资源中心 `ExportDiagnostics`。
2. 资源中心向各中心拉取只读快照：配置摘要、运行态、任务历史、能力审计、MCP 诊断、缓存统计、日志尾部。
3. 资源中心调用治理中心获取脱敏策略。
4. 资源中心输出 `diagnostic-zip`，并记录导出时间、字段范围和脱敏版本。

## 7. 幂等、重试和降级

- `requestId` 用于单次调用去重；`correlationId` 用于整条链路追踪。
- 消息去重仍以平台 `messageId` / `eventId` 为主，不能只看 `requestId`。
- 可重试错误必须显式 `retryable=true`，调度中心才允许重试。
- `POLICY_BLOCKED`、`UNAUTHORIZED`、`INVALID_REQUEST` 默认不可重试。
- 模型失败切换只在 MH 计划内发生；运行时不能自行尝试未授权 Provider。
- 知识源不可用可以返回 `PARTIAL_FAILURE`，但必须标记缺失来源，不能伪装成完整答案。
- 受控文件物化失败时，不允许 fallback 到裸路径或裸 `lark-cli drive +download/+export`。

## 8. 审计与可观测性

每条跨中心链路至少记录：

- `correlationId`
- `requestId`
- source / target center
- Bot、trigger、chat 或 task 范围
- policy decision id
- 能力、知识源、模型 Provider 或资源引用摘要
- 开始时间、结束时间、耗时和结果状态
- 可展示错误和开发诊断错误的脱敏版本

日志展示分三层：

1. 用户可见：任务状态、上次/下次执行、失败原因、是否可重试。
2. 管理员可见：Bot 日志、能力审计、MCP 诊断、排障包。
3. 开发者可见：中心调用事件、上游错误、协议字段和脱敏细节。

## 9. 演进顺序

1. 先在文档中固定协议和字段命名。
2. 新增轻量 TypeScript 类型文件，例如 `electron/platform-protocol.ts`，不立即迁移所有调用。
3. 从低风险链路开始落地：模型选择、能力解析、知识召回结果、资源引用。
4. 再迁移运行时中心：把 Claude Code Runtime 包装到 `AgentRuntime`。
5. 最后迁移消息主链路和调度链路，保持旧配置和旧日志兼容。

## 10. 验收口径

新增或改造跨中心协议时，必须满足：

- 请求和响应都有稳定类型。
- 敏感动作有治理判定。
- 失败能落到统一 `PlatformError`。
- 运行日志能通过 `correlationId` 串起全链路。
- 排障包能展示协议摘要且完成脱敏。
- 不破坏 2.2.6 既有 Bot 配置、会话、定时任务、能力授权和用户导入资源。
