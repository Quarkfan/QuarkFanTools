import type { BotConfig, CustomAppSummary } from "./types.js";

type CapabilityPolicyMap = Map<string, NonNullable<BotConfig["capabilityRefs"]>[number]["policy"]>;

export function capabilityOwnerApprovalReason(
  capability: { kind: "skill" | "mcp" | "app" | "suite" | "workflow"; id: string },
  policies: CapabilityPolicyMap,
  customApps: CustomAppSummary[]
): string {
  const policy = policies.get(`${capability.kind}:${capability.id}`);
  if (policy?.requireOwnerApproval) return "Bot capability policy 要求审批";
  if (capability.kind === "app") {
    const app = customApps.find((item) => item.id === capability.id);
    if (app?.permissions.requiresOwnerApproval) return "自定义应用声明需要 Owner 审批";
  }
  return "";
}
