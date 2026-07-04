import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRoot } from "./paths.js";

export const REMOTE_AUTH_URL = "https://gitee.com/vdean/Auth/raw/master/QuarkfanTools";

export type RemoteAuthStatus = "open" | "close";
const UNREACHABLE_GRACE_DAYS = 90;
const UNREACHABLE_GRACE_CHECKS = 200;

export interface RemoteAuthCheckResult {
  allowed: boolean;
  status: RemoteAuthStatus | "unknown";
  detail: string;
  networkUnreachable?: boolean;
}

export interface RemoteAuthCheckOptions {
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RemoteAuthPolicyOptions extends RemoteAuthCheckOptions {
  now?: Date;
  statePath?: string;
}

export interface RemoteAuthUnreachableState {
  firstUnreachableAt: string;
  lastUnreachableAt: string;
  unreachableCount: number;
}

export function parseRemoteAuthStatus(text: string): RemoteAuthStatus | null {
  const match = text.match(/(?:^|\n)\s*Auth\s*=\s*(open|close)\s*(?:\r?\n|$)/i);
  return match ? match[1].toLowerCase() as RemoteAuthStatus : null;
}

export async function checkRemoteAuth(options: RemoteAuthCheckOptions = {}): Promise<RemoteAuthCheckResult> {
  const url = options.url ?? REMOTE_AUTH_URL;
  const timeoutMs = Math.max(1000, Math.floor(options.timeoutMs ?? 8000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      return { allowed: false, status: "unknown", detail: `HTTP ${response.status}` };
    }
    const text = await response.text();
    const status = parseRemoteAuthStatus(text);
    if (status === "open") return { allowed: true, status, detail: "Auth=open" };
    if (status === "close") return { allowed: false, status, detail: "Auth=close" };
    return { allowed: false, status: "unknown", detail: "missing Auth=open" };
  } catch (error) {
    return { allowed: false, status: "unknown", detail: String(error), networkUnreachable: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function enforceRemoteAuthPolicy(options: RemoteAuthPolicyOptions = {}): Promise<RemoteAuthCheckResult> {
  const result = await checkRemoteAuth(options);
  if (result.allowed && result.status === "open") {
    await resetRemoteAuthUnreachableState(options.statePath);
    return result;
  }
  if (!result.networkUnreachable) return result;
  return recordRemoteAuthUnreachable(result, options);
}

export function remoteAuthStatePath(): string {
  return path.join(stateRoot(), "auth-gate.json");
}

async function resetRemoteAuthUnreachableState(statePath = remoteAuthStatePath()): Promise<void> {
  await rm(statePath, { force: true }).catch(() => undefined);
}

async function recordRemoteAuthUnreachable(result: RemoteAuthCheckResult, options: RemoteAuthPolicyOptions): Promise<RemoteAuthCheckResult> {
  const statePath = options.statePath ?? remoteAuthStatePath();
  const now = options.now ?? new Date();
  const existing = await readRemoteAuthUnreachableState(statePath);
  const next: RemoteAuthUnreachableState = {
    firstUnreachableAt: existing?.firstUnreachableAt ?? now.toISOString(),
    lastUnreachableAt: now.toISOString(),
    unreachableCount: Math.max(0, Math.floor(existing?.unreachableCount ?? 0)) + 1
  };
  await writeRemoteAuthUnreachableState(statePath, next);
  const firstAt = Date.parse(next.firstUnreachableAt);
  const elapsedMs = Number.isFinite(firstAt) ? now.getTime() - firstAt : 0;
  const exceededGrace = elapsedMs >= UNREACHABLE_GRACE_DAYS * 24 * 60 * 60 * 1000
    && next.unreachableCount >= UNREACHABLE_GRACE_CHECKS;
  const detail = `${result.detail} / 网络不可达累计 ${next.unreachableCount} 次 / 首次 ${next.firstUnreachableAt}`;
  return exceededGrace
    ? { ...result, allowed: false, detail: `${detail} / 已超过 ${UNREACHABLE_GRACE_DAYS} 天且不少于 ${UNREACHABLE_GRACE_CHECKS} 次检测` }
    : { ...result, allowed: true, detail };
}

async function readRemoteAuthUnreachableState(statePath: string): Promise<RemoteAuthUnreachableState | null> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<RemoteAuthUnreachableState>;
    if (!parsed.firstUnreachableAt || !parsed.lastUnreachableAt) return null;
    return {
      firstUnreachableAt: parsed.firstUnreachableAt,
      lastUnreachableAt: parsed.lastUnreachableAt,
      unreachableCount: Math.max(0, Math.floor(Number(parsed.unreachableCount) || 0))
    };
  } catch {
    return null;
  }
}

async function writeRemoteAuthUnreachableState(statePath: string, state: RemoteAuthUnreachableState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function nextRemoteAuthCheckDelayMs(): number {
  const min = 10 * 60 * 1000;
  const max = 30 * 60 * 1000;
  return min + Math.floor(Math.random() * (max - min + 1));
}
