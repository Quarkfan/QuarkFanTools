import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { workspaceSessionId } from "./conversation.js";
import { stateRoot, workspaceRoot } from "./paths.js";
import type { StorageStats } from "./types.js";

const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

interface SessionRecord {
  sessionId: string;
  updatedAt: string;
}

export async function storageStats(): Promise<StorageStats> {
  const bots = await botIds();
  let sessionCount = 0;
  let expiredSessionCount = 0;
  let totalBytes = 0;
  const cutoff = Date.now() - SESSION_IDLE_MS;
  for (const botId of bots) {
    totalBytes += await directorySize(path.join(stateRoot(), "bots", botId, "messages"));
    totalBytes += await directorySize(path.join(stateRoot(), "bots", botId, "claude-home"));
    totalBytes += await fileSize(path.join(stateRoot(), "bots", botId, "sessions.json"));
    totalBytes += await directorySize(path.join(workspaceRoot(), "bots", botId));
    for (const record of Object.values(await readSessions(botId))) {
      sessionCount += 1;
      if (Date.parse(record.updatedAt) < cutoff) expiredSessionCount += 1;
    }
  }
  return {
    totalBytes,
    sessionCount,
    expiredSessionCount,
    botCount: bots.length
  };
}

async function fileSize(target: string): Promise<number> {
  return (await stat(target).catch(() => ({ size: 0 }))).size;
}

export async function clearExpiredStorage(): Promise<number> {
  const cutoff = Date.now() - SESSION_IDLE_MS;
  let removed = 0;
  for (const botId of await botIds()) {
    const sessions = await readSessions(botId);
    for (const [key, record] of Object.entries(sessions)) {
      if (Date.parse(record.updatedAt) >= cutoff) continue;
      await rm(path.join(workspaceRoot(), "bots", botId, "sessions", workspaceSessionId(key)), { recursive: true, force: true });
      await removeMatching(path.join(stateRoot(), "bots", botId, "claude-home"), record.sessionId);
      delete sessions[key];
      removed += 1;
    }
    await writeSessions(botId, sessions);
    await removeOldChildren(path.join(stateRoot(), "bots", botId, "messages"), cutoff);
  }
  return removed;
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

async function removeOldChildren(root: string, cutoff: number): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const target = path.join(root, entry.name);
    const value = await stat(target).catch(() => null);
    if (value && value.mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
  }
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
