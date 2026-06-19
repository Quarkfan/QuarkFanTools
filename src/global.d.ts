import type { AppConfig, AppInfo, CustomAppPreview, LogEntry, McpServerDiagnostic, RuntimeSnapshot, ScheduledTaskRunSummary, SkillPreview, StorageSessionDetail, StorageStats, SuitePreview } from "../electron/types";

declare global {
  interface Window {
    quarkfanTools: {
      snapshot(): Promise<RuntimeSnapshot>;
      logs(): Promise<LogEntry[]>;
      scheduledRuns(): Promise<ScheduledTaskRunSummary[]>;
      runScheduledTaskNow(botId: string, taskId: string): Promise<RuntimeSnapshot>;
      mcpDiagnostics(probeProtocol?: boolean): Promise<McpServerDiagnostic[]>;
      appInfo(): Promise<AppInfo>;
      storageStats(): Promise<StorageStats>;
      storageSessionDetail(id: string): Promise<StorageSessionDetail>;
      skillPreview(name: string): Promise<SkillPreview>;
      customAppPreview(id: string): Promise<CustomAppPreview>;
      suitePreview(id: string): Promise<SuitePreview>;
      showResourceInFolder(kind: "skill" | "app" | "suite", id: string): Promise<void>;
      clearExpiredStorage(): Promise<StorageStats>;
      clearSelectedStorage(ids: string[]): Promise<StorageStats>;
      clearAllSessionStorage(): Promise<StorageStats>;
      clearFileCacheStorage(): Promise<StorageStats>;
      startBot(botId: string): Promise<RuntimeSnapshot>;
      stopBot(botId: string): Promise<RuntimeSnapshot>;
      saveConfig(config: AppConfig): Promise<RuntimeSnapshot>;
      importSkill(): Promise<RuntimeSnapshot>;
      importCustomApp(): Promise<RuntimeSnapshot>;
      importSuite(): Promise<RuntimeSnapshot>;
      syncSkillMarket(): Promise<RuntimeSnapshot>;
      removeLocalSkill(name: string): Promise<RuntimeSnapshot>;
      loginLarkUser(botId: string): Promise<void>;
      onSnapshot(callback: (snapshot: RuntimeSnapshot) => void): () => void;
      onLog(callback: (entry: LogEntry) => void): () => void;
    };
  }
}

export {};
