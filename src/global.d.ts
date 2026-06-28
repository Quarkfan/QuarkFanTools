import type { AppConfig, AppInfo, CapabilityAuditReport, CustomAppPreview, LogEntry, McpServerDiagnostic, PlatformConnectorDiagnostic, RuntimeSnapshot, ScheduledTaskRunSummary, SkillPreview, StorageSessionDetail, StorageStats, SuitePreview, WeComChatListResult } from "../electron/types";

declare global {
  interface Window {
    quarkfanTools: {
      snapshot(): Promise<RuntimeSnapshot>;
      logs(): Promise<LogEntry[]>;
      scheduledRuns(): Promise<ScheduledTaskRunSummary[]>;
      runScheduledTaskNow(botId: string, taskId: string): Promise<RuntimeSnapshot>;
      mcpDiagnostics(probeProtocol?: boolean): Promise<McpServerDiagnostic[]>;
      platformDiagnostics(): Promise<PlatformConnectorDiagnostic[]>;
      capabilityAudit(): Promise<CapabilityAuditReport>;
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
      clearFileCacheEntryStorage(cacheKey: string): Promise<StorageStats>;
      repairFileCacheStorage(): Promise<StorageStats>;
      startBot(botId: string): Promise<RuntimeSnapshot>;
      stopBot(botId: string): Promise<RuntimeSnapshot>;
      saveConfig(config: AppConfig): Promise<RuntimeSnapshot>;
      importSkill(): Promise<RuntimeSnapshot>;
      importCustomApp(): Promise<RuntimeSnapshot>;
      upgradeCustomApp(): Promise<RuntimeSnapshot>;
      removeCustomApp(id: string): Promise<RuntimeSnapshot>;
      saveCustomAppManifest(id: string, manifestText: string): Promise<RuntimeSnapshot>;
      copyCustomAppTemplate(id: string, newId: string): Promise<RuntimeSnapshot>;
      importSuite(): Promise<RuntimeSnapshot>;
      upgradeSuite(): Promise<RuntimeSnapshot>;
      removeSuite(id: string): Promise<RuntimeSnapshot>;
      saveSuiteManifest(id: string, manifestText: string): Promise<RuntimeSnapshot>;
      copySuiteTemplate(id: string, newId: string): Promise<RuntimeSnapshot>;
      syncSkillMarket(): Promise<RuntimeSnapshot>;
      removeLocalSkill(name: string): Promise<RuntimeSnapshot>;
      loginLarkUser(botId: string): Promise<void>;
      initWeComCli(botId: string): Promise<{ output: string }>;
      weComChatList(botId: string): Promise<WeComChatListResult>;
      onSnapshot(callback: (snapshot: RuntimeSnapshot) => void): () => void;
      onLog(callback: (entry: LogEntry) => void): () => void;
    };
  }
}

export {};
