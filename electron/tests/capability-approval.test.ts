import assert from "node:assert/strict";
import test from "node:test";
import { capabilityOwnerApprovalReason } from "../capability-approval.js";
import type { CustomAppSummary } from "../types.js";

const app: CustomAppSummary = {
  id: "risky-app",
  name: "Risky App",
  description: "Requires approval",
  version: "1.0.0",
  path: "/apps/risky-app",
  source: "local",
  entry: { type: "node", command: "node", args: ["index.js"] },
  capabilities: { agentCallable: true, commandCallable: true, scheduledCallable: true, hasUi: false },
  permissions: { network: false, filesystem: ["workspace"], requiresOwnerApproval: true }
};

test("requires owner approval when capability policy says so", () => {
  const reason = capabilityOwnerApprovalReason(
    { kind: "skill", id: "sensitive-skill" },
    new Map([["skill:sensitive-skill", { requireOwnerApproval: true }]]),
    []
  );
  assert.match(reason, /policy/);
});

test("requires owner approval when custom app manifest says so", () => {
  const reason = capabilityOwnerApprovalReason(
    { kind: "app", id: "risky-app" },
    new Map(),
    [app]
  );
  assert.match(reason, /自定义应用/);
});

test("does not require approval by default", () => {
  const reason = capabilityOwnerApprovalReason(
    { kind: "suite", id: "qa" },
    new Map(),
    [app]
  );
  assert.equal(reason, "");
});
