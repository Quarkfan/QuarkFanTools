import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflowStepPrompt } from "../workflow-steps.js";
import { evaluateWorkflowCondition } from "../workflow-control.js";

test("builds workflow step prompt with default context", () => {
  const prompt = buildWorkflowStepPrompt({
    workflowPrompt: "Follow the workflow.",
    stepPrompt: "Collect facts.",
    input: "Investigate order 123.",
    previous: "Known defect: scratch."
  });
  assert.match(prompt, /Follow the workflow/);
  assert.match(prompt, /Collect facts/);
  assert.match(prompt, /上一步输出：\nKnown defect: scratch/);
  assert.match(prompt, /当前输入：\nInvestigate order 123/);
});

test("builds workflow step prompt with step outputs and variables", () => {
  const prompt = buildWorkflowStepPrompt({
    workflowPrompt: "Follow the workflow.",
    stepPrompt: "Summarize.",
    input: "Investigate order 123.",
    previous: "Previous output.",
    steps: { collect: "Collected facts." },
    variables: { owner: "quality" },
    template: "{{stepPrompt}}\n{{steps.collect}}\n{{variables.owner}}\n{{variables.missing}}"
  });
  assert.equal(prompt, "Summarize.\nCollected facts.\nquality");
});

test("evaluates workflow step conditions with templates", () => {
  const context = {
    workflowPrompt: "Follow the workflow.",
    stepPrompt: "Analyze.",
    input: "Investigate order 123.",
    previous: "severity=high",
    steps: { collect: "defect: scratch" },
    variables: { channel: "qa" }
  };
  assert.equal(evaluateWorkflowCondition({ if: "{{previous}}", includes: "high" }, context), true);
  assert.equal(evaluateWorkflowCondition({ if: "{{steps.collect}}", matches: "scratch$" }, context), true);
  assert.equal(evaluateWorkflowCondition({ if: "{{variables.channel}}", equals: "qa" }, context), true);
  assert.equal(evaluateWorkflowCondition({ if: "{{variables.channel}}", equals: "qa", not: true }, context), false);
  assert.equal(evaluateWorkflowCondition({ if: "{{previous}}", matches: "[" }, context), false);
});

test("builds workflow step prompt from explicit input template", () => {
  const prompt = buildWorkflowStepPrompt({
    workflowPrompt: "Follow the workflow.",
    stepPrompt: "Analyze.",
    input: "Investigate order 123.",
    previous: "Known defect: scratch.",
    template: "{{stepPrompt}}\n\nFacts:\n{{previous}}\n\nRequest:\n{{input}}\n\nRules:\n{{workflowPrompt}}"
  });
  assert.equal(prompt, [
    "Analyze.",
    "",
    "Facts:",
    "Known defect: scratch.",
    "",
    "Request:",
    "Investigate order 123.",
    "",
    "Rules:",
    "Follow the workflow."
  ].join("\n"));
});
