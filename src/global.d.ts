import type { AppConfig, LogEntry, RuntimeSnapshot } from "../electron/types";

declare global {
  interface Window {
    quarkfanTools: {
      snapshot(): Promise<RuntimeSnapshot>;
      logs(): Promise<LogEntry[]>;
      start(): Promise<RuntimeSnapshot>;
      stop(): Promise<RuntimeSnapshot>;
      saveConfig(config: AppConfig): Promise<RuntimeSnapshot>;
      openSkills(): Promise<void>;
      loginLarkUser(): Promise<void>;
      onSnapshot(callback: (snapshot: RuntimeSnapshot) => void): () => void;
      onLog(callback: (entry: LogEntry) => void): () => void;
    };
  }
}

export {};
