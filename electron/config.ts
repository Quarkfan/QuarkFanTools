import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfigPath, localConfigPath } from "./paths.js";
import { mergeConfig, type LegacyConfig } from "./config-merge.js";
import { persistBotScheduledTasks } from "./scheduled-tasks.js";
import type { AppConfig } from "./types.js";

export async function loadConfig(): Promise<AppConfig> {
  const base = JSON.parse(await readFile(defaultConfigPath(), "utf8")) as AppConfig;
  try {
    const local = JSON.parse(await readFile(localConfigPath(), "utf8")) as LegacyConfig;
    return mergeConfig(base, local);
  } catch {
    return base;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const base = JSON.parse(await readFile(defaultConfigPath(), "utf8")) as AppConfig;
  const normalized = mergeConfig(base, config as LegacyConfig);
  await mkdir(path.dirname(localConfigPath()), { recursive: true });
  await writeFile(localConfigPath(), `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await Promise.all(config.bots.map((bot) => persistBotScheduledTasks(bot)));
}
