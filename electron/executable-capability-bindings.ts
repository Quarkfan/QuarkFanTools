import type { ClaudeSuiteContext } from "./claude.js";
import type { BotConfig, CustomAppSummary, McpServerConfig, SkillSummary, SuiteWorkflowStepSummary, SuiteSummary } from "./types.js";

export type ExecutableCapabilityTrigger = "command" | "scheduled" | "agent";

export type ExecutableCapabilityBinding =
  | {
      type: "claude";
      trigger: ExecutableCapabilityTrigger;
      capability: {
        kind: "skill" | "mcp" | "suite" | "workflow";
        id: string;
        name: string;
      };
      skills: SkillSummary[];
      suiteContexts: ClaudeSuiteContext[];
      workflowPrompt?: string;
    }
  | {
      type: "custom-app";
      trigger: ExecutableCapabilityTrigger;
      capability: {
        kind: "app";
        id: string;
        name: string;
      };
      customApp: CustomAppSummary;
    }
  | {
      type: "workflow";
      trigger: ExecutableCapabilityTrigger;
      capability: {
        kind: "workflow";
        id: string;
        name: string;
      };
      prompt: string;
      steps: ExecutableWorkflowStep[];
    };

export type ExecutableWorkflowStep =
  | {
      id: string;
      name: string;
      type: "prompt";
      prompt: string;
      input?: string;
      condition?: SuiteWorkflowStepSummary["condition"];
      continueOnError?: boolean;
      repeat?: SuiteWorkflowStepSummary["repeat"];
      timeoutSeconds?: number;
      retry?: {
        maxAttempts: number;
      };
      claude: Extract<ExecutableCapabilityBinding, { type: "claude" }>;
    }
  | {
      id: string;
      name: string;
      type: "capability";
      prompt: string;
      input?: string;
      condition?: SuiteWorkflowStepSummary["condition"];
      continueOnError?: boolean;
      repeat?: SuiteWorkflowStepSummary["repeat"];
      timeoutSeconds?: number;
      retry?: {
        maxAttempts: number;
      };
      binding: Exclude<ExecutableCapabilityBinding, { type: "workflow" }>;
    };

export interface ResolveExecutableCapabilityBindingOptions {
  bot: BotConfig;
  capability: {
    kind: "skill" | "mcp" | "app" | "suite" | "workflow";
    id: string;
  };
  trigger: ExecutableCapabilityTrigger;
  botSkills: SkillSummary[];
  customApps: CustomAppSummary[];
  mcpServers?: McpServerConfig[];
  suites: SuiteSummary[];
  suiteContexts: ClaudeSuiteContext[];
  capabilityPolicies?: Map<string, NonNullable<BotConfig["capabilityRefs"]>[number]["policy"] | undefined>;
  errorLabel: string;
}

