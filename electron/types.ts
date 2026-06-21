export type LarkIdentity = "user" | "bot";

export interface BotConfig {
  id: string;
  name: string;
  enabled: boolean;
  cliPath: string;
  profile: string;
  appId: string;
  appSecret: string;
  receiveIdentity: LarkIdentity;
  replyIdentity: LarkIdentity;
  eventTypes: string[];
  oauthScopes?: string[];
  skillNames: string[];
  pendingReaction: string;
  ownerOpenId: string;
  showProgress?: boolean;
}

export interface AppConfig {
  bots: BotConfig[];
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
    botIsolationMode?: "process" | "container" | "auto";
    preventSleepMode?: "off" | "when-running" | "when-busy";
  };
}

export interface SkillSummary {
  name: string;
  description: string;
  path: string;
  knowledgePath: string | null;
  source: "local" | "market" | "builtin";
}

export interface LarkMessage {
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: string;
  senderId: string;
  messageType: string;
  text: string;
  sourceAppId?: string;
  mentions?: LarkMention[];
  resources: LarkMessageResource[];
  createdAt?: string;
  receivedAt: string;
  raw: unknown;
}

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

export interface LarkMessageResource {
  key: string;
  type: "image" | "file";
  name?: string;
  localPath?: string;
}

export interface RuntimeSnapshot {
  running: boolean;
  runningBotIds: string[];
  connectedBotIds: string[];
  workerPids?: Record<string, number>;
  readyBotIds?: string[];
  scheduledTaskCount?: number;
  activeTasks: number;
  queuedTasks: number;
  skills: SkillSummary[];
  config: AppConfig;
}

export interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: "interval" | "once";
    intervalMinutes?: number;
    runAt?: string;
    timezone: string;
  };
  target: {
    type: "prompt";
    prompt: string;
  };
  output: {
    mode: "none";
  };
  policy: {
    timeoutSeconds: number;
    missed: "skip" | "run-once";
    concurrency: "skip-if-running" | "queue";
  };
  state: {
    lastRunAt?: string;
    nextRunAt?: string;
    lastStatus?: "success" | "failed" | "skipped";
    lastError?: string;
  };
}

export interface DockerCapability {
  installed: boolean;
  daemonRunning: boolean;
  version: string;
  error: string;
}

export interface StorageStats {
  totalBytes: number;
  sessionCount: number;
  expiredSessionCount: number;
  botCount: number;
  sessions: StorageSession[];
}

export interface StorageSession {
  id: string;
  botId: string;
  conversationKey: string;
  updatedAt: string;
  bytes: number;
  expired: boolean;
}

export interface StorageSessionDetail extends StorageSession {
  sessionId: string;
  messageIds: string[];
  transcript: Array<{
    time: string;
    messageId: string;
    user: string;
    assistant: string;
  }>;
  files: Array<{ path: string; bytes: number }>;
}

export interface SkillPreview {
  name: string;
  description: string;
  source: SkillSummary["source"];
  content: string;
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
