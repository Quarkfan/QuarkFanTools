export type ImProviderId = "lark" | "wecom" | "dingtalk";
export type ImIdentity = "user" | "bot";
export type LarkIdentity = ImIdentity;

export interface PlatformConnectorConfig {
  enabled: boolean;
  cliPath?: string;
  profile?: string;
  appId: string;
  appSecret: string;
  oauthScopes?: string[];
  options?: Record<string, string>;
}

export interface BotDeliveryRoute {
  id: string;
  enabled: boolean;
  provider: ImProviderId;
  chatId: string;
  mode: "copy-final-reply";
  name?: string;
}

export interface CustomAppDeliveryRequest {
  routeId: string;
  text?: string;
  useReply?: boolean;
  label?: string;
}

export interface BotConfig {
  id: string;
  name: string;
  enabled: boolean;
  provider?: ImProviderId;
  cliPath: string;
  profile: string;
  appId: string;
  appSecret: string;
  receiveIdentity: ImIdentity;
  replyIdentity: ImIdentity;
  eventTypes: string[];
  providerOptions?: Record<string, string>;
  connectors?: {
    lark?: PlatformConnectorConfig;
    wecom?: PlatformConnectorConfig;
    dingtalk?: PlatformConnectorConfig;
  };
  deliveryRoutes?: BotDeliveryRoute[];
  oauthScopes?: string[];
  skillNames: string[];
  capabilityRefs?: BotCapabilityRef[];
  commandBindings?: BotCommandBinding[];
  scheduledTasks?: ScheduledTask[];
  pendingReaction: string;
  ownerOpenId: string;
  showProgress?: boolean;
  longTaskNoticeSeconds?: number;
  longTaskNoticeText?: string;
}

export type CapabilityKind = "skill" | "mcp" | "app" | "suite" | "workflow" | "command" | "scheduled-task";

export interface CapabilityPolicy {
  allowAgentUse?: boolean;
  allowCommandUse?: boolean;
  allowScheduledUse?: boolean;
  requireOwnerApproval?: boolean;
}

export interface BotCapabilityRef {
  kind: CapabilityKind;
  id: string;
  enabled: boolean;
  policy?: CapabilityPolicy;
  alias?: string;
}

export interface BotCommandBinding {
  name: string;
  aliases?: string[];
  enabled: boolean;
  description?: string;
  target: {
    type: "capability";
    capability: {
      kind: "skill" | "mcp" | "app" | "suite" | "workflow";
      id: string;
    };
  };
  promptTemplate?: string;
}

export interface ScheduledTask {
  id: string;
  botId: string;
  enabled: boolean;
  name: string;
  schedule: {
    type: "interval" | "daily" | "weekly" | "cron";
    timezone: string;
    everyMinutes?: number;
    timeOfDay?: string;
    weekdays?: number[];
    cronExpression?: string;
  };
  target: {
    type: "agent" | "command" | "capability";
    commandName?: string;
    capability?: {
      kind: "skill" | "mcp" | "app" | "suite" | "workflow";
      id: string;
    };
    prompt: string;
  };
  delivery: {
    type: "chat";
    chatId: string;
    replyIdentity?: "bot" | "user";
  };
  retry?: {
    maxRetries: number;
    delayMinutes: number;
  };
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: "success" | "failed" | "skipped";
  failureCount?: number;
  retryAt?: string;
  pausedReason?: string;
}

export interface ScheduledTaskRuntimeState {
  id: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastStatus?: "success" | "failed" | "skipped";
  failureCount?: number;
  retryAt?: string;
  pausedReason?: string;
}

export interface ScheduledTaskRunSummary {
  taskId: string;
  taskName: string;
  botId: string;
  botName: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed" | "skipped";
  detail?: string;
}

export interface CapabilityDefinition {
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  source: "builtin" | "local" | "market" | "config";
  enabled: boolean;
  version?: string;
  tags?: string[];
}

export interface CapabilityGovernanceDiagnostic {
  kind: "app" | "suite" | "workflow";
  id: string;
  name: string;
  status: "ok" | "warn" | "error";
  risk: "low" | "medium" | "high";
  issues: string[];
  recommendations: string[];
}

export interface CapabilityAuditRecord {
  at: string;
  botId: string;
  trigger: "agent" | "command" | "scheduled";
  source: string;
  capability: {
    kind: CapabilityKind;
    id: string;
    name?: string;
  };
  status: "success" | "failed" | "blocked" | "approval-required";
  detail?: string;
  durationMs?: number;
}