export function resolveExecutableCapabilityBinding(options: ResolveExecutableCapabilityBindingOptions): ExecutableCapabilityBinding {
  ensureTriggerAllowed(options);

  if (options.capability.kind === "skill") {
    const selectedSkill = options.botSkills.find((skill) => skill.name === options.capability.id);
    if (!selectedSkill) throw new Error(`${options.errorLabel} 指向的 Skill 不存在或未授权。`);
    return {
      type: "claude",
      trigger: options.trigger,
      capability: {
        kind: "skill",
        id: selectedSkill.name,
        name: selectedSkill.name
      },
      skills: [selectedSkill],
      suiteContexts: options.suiteContexts
    };
  }

  if (options.capability.kind === "suite") {
    const suite = options.suites.find((item) => item.id === options.capability.id);
    if (!suite) throw new Error(`${options.errorLabel} 指向的套件不存在或未导入。`);
    const suiteSkills = options.botSkills.filter((skill) => suite.skills.includes(skill.name));
    return {
      type: "claude",
      trigger: options.trigger,
      capability: {
        kind: "suite",
        id: suite.id,
        name: suite.name
      },
      skills: suiteSkills.length > 0 ? suiteSkills : options.botSkills,
      suiteContexts: options.suiteContexts.filter((item) => item.suite.id === suite.id)
    };
  }

  if (options.capability.kind === "mcp") {
    const server = options.mcpServers?.find((item) => item.id === options.capability.id);
    if (!server || !server.enabled) throw new Error(`${options.errorLabel} 指向的 MCP 不存在、未启用或未授权。`);
    if (server.transport !== "stdio") throw new Error(`${options.errorLabel} 指向的 MCP 已保存为 ${server.transport.toUpperCase()} 占位配置，当前尚未接入运行时。`);
    if (!server.command.trim()) throw new Error(`${options.errorLabel} 指向的 MCP 尚未配置启动命令。`);
    return {
      type: "claude",
      trigger: options.trigger,
      capability: {
        kind: "mcp",
        id: server.id,
        name: server.name
      },
      skills: [],
      suiteContexts: [],
      workflowPrompt: `本次请求绑定到 MCP 服务「${server.name}」（${server.id}）。请优先使用该 Bot 已授权的对应 MCP 工具完成任务；如果该 MCP 无法完成，请明确说明原因。`
    };
  }

  if (options.capability.kind === "workflow") {
    const [suiteId, workflowId] = options.capability.id.split("/", 2);
    const suite = options.suites.find((item) => item.id === suiteId);
    const workflow = suite?.workflows.find((item) => item.id === workflowId);
    if (!suite || !workflow) throw new Error(`${options.errorLabel} 指向的工作流不存在或未导入。`);
    const suiteSkills = options.botSkills.filter((skill) => suite.skills.includes(skill.name));
    const claudeBinding: Extract<ExecutableCapabilityBinding, { type: "claude" }> = {
      type: "claude",
      trigger: options.trigger,
      capability: {
        kind: "workflow",
        id: options.capability.id,
        name: `${suite.name} / ${workflow.name}`
      },
      skills: suiteSkills.length > 0 ? suiteSkills : options.botSkills,
      suiteContexts: options.suiteContexts.filter((item) => item.suite.id === suite.id),
      workflowPrompt: workflow.prompt
    };
    if (workflow.steps.length > 0) {
      return {
        type: "workflow",
        trigger: options.trigger,
        capability: {
          kind: "workflow",
          id: options.capability.id,
          name: `${suite.name} / ${workflow.name}`
        },
        prompt: workflow.prompt,
        steps: workflow.steps.map((step) => resolveWorkflowStep(options, step, claudeBinding))
      };
    }
    return {
      ...claudeBinding
    };
  }

  const customApp = options.customApps.find((item) => item.id === options.capability.id);
  if (!customApp) throw new Error(`${options.errorLabel} 指向的自定义应用不存在或未导入。`);
  if (options.trigger === "command" && !customApp.capabilities.commandCallable) {
    throw new Error(`${options.errorLabel} 指向的自定义应用未声明命令调用能力。`);
  }
  if (options.trigger === "scheduled" && !customApp.capabilities.scheduledCallable) {
    throw new Error(`${options.errorLabel} 指向的自定义应用不存在、未授权或未声明定时调用能力。`);
  }
  if (options.trigger === "agent" && !customApp.capabilities.agentCallable) {
    throw new Error(`${options.errorLabel} 指向的自定义应用未声明 Agent 调用能力。`);
  }
  if (!["node", "executable"].includes(customApp.entry.type)) {
    throw new Error(`${options.errorLabel} 指向的自定义应用入口类型为 ${customApp.entry.type}，当前仅作为建设中能力展示，暂不能执行。`);
  }
  return {
    type: "custom-app",
    trigger: options.trigger,
    capability: {
      kind: "app",
      id: customApp.id,
      name: customApp.name
    },
    customApp
  };
}

function resolveWorkflowStep(
  options: ResolveExecutableCapabilityBindingOptions,
  step: SuiteWorkflowStepSummary,
  claudeBinding: Extract<ExecutableCapabilityBinding, { type: "claude" }>
): ExecutableWorkflowStep {
  if (step.type === "prompt") {
    return {
      id: step.id,
      name: step.name,
      type: "prompt",
      prompt: step.prompt,
      input: step.input,
      condition: step.condition,
      continueOnError: step.continueOnError,
      repeat: step.repeat,
      timeoutSeconds: step.timeoutSeconds,
      retry: step.retry,
      claude: {
        ...claudeBinding,
        workflowPrompt: undefined
      }
    };
  }
  if (!step.capability) throw new Error(`${options.errorLabel} 工作流步骤 ${step.name} 缺少能力目标。`);
  const binding = resolveExecutableCapabilityBinding({
    ...options,
    capability: step.capability,
    errorLabel: `${options.errorLabel} 工作流步骤 ${step.name}`
  });
  if (binding.type === "workflow") {
    throw new Error(`${options.errorLabel} 工作流步骤 ${step.name} 不能递归调用 Workflow。`);
  }
  return {
    id: step.id,
    name: step.name,
    type: "capability",
    prompt: step.prompt,
    input: step.input,
    condition: step.condition,
    continueOnError: step.continueOnError,
    repeat: step.repeat,
    timeoutSeconds: step.timeoutSeconds,
    retry: step.retry,
    binding
  };
}

function ensureTriggerAllowed(options: ResolveExecutableCapabilityBindingOptions): void {
  const policy = options.capabilityPolicies?.get(`${options.capability.kind}:${options.capability.id}`);
  if (!policy) return;
  if (options.trigger === "command" && policy.allowCommandUse === false) {
    throw new Error(`${options.errorLabel} 指向的能力未开放命令调用。`);
  }
  if (options.trigger === "scheduled" && policy.allowScheduledUse === false) {
    throw new Error(`${options.errorLabel} 指向的能力未开放定时调用。`);
  }
  if (options.trigger === "agent" && policy.allowAgentUse === false) {
    throw new Error(`${options.errorLabel} 指向的能力未开放 Agent 调用。`);
  }
}
