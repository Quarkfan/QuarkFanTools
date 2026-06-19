import assert from "node:assert/strict";
import test from "node:test";
import { commandPrompt, findCommandBinding, parseSlashCommand } from "../commands.js";
import type { BotCommandBinding } from "../types.js";

const bindings: BotCommandBinding[] = [
  {
    name: "ppt",
    enabled: true,
    target: {
      type: "capability",
      capability: { kind: "skill", id: "pptx" }
    }
  },
  {
    name: "report",
    enabled: true,
    promptTemplate: "生成日报：{{args}}",
    target: {
      type: "capability",
      capability: { kind: "app", id: "daily-report" }
    }
  },
  {
    name: "qa",
    enabled: true,
    target: {
      type: "capability",
      capability: { kind: "suite", id: "manufacturing-qa" }
    }
  }
];

test("parses configured slash commands but ignores reserved commands", () => {
  assert.deepEqual(parseSlashCommand("/ppt 质量周报"), { name: "ppt", args: "质量周报" });
  assert.equal(parseSlashCommand("/continue abc"), null);
  assert.equal(parseSlashCommand("普通文本"), null);
});

test("finds enabled command bindings and builds prompt text", () => {
  const binding = findCommandBinding(bindings, "report");
  assert.ok(binding);
  assert.equal(commandPrompt(binding!, "A 产线"), "生成日报：A 产线");
  assert.equal(commandPrompt(bindings[0], "问题摘要"), "问题摘要");
});
