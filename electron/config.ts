import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfigPath, localConfigPath } from "./paths.js";
import type { AppConfig } from "./types.js";

function mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...override,
    lark: { ...base.lark, ...override.lark },
    model: { ...base.model, ...override.model },
    runtime: { ...base.runtime, ...override.runtime }
  };
}

export async function loadConfig(): Promise<AppConfig> {
  const base = JSON.parse(await readFile(defaultConfigPath(), "utf8")) as AppConfig;
  try {
    const local = JSON.parse(await readFile(localConfigPath(), "utf8")) as Partial<AppConfig>;
    return mergeConfig(base, local);
  } catch {
    return base;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(path.dirname(localConfigPath()), { recursive: true });
  await writeFile(localConfigPath(), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