export interface CapabilityAuditSummary {
  botId: string;
  botName: string;
  trigger: CapabilityAuditRecord["trigger"];
  capability: CapabilityAuditRecord["capability"];
  total: number;
  success: number;
  failed: number;
  blocked: number;
  approvalRequired: number;
  lastStatus: CapabilityAuditRecord["status"];
  lastAt: string;
}

export interface CapabilityAuditReport {
  summaries: CapabilityAuditSummary[];
  recent: CapabilityAuditRecord[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: "stdio" | "http" | "sse";
  command: string;
  args: string[];
  url?: string;
  env: Array<{
    name: string;
    value: string;
    secret?: boolean;
  }>;
  cwd?: string;
  description?: string;
  timeoutMs?: number;
  alwaysLoad?: boolean;
}

export interface McpServerDiagnostic {
  id: string;
  name: string;
  status: "ok" | "warn" | "error";
  commandResolved?: string;
  authorizedBotNames: string[];
  issues: string[];
  protocol?: {
    status: "not-run" | "ok" | "failed";
    durationMs?: number;
    tools: string[];
    error?: string;
    stderrTail?: string;
    exitCode?: number | null;
    signal?: string | null;
  };
  lastProbe?: McpServerProbeSummary;
}

export interface PlatformConnectorDiagnostic {
  botId: string;
  botName: string;
  provider: ImProviderId;
  status: "ok" | "warn" | "error";
  issues: string[];
  recommendations: string[];
}

export interface WeComChatListItem {
  chatId: string;
  chatName?: string;
  lastMsgTime?: string;
  msgCount?: number;
}

export interface WeComChatListResult {
  beginTime: string;
  endTime: string;
  chats: WeComChatListItem[];
  output: string;
}

export interface McpServerProbeSummary {
  serverId: string;
  serverName: string;
  probedAt: string;
  status: "ok" | "failed";
  durationMs?: number;
  tools: string[];
  error?: string;
  stderrTail?: string;
  exitCode?: number | null;
  signal?: string | null;
}

export interface AppConfig {
  bots: BotConfig[];
  mcpServers: McpServerConfig[];
  ui: {
    theme: "system" | "light" | "dark";
  };
  skillMarket: {
    enabled: boolean;
    repositoryUrl: string;
    branch: string;
    token: string;
  };
  model: {
    providerId: string;
    providerName: string;
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
    apiKey: string;
    multimodalEnabled: boolean;
  };
  runtime: {
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    approvalPolicy: "untrusted" | "on-request" | "never";
    maxConcurrentTasks: number;
    maxAgentTurns?: number;
    customAppArtifacts?: {
      autoCleanup: boolean;
      retentionDays: number;
    };
    customAppReplyProcessing?: {
      mode: "raw" | "summarize";
      prompt: string;
      maxInputChars: number;
    };
    customAppReplyProcessingByApp?: Record<string, {
      mode: "raw" | "summarize";
      prompt: string;
      maxInputChars: number;
    }>;
  };
}

export interface SkillSummary {
  name: string;
  description: string;
  path: string;
  knowledgePath: string | null;
  source: "local" | "market" | "builtin";
}

export interface CustomAppSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  path: string;
  source: "local" | "builtin";
  entry: {
    type: "node" | "executable" | "webview" | "mcp-adapter" | "workflow";
    command?: string;
    args?: string[];
  };
  capabilities: {
    agentCallable: boolean;
    commandCallable: boolean;
    scheduledCallable: boolean;
    hasUi: boolean;
  };
  permissions: {
    network: boolean;
    filesystem: string[];
    requiresOwnerApproval: boolean;
    desktopAutomation?: {
      screenCapture: boolean;
      accessibility: boolean;
      clipboard: boolean;
      keyboardInput: boolean;
      autoSend: boolean;
    };
  };
  lifecycle?: {
    installedAt?: string;
    updatedAt?: string;
    status: "installed" | "upgraded" | "legacy";
  };
  diagnostics?: CustomAppDiagnostic[];
}

export interface CustomAppDiagnostic {
  status: "ok" | "warn" | "error";
  message: string;
}

export interface SuiteWorkflowSummary {
  id: string;
  name: string;
  prompt: string;
  steps: SuiteWorkflowStepSummary[];
}

export interface SuiteWorkflowStepSummary {
  id: string;
  name: string;
  type: "prompt" | "capability";
  prompt: string;
  input?: string;
  condition?: WorkflowStepCondition;
  continueOnError?: boolean;
  repeat?: {
    maxTimes: number;
    until?: WorkflowStepCondition;
  };
  timeoutSeconds?: number;
  retry?: {
    maxAttempts: number;
  };
  capability?: {
    kind: "skill" | "mcp" | "app" | "suite";
    id: string;
  };
}

