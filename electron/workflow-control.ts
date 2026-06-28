import type { WorkflowStepCondition } from "./types.js";
import { renderWorkflowTemplate } from "./workflow-steps.js";

export interface WorkflowControlContext {
  workflowPrompt: string;
  stepPrompt: string;
  input: string;
  previous: string;
  steps: Record<string, string>;
  variables: Record<string, string>;
}

export function evaluateWorkflowCondition(condition: WorkflowStepCondition | undefined, context: WorkflowControlContext): boolean {
  if (!condition) return true;
  const rendered = renderWorkflowTemplate(condition.if ?? "{{previous}}", context);
  let matched = Boolean(rendered.trim());
  if (typeof condition.equals === "string") matched = rendered === renderWorkflowTemplate(condition.equals, context);
  if (typeof condition.includes === "string") matched = rendered.includes(renderWorkflowTemplate(condition.includes, context));
  if (typeof condition.matches === "string") {
    try {
      matched = new RegExp(condition.matches).test(rendered);
    } catch {
      matched = false;
    }
  }
  return condition.not ? !matched : matched;
}
