import type { AppConfig, AppInfo, DockerCapability, LogEntry, RuntimeSnapshot, SkillPreview, StorageSessionDetail, StorageStats } from "../electron/types";

declare global {
  interface Window {
    quarkfanTools: {
      snapshot(): Promise<RuntimeSnapshot>;
      logs(): Promise<LogEntry[]>;
      diagnosticLog(): Promise<string>;
      dockerCapability(): Promise<DockerCapability>;
      appInfo(): Promise<AppInfo>;
      storageStats(): Promise<StorageStats>;
      storageSessionDetail(id: string): Promise<StorageSessionDetail>;
      skillPreview(name: string): Promise<SkillPreview>;
      clearExpiredStorage(): Promise<StorageStats>;
      clearSelectedStorage(ids: string[]): Promise<StorageStats>;
      clearAllSessionStorage(): Promise<StorageStats>;
      startBot(botId: string): Promise<RuntimeSnapshot>;
      stopBot(botId: string): Promise<RuntimeSnapshot>;
      saveConfig(config: AppConfig): Promise<RuntimeSnapshot>;
      importSkill(): Promise<RuntimeSnapshot>;
      syncSkillMarket(): Promise<RuntimeSnapshot>;
      removeLocalSkill(name: string): Promise<RuntimeSnapshot>;
      loginLarkUser(botId: string): Promise<void>;
      onSnapshot(callback: (snapshot: RuntimeSnapshot) => void): () => void;
      onLog(callback: (entry: LogEntry) => void): () => void;
    };
  }
}

export {};
