import { runClaude } from "./claude.js";
import { runCustomApp } from "./custom-app-runner.js";
import type { AppConfig, BotConfig, LarkMessage } from "./types.js";
import type { ExecutableCapabilityBinding } from "./executable-capability-bindings.js";

export interface CapabilityExecutionRequest {
  config: AppConfig;
  bot: BotConfig;
  conversationKey: string;
  messageId: string;
  originalUserText: string;
  baseMessage: LarkMessage;
  prompt: string;
  binding: ExecutableCapabilityBinding;
  resumeSessionId?: string;
  onProgress?: (text: string) => void;
  onWorkflowStep?: (event: WorkflowStepExecutionEvent) => void;
  onSessionSaved?: (sessionId: string, assistant: string) => Promise<void>;
}

export interface WorkflowStepExecutionEvent {
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  stepType: "prompt" | "capability";
  status: "started" | "success" | "failed";
  at: string;
  output?: string;
  error?: string;
}

export async function executeCapabilityTarget(request: CapabilityExecutionRequest): Promise<string> {
  if (request.binding.type === "claude") {
    return executeClaudeBinding(request, request.binding, request.prompt);
  }
  if (request.binding.type === "workflow") {
    let previous = "";
    for (const step of request.binding.steps) {
      request.onProgress?.(`工作流步骤 ${step.name}`);
      emitWorkflowStep(request, step, "started");
      try {
        const stepPrompt = [
          request.binding.prompt,
          step.prompt,
          previous ? `上一步输出：\n${previous}` : "",
          `当前输入：\n${request.prompt}`
        ].filter(Boolean).join("\n\n");
        previous = step.type === "prompt"
          ? await executeClaudeBinding(request, step.claude, stepPrompt)
          : await executeCapabilityTarget({ ...request, binding: step.binding, prompt: stepPrompt });
        emitWorkflowStep(request, step, "success", { output: previous });
      } catch (error) {
        emitWorkflowStep(request, step, "failed", { error: String(error instanceof Error ? error.message : error) });
        throw error;
      }
    }
    return previous || `${request.binding.capability.name} 执行完成，但没有生成可回复内容。`;
  }
  return (await runCustomApp(
    request.bot,
    request.binding.customApp,
    request.baseMessage,
    request.conversationKey,
    request.prompt,
    request.binding.trigger
  )).reply;
}

function emitWorkflowStep(
  request: CapabilityExecutionRequest,
  step: Extract<ExecutableCapabilityBinding, { type: "workflow" }>["steps"][number],
  status: WorkflowStepExecutionEvent["status"],
  detail: Pick<WorkflowStepExecutionEvent, "output" | "error"> = {}
): void {
  if (request.binding.type !== "workflow") return;
  request.onWorkflowStep?.({
    workflowId: request.binding.capability.id,
    workflowName: request.binding.capability.name,
    stepId: step.id,
    stepName: step.name,
    stepType: step.type,
    status,
    at: new Date().toISOString(),
    ...detail
  });
}

async function executeClaudeBinding(
  request: CapabilityExecutionRequest,
  binding: Extract<ExecutableCapabilityBinding, { type: "claude" }>,
  input: string
): Promise<string> {
  const prompt = binding.workflowPrompt
    ? `${binding.workflowPrompt}\n\n${input}`.trim()
    : input;
  const result = await runClaude(
    request.config,
    request.bot,
    { ...request.baseMessage, text: prompt },
    binding.skills,
    request.conversationKey,
    request.resumeSessionId,
    (progress) => request.onProgress?.(progress.text),
    binding.suiteContexts
  );
  if (result.sessionId) {
    await request.onSessionSaved?.(result.sessionId, result.response);
  }
  return result.response;
}
