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
  pendingReply: string;
}

export interface AppConfig {
  bots: BotConfig[];
  model: {
    providerId: string;
    providerName: string;
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
    apiKey: string;
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
  text: string;
  createdAt?: string;
  receivedAt: string;
  raw: unknown;
}

export interface RuntimeSnapshot {
  running: boolean;
  connectedBotIds: string[];
  activeTasks: number;
  skills: SkillSummary[];
  config: AppConfig;
}

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  detail?: string;
}
