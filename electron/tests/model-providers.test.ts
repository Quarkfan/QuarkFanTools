import assert from "node:assert/strict";
import test from "node:test";
import { completeModelProviders, hasCompleteModelProvider, hasMultimodalModelProvider, modelProviderAttempts } from "../model-providers.js";
import type { AppConfig } from "../types.js";

function config(mode: "round-robin" | "random" = "round-robin", failoverOnFailure = false): AppConfig {
  return {
    bots: [],
    mcpServers: [],
    ui: { theme: "system" },
    skillMarket: { enabled: false, repositoryUrl: "", branch: "main", token: "" },
    model: {
      providerId: "p1",
      providerName: "P1",
      baseUrl: "https://p1.example",
      model: "claude-1",
      apiKeyEnv: "ANTHROPIC_AUTH_TOKEN",
      apiKey: "k1",
      multimodalEnabled: true,
      providers: [
        { id: "p1", name: "P1", baseUrl: "https://p1.example", model: "claude-1", apiKeyEnv: "ANTHROPIC_AUTH_TOKEN", apiKey: "k1", multimodalEnabled: true, enabled: true },
        { id: "p2", name: "P2", baseUrl: "https://p2.example", model: "claude-2", apiKeyEnv: "ANTHROPIC_AUTH_TOKEN", apiKey: "k2", multimodalEnabled: false, enabled: true },
        { id: "draft", name: "Draft", baseUrl: "", model: "", apiKeyEnv: "ANTHROPIC_AUTH_TOKEN", apiKey: "", multimodalEnabled: true, enabled: true }
      ],
      strategy: { mode, failoverOnFailure }
    },
    runtime: {
      sandbox: "workspace-write",
      approvalPolicy: "never",
      maxConcurrentTasks: 2,
      maxAgentTurns: 60
    }
  };
}

test("lists only complete enabled model providers", () => {
  const providers = completeModelProviders(config());
  assert.deepEqual(providers.map((provider) => provider.id), ["p1", "p2"]);
  assert.equal(hasCompleteModelProvider(config()), true);
  assert.equal(hasMultimodalModelProvider(config()), true);
});

test("round-robin model provider attempts rotate per scope", () => {
  const c = config("round-robin", false);
  assert.deepEqual(modelProviderAttempts(c, "test-round-robin").map((provider) => provider.id), ["p1"]);
  assert.deepEqual(modelProviderAttempts(c, "test-round-robin").map((provider) => provider.id), ["p2"]);
});

test("failover includes later model providers in selected order", () => {
  const c = config("round-robin", true);
  assert.deepEqual(modelProviderAttempts(c, "test-failover").map((provider) => provider.id), ["p1", "p2"]);
  assert.deepEqual(modelProviderAttempts(c, "test-failover").map((provider) => provider.id), ["p2", "p1"]);
});

test("multimodal attempts exclude text-only providers", () => {
  const c = config("round-robin", true);
  assert.deepEqual(modelProviderAttempts(c, "test-vision", { requireMultimodal: true }).map((provider) => provider.id), ["p1"]);
});
