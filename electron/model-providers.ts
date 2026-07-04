import type { AppConfig, ModelProviderConfig } from "./types.js";

const roundRobinIndexes = new Map<string, number>();

export function completeModelProviders(config: AppConfig, options: { requireMultimodal?: boolean } = {}): ModelProviderConfig[] {
  return modelProviders(config)
    .filter((provider) => provider.enabled)
    .filter((provider) => provider.baseUrl && provider.model && provider.apiKey)
    .filter((provider) => !options.requireMultimodal || provider.multimodalEnabled);
}

export function hasCompleteModelProvider(config: AppConfig): boolean {
  return completeModelProviders(config).length > 0;
}

export function hasMultimodalModelProvider(config: AppConfig): boolean {
  return completeModelProviders(config, { requireMultimodal: true }).length > 0;
}

export function modelProviderAttempts(config: AppConfig, scope: string, options: { requireMultimodal?: boolean } = {}): ModelProviderConfig[] {
  const providers = completeModelProviders(config, options);
  if (providers.length <= 1) return providers;
  const mode = config.model.strategy?.mode ?? "round-robin";
  const start = mode === "random"
    ? Math.floor(Math.random() * providers.length)
    : nextRoundRobinIndex(scope, providers.length);
  const ordered = rotate(providers, start);
  return config.model.strategy?.failoverOnFailure ? ordered : ordered.slice(0, 1);
}

export function describeModelStrategy(config: AppConfig): string {
  const mode = config.model.strategy?.mode === "random" ? "随机" : "轮流";
  return `${mode}${config.model.strategy?.failoverOnFailure ? " / 失败切换" : ""}`;
}

function modelProviders(config: AppConfig): ModelProviderConfig[] {
  if (Array.isArray(config.model.providers) && config.model.providers.length > 0) return config.model.providers;
  return [{
    id: config.model.providerId || "anthropic",
    name: config.model.providerName || "Claude Compatible",
    baseUrl: config.model.baseUrl,
    model: config.model.model,
    apiKeyEnv: config.model.apiKeyEnv,
    apiKey: config.model.apiKey,
    multimodalEnabled: config.model.multimodalEnabled,
    enabled: true
  }];
}

function nextRoundRobinIndex(scope: string, length: number): number {
  const current = roundRobinIndexes.get(scope) ?? 0;
  roundRobinIndexes.set(scope, (current + 1) % length);
  return current % length;
}

function rotate<T>(items: T[], start: number): T[] {
  return [...items.slice(start), ...items.slice(0, start)];
}
