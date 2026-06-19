export function detectRawLarkDriveFileCommand(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  if (value.type !== "assistant") return null;
  const message = value.message as { content?: Array<Record<string, unknown>> } | undefined;
  const tool = message?.content?.find((block) => block.type === "tool_use" && block.name === "Bash");
  const input = tool?.input;
  if (!input || typeof input !== "object") return null;
  const command = String((input as Record<string, unknown>).command ?? "");
  if (!/\blark-cli\b[\s\S]*\bdrive\s+\+(download|export)\b/.test(command)) return null;
  return command.trim();
}
