import type { BotCommandBinding } from "./types.js";

const RESERVED_COMMANDS = new Set(["new", "continue", "owner"]);

export interface ParsedCommandInvocation {
  name: string;
  args: string;
}

export function parseSlashCommand(text: string): ParsedCommandInvocation | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (RESERVED_COMMANDS.has(name)) return null;
  return {
    name,
    args: (match[2] ?? "").trim()
  };
}

export function findCommandBinding(bindings: BotCommandBinding[] | undefined, name: string): BotCommandBinding | null {
  if (!bindings?.length) return null;
  return bindings.find((binding) => binding.enabled && binding.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export function commandPrompt(binding: BotCommandBinding, args: string): string {
  if (binding.promptTemplate?.trim()) {
    return binding.promptTemplate.replaceAll("{{args}}", args);
  }
  return args || `执行命令 /${binding.name}`;
}
