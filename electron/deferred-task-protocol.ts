export interface DeferredTaskRequest {
  summary: string;
  followUpPrompt: string;
}

export function parseDeferredTask(text: string): DeferredTaskRequest | null {
  const match = text.trim().match(/^DEFERRED_DOWNLOAD:\s*(\{.*\})$/s);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as Partial<DeferredTaskRequest>;
    if (!value.summary?.trim() || !value.followUpPrompt?.trim()) return null;
    return { summary: value.summary.trim(), followUpPrompt: value.followUpPrompt.trim() };
  } catch {
    return null;
  }
}

export function continueTaskId(text: string): string | null {
  return text.trim().match(/^\/continue\s+([a-zA-Z0-9-]+)$/)?.[1] ?? null;
}
