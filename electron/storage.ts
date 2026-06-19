import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { workspaceSessionId } from "./conversation.js";
import { stateRoot, workspaceRoot } from "./paths.js";
import { fileCacheEntries } from "./file-cache.js";
import type { SessionTranscriptTurn, StorageSession, StorageSessionDetail, StorageStats } from "./types.js";

const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

interface SessionRecord {
  sessionId: string;
  updatedAt: string;
  messageIds?: string[];
  transcript?: SessionTranscriptTurn[];
}

export async function storageStats(): Promise<StorageStats> {
  const bots = await botIds();
  let sessionCount = 0;
  let expiredSessionCount = 0;
  let conversationBytes = 0;
  const sessionEntries: StorageSession[] = [];
  const cutoff = Date.now() - SESSION_IDLE_MS;
  for (const botId of bots) {
    conversationBytes += await directorySize(path.join(stateRoot(), "bots", botId, "messages"));
    conversationBytes += await directorySize(path.join(stateRoot(), "bots", botId, "claude-home"));
    conversationBytes += await fileSize(path.join(stateRoot(), "bots", botId, "sessions.json"));
    conversationBytes += await directorySize(path.join(workspaceRoot(), "bots", botId));
    for (const [key, record] of Object.entries(await readSessions(botId))) {
      sessionCount += 1;
      const expired = Date.parse(record.updatedAt) < cutoff;
      if (expired) expiredSessionCount += 1;
      sessionEntries.push({
        id: sessionStorageId(botId, key),
        botId,
        conversationKey: key,
        updatedAt: record.updatedAt,
        bytes: await sessionSize(botId, key, record),
        expired
      });
    }
  }
  const cacheBytes = await directorySize(path.join(stateRoot(), "file-cache"));
  return {
    totalBytes: conversationBytes + cacheBytes,
    conversationBytes,
    cacheBytes,
    sessionCount,
    expiredSessionCount,
    botCount: bots.length,
    sessions: sessionEntries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    cacheEntries: await fileCacheEntries()
  };
}

export async function storageSessionDetail(id: string): Promise<StorageSessionDetail> {
  const session = (await storageStats()).sessions.find((item) => item.id === id);
  if (!session) throw new Error("会话不存在");
  const record = (await readSessions(session.botId))[session.conversationKey];
  if (!record) throw new Error("会话记录不存在");
  const workspace = path.join(workspaceRoot(), "bots", session.botId, "sessions", workspaceSessionId(session.conversationKey));
  return {
    ...session,
    sessionId: record.sessionId,
    messageIds: record.messageIds ?? [],
    transcript: record.transcript ?? [],
    files: await listSessionFiles(workspace, workspace)
  };
}

async function listSessionFiles(root: string, current: string): Promise<Array<{ path: string; bytes: number }>> {
  const result: Array<{ path: string; bytes: number }> = [];
  for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listSessionFiles(root, target));
    else result.push({ path: path.relative(root, target), bytes: await fileSize(target) });
    if (result.length >= 300) break;
  }
  return result;
}

async function fileSize(target: string): Promise<number> {
  return (await stat(target).catch(() => ({ size: 0 }))).size;
}

export async function clearExpiredStorage(): Promise<number> {
  const stats = await storageStats();
  return clearSelectedSessionStorage(stats.sessions.filter((session) => session.expired).map((session) => session.id));
}

export async function clearSelectedSessionStorage(ids: string[]): Promise<number> {
  const selected = new Set(ids);
  let removed = 0;
  for (const botId of await botIds()) {
    const sessions = await readSessions(botId);
    for (const [key, record] of Object.entries(sessions)) {
      if (!selected.has(sessionStorageId(botId, key))) continue;
      await removeSession(botId, key, record);
      delete sessions[key];
      removed += 1;
    }
    await writeSessions(botId, sessions);
  }
  return removed;
}

function sessionStorageId(botId: string, key: string): string {
  return `${botId}:${workspaceSessionId(key)}`;
}

async function sessionSize(botId: string, key: string, record: SessionRecord): Promise<number> {
  let total = await directorySize(path.join(workspaceRoot(), "bots", botId, "sessions", workspaceSessionId(key)));
  for (const messageId of record.messageIds ?? []) {
    total += await directorySize(path.join(stateRoot(), "bots", botId, "messages", messageId));
  }
  return total;
}

async function removeSession(botId: string, key: string, record: SessionRecord): Promise<void> {
  await rm(path.join(workspaceRoot(), "bots", botId, "sessions", workspaceSessionId(key)), { recursive: true, force: true });
  await removeMatching(path.join(stateRoot(), "bots", botId, "claude-home"), record.sessionId);
  for (const messageId of record.messageIds ?? []) {
    await rm(path.join(stateRoot(), "bots", botId, "messages", messageId), { recursive: true, force: true });
  }
}

export async function clearAllSessionStorage(): Promise<void> {
  for (const botId of await botIds()) {
    await Promise.all([
      rm(path.join(stateRoot(), "bots", botId, "messages"), { recursive: true, force: true }),
      rm(path.join(stateRoot(), "bots", botId, "claude-home"), { recursive: true, force: true }),
      rm(path.join(stateRoot(), "bots", botId, "sessions.json"), { force: true }),
      rm(path.join(workspaceRoot(), "bots", botId), { recursive: true, force: true })
    ]);
  }
}

export async function clearFileCacheStorage(): Promise<void> {
  await rm(path.join(stateRoot(), "file-cache"), { recursive: true, force: true });
}

async function botIds(): Promise<string[]> {
  const roots = [path.join(stateRoot(), "bots"), path.join(workspaceRoot(), "bots")];
  const ids = new Set<string>();
  for (const root of roots) {
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids];
}

async function readSessions(botId: string): Promise<Record<string, SessionRecord>> {
  try {
    return JSON.parse(await readFile(path.join(stateRoot(), "bots", botId, "sessions.json"), "utf8")) as Record<string, SessionRecord>;
  } catch {
    return {};
  }
}

async function writeSessions(botId: string, sessions: Record<string, SessionRecord>): Promise<void> {
  const target = path.join(stateRoot(), "bots", botId, "sessions.json");
  if (Object.keys(sessions).length === 0) {
    await rm(target, { force: true });
    return;
  }
  await writeFile(target, `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
}

async function directorySize(root: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(target);
    else total += (await stat(target).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

async function removeMatching(root: string, needle: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(root, entry.name);
    if (entry.name.includes(needle)) {
      await rm(target, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeMatching(target, needle);
    }
  }
}
