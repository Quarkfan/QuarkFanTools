import path from "node:path";
import { discoverCustomApps } from "./apps.js";
import { discoverSkills } from "./skills.js";
import { discoverSuites } from "./suites.js";

export type ResourceLocationKind = "skill" | "app" | "suite";

export interface ResourceLocationRequest {
  kind: ResourceLocationKind;
  id: string;
}

export async function resourceDirectory(request: ResourceLocationRequest): Promise<string> {
  if (request.kind === "skill") {
    const skill = (await discoverSkills()).find((item) => item.name === request.id);
    if (!skill) throw new Error("Skill 不存在");
    return path.dirname(skill.path);
  }
  if (request.kind === "app") {
    const app = (await discoverCustomApps()).find((item) => item.id === request.id);
    if (!app) throw new Error("自定义应用不存在");
    return app.path;
  }
  if (request.kind === "suite") {
    const suite = (await discoverSuites()).find((item) => item.id === request.id);
    if (!suite) throw new Error("套件不存在");
    return suite.path;
  }
  throw new Error("不支持的资源类型");
}