export interface WorkflowStepCondition {
  if?: string;
  equals?: string;
  includes?: string;
  matches?: string;
  not?: boolean;
}

export interface SuiteSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  publisher?: string;
  trusted: boolean;
  tags: string[];
  path: string;
  source: "local" | "builtin";
  skills: string[];
  apps: string[];
  mcpServers: string[];
  instructions?: string;
  workflows: SuiteWorkflowSummary[];
  lifecycle?: {
    installedAt?: string;
    updatedAt?: string;
    status: "installed" | "upgraded" | "legacy";
  };
  diagnostics?: SuiteDiagnostic[];
}

export interface SuiteDiagnostic {
  status: "ok" | "warn" | "error";
  message: string;
}

export interface ChatMessage {
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: string;
  senderId: string;
  messageType: string;
  text: string;
  resources: ChatMessageResource[];
  createdAt?: string;
  receivedAt: string;
  provider?: ImProviderId;
  sourceAppId?: string;
  mentions?: LarkMention[];
  raw: unknown;
}

export type LarkMessage = ChatMessage;

export interface LarkBotIdentity {
  appName?: string;
  openId: string;
}

export interface LarkMention {
  key?: string;
  name?: string;
  tenantKey?: string;
  id?: {
    openId?: string;
    userId?: string;
    unionId?: string;
    appId?: string;
  };
}

export interface ChatMessageResource {
  key: string;
  type: "image" | "file";
  name?: string;
  localPath?: string;
}

export type LarkMessageResource = ChatMessageResource;

export interface RuntimeSnapshot {
  running: boolean;
  runningBotIds: string[];
  connectedBotIds: string[];
  activeTasks: number;
  queuedTasks: number;
  skills: SkillSummary[];
  customApps: CustomAppSummary[];
  suites: SuiteSummary[];
  capabilities: CapabilityDefinition[];
  capabilityDiagnostics: CapabilityGovernanceDiagnostic[];
  config: AppConfig;
}

export interface StorageStats {
  totalBytes: number;
  conversationBytes: number;
  cacheBytes: number;
  customAppArtifactBytes: number;
  customAppArtifactCount: number;
  expiredCustomAppArtifactCount: number;
  sessionCount: number;
  expiredSessionCount: number;
  botCount: number;
  sessions: StorageSession[];
  cacheEntries: FileCacheEntrySummary[];
  customAppArtifacts: CustomAppArtifactSummary[];
}

export interface FileCacheEntrySummary {
  cacheKey: string;
  sourceType: "lark-message-resource" | "lark-drive-file" | "lark-drive-export";
  botIds: string[];
  fileName: string;
  bytes: number;
  cachedAt?: string;
  hash: string;
  label: string;
  freshnessKey?: string;
  freshness: {
    status: "fresh" | "stale" | "unknown";
    reason: string;
    ageDays?: number;
  };
}

export interface FileCacheRepairReport {
  removedEntries: number;
  removedHashes: number;
  repairedEntries: number;
}

export interface CustomAppArtifactSummary {
  id: string;
  botId: string;
  conversationKey: string;
  appId: string;
  updatedAt?: string;
  bytes: number;
  expired: boolean;
  fileCount: number;
}

export interface StorageSession {
  id: string;
  botId: string;
  conversationKey: string;
  updatedAt: string;
  bytes: number;
  expired: boolean;
}

export type SessionTranscriptEventType = "received" | "progress" | "notice" | "reply" | "error";

export interface SessionTranscriptEvent {
  time: string;
  type: SessionTranscriptEventType;
  title: string;
  body: string;
}

export interface SessionTranscriptTurn {
  time: string;
  messageId: string;
  user: string;
  assistant: string;
  events?: SessionTranscriptEvent[];
}

export interface StorageSessionDetail extends StorageSession {
  sessionId: string;
  messageIds: string[];
  transcript: SessionTranscriptTurn[];
  files: Array<{ path: string; bytes: number }>;
}

export interface SkillPreview {
  name: string;
  description: string;
  source: SkillSummary["source"];
  content: string;
  files: string[];
}

export interface CustomAppPreview {
  app: CustomAppSummary;
  manifest: string;
  files: string[];
}

export interface SuitePreview {
  suite: SuiteSummary;
  manifest: string;
  files: string[];
}

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  detail?: string;
  botId?: string;
}

export interface AppInfo {
  version: string;
  releases: Array<{
    version: string;
    date: string;
    highlights: string[];
  }>;
}
