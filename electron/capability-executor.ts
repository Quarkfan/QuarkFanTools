import { runClaude } from "./claude.js";
import { runCustomApp } from "./custom-app-runner.js";
import type { AppConfig, BotConfig, LarkMessage } from "./types.js";
import type { ExecutableCapabilityBinding } from "./executable-capability-bindings.js";
import { buildWorkflowStepPrompt } from "./workflow-steps.js";
import { evaluateWorkflowCondition } from "./workflow-control.js";

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
  status: "started" | "success" | "failed" | "skipped";
  at: string;
  attempt?: number;
  maxAttempts?: number;
  output?: string;
  error?: string;
}

export async function executeCapabilityTarget(request: CapabilityExecutionRequest): Promise<string> {
  if (request.binding.type === "claude") {
    return executeClaudeBinding(request, request.binding, request.prompt);
  }
  if (request.binding.type === "workflow") {
    const workflowBinding = request.binding;
    let previous = "";
    const steps: Record<string, string> = {};
    const variables: Record<string, string> = {
      input: request.prompt,
      workflowPrompt: workflowBinding.prompt
    };
    for (const step of workflowBinding.steps) {
      const context = () => ({
        workflowPrompt: workflowBinding.prompt,
        stepPrompt: step.prompt,
        input: request.prompt,
        previous,
        steps,
        variables
      });
      if (!evaluateWorkflowCondition(step.condition, context())) {
        emitWorkflowStep(request, step, "skipped");
        continue;
      }
      const repeatMax = step.repeat?.maxTimes ?? 1;
      const maxAttempts = step.retry?.maxAttempts ?? 1;
      for (let repeat = 1; repeat <= repeatMax; repeat += 1) {
        let completed = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          request.onProgress?.(`工作流步骤 ${step.name}${repeatMax > 1 ? `（循环 ${repeat}/${repeatMax}）` : ""}${maxAttempts > 1 ? `（第 ${attempt}/${maxAttempts} 次）` : ""}`);
          emitWorkflowStep(request, step, "started", { attempt, maxAttempts });
          try {
            const stepPrompt = buildWorkflowStepPrompt({
              workflowPrompt: workflowBinding.prompt,
              stepPrompt: step.prompt,
              input: request.prompt,
              previous,
              steps,
              variables,
              template: step.input
            });
            previous = await withTimeout(
              step.type === "prompt"
                ? executeClaudeBinding(request, step.claude, stepPrompt)
                : executeCapabilityTarget({ ...request, binding: step.binding, prompt: stepPrompt }),
              step.timeoutSeconds,
              `Workflow 步骤 ${step.name} 超过 ${step.timeoutSeconds} 秒未完成`
            );
            steps[step.id] = previous;
            variables[`steps.${step.id}`] = previous;
            emitWorkflowStep(request, step, "success", { output: previous, attempt, maxAttempts });
            completed = true;
            break;
          } catch (error) {
            const message = String(error instanceof Error ? error.message : error);
            emitWorkflowStep(request, step, "failed", { error: message, attempt, maxAttempts });
            if (attempt >= maxAttempts) {
              if (step.continueOnError) {
                previous = "";
                steps[step.id] = "";
                completed = true;
                break;
              }
              throw error;
            }
          }
        }
        if (!completed) break;
        if (step.repeat?.until && evaluateWorkflowCondition(step.repeat.until, context())) {
          break;
        }
      }
    }
    return previous || `${workflowBinding.capability.name} 执行完成，但没有生成可回复内容。`;
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
  detail: Pick<WorkflowStepExecutionEvent, "attempt" | "maxAttempts" | "output" | "error"> = {}
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

async function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number | undefined, message: string): Promise<T> {
  if (!timeoutSeconds) return promise;
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutSeconds * 1000);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
