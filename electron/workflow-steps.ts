export function buildWorkflowStepPrompt(options: {
  workflowPrompt: string;
  stepPrompt: string;
  input: string;
  previous: string;
  steps?: Record<string, string>;
  variables?: Record<string, string>;
  template?: string;
}): string {
  const context = [
    options.workflowPrompt,
    options.stepPrompt,
    options.previous ? `上一步输出：\n${options.previous}` : "",
    `当前输入：\n${options.input}`
  ].filter(Boolean).join("\n\n");
  if (!options.template) return context;
  return renderWorkflowTemplate(options.template, options)
    .trim();
}

export function renderWorkflowTemplate(template: string, options: {
  workflowPrompt: string;
  stepPrompt: string;
  input: string;
  previous: string;
  steps?: Record<string, string>;
  variables?: Record<string, string>;
}): string {
  return template
    .replaceAll("{{workflowPrompt}}", options.workflowPrompt)
    .replaceAll("{{stepPrompt}}", options.stepPrompt)
    .replaceAll("{{previous}}", options.previous)
    .replaceAll("{{input}}", options.input)
    .replace(/\{\{steps\.([a-z0-9._-]+)\}\}/g, (_match, stepId: string) => options.steps?.[stepId] ?? "")
    .replace(/\{\{variables\.([a-zA-Z0-9._-]+)\}\}/g, (_match, key: string) => options.variables?.[key] ?? "");
}
