import assert from "node:assert/strict";
import test from "node:test";
import { commandHelpText, commandPrompt, findCommandBinding, parseSlashCommand } from "../commands.js";
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
    aliases: ["daily", "day"],
    enabled: true,
    description: "生成日报",
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
  assert.deepEqual(parseSlashCommand("/help"), { name: "help", args: "" });
  assert.equal(parseSlashCommand("/continue abc"), null);
  assert.equal(parseSlashCommand("普通文本"), null);
});

test("finds enabled command bindings and builds prompt text", () => {
  const binding = findCommandBinding(bindings, "report");
  assert.ok(binding);
  assert.equal(findCommandBinding(bindings, "daily")?.name, "report");
  assert.equal(commandPrompt(binding!, "A 产线"), "生成日报：A 产线");
  assert.equal(commandPrompt(bindings[0], "问题摘要"), "问题摘要");
});

test("builds command help text with aliases and descriptions", () => {
  const help = commandHelpText(bindings);
  assert.match(help, /\/ppt/);
  assert.match(help, /\/report（别名：\/daily、\/day） - 生成日报/);
});
