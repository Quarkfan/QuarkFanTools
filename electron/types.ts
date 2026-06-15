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
  skillNames: string[];
  pendingReaction: string;
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
  };
}

export interface SkillSummary {
  name: string;
  description: string;
  path: string;
  knowledgePath: string | null;
}

export interface LarkMessage {
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: string;
  senderId: string;
  messageType: string;
  text: string;
  resources: LarkMessageResource[];
  createdAt?: string;
  receivedAt: string;
  raw: unknown;
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
  activeTasks: number;
  skills: SkillSummary[];
  config: AppConfig;
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
