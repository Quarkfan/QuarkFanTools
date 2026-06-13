import type { AppConfig, LogEntry, RuntimeSnapshot, StorageStats } from "../electron/types";

declare global {
  interface Window {
    quarkfanTools: {
      snapshot(): Promise<RuntimeSnapshot>;
      logs(): Promise<LogEntry[]>;
      storageStats(): Promise<StorageStats>;
      clearExpiredStorage(): Promise<StorageStats>;
      clearAllSessionStorage(): Promise<StorageStats>;
      start(): Promise<RuntimeSnapshot>;
      stop(): Promise<RuntimeSnapshot>;
      saveConfig(config: AppConfig): Promise<RuntimeSnapshot>;
      importSkill(): Promise<RuntimeSnapshot>;
      loginLarkUser(botId: string): Promise<void>;
      onSnapshot(callback: (snapshot: RuntimeSnapshot) => void): () => void;
      onLog(callback: (entry: LogEntry) => void): () => void;
    };
  }
}

export {};
