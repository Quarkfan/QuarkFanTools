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
  const normalized = name.toLowerCase();
  return bindings.find((binding) =>
    binding.enabled &&
    (binding.name.toLowerCase() === normalized || (binding.aliases ?? []).some((alias) => alias.toLowerCase() === normalized))
  ) ?? null;
}

export function commandPrompt(binding: BotCommandBinding, args: string): string {
  if (binding.promptTemplate?.trim()) {
    return binding.promptTemplate.replaceAll("{{args}}", args);
  }
  return args || `执行命令 /${binding.name}`;
}

export function commandHelpText(bindings: BotCommandBinding[] | undefined): string {
  const active = (bindings ?? []).filter((binding) => binding.enabled);
  if (active.length === 0) return "当前 Bot 没有配置可用命令。";
  return [
    "当前 Bot 可用命令：",
    ...active.map((binding) => {
      const aliases = (binding.aliases ?? []).length > 0 ? `（别名：${binding.aliases?.map((alias) => `/${alias}`).join("、")}）` : "";
      const description = binding.description ? ` - ${binding.description}` : "";
      return `- /${binding.name}${aliases}${description}`;
    })
  ].join("\n");
}
