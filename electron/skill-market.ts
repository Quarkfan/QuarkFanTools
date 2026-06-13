import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs, { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { marketSkillsRoot } from "./paths.js";
import type { AppConfig } from "./types.js";

export async function syncSkillMarket(config: AppConfig["skillMarket"]): Promise<void> {
  const dir = marketSkillsRoot();
  if (!config.enabled) {
    await rm(dir, { recursive: true, force: true });
    return;
  }
  if (!config.repositoryUrl.trim()) throw new Error("启用技能市场后必须配置 HTTPS Git 仓库");
  if (!/^https:\/\//i.test(config.repositoryUrl)) {
    throw new Error("技能市场仅支持 HTTPS Git 仓库，以确保无需用户安装 Git 或 SSH 环境");
  }
  await mkdir(dir, { recursive: true });
  const onAuth = config.token
    ? () => ({ username: config.token, password: "x-oauth-basic" })
    : undefined;
  if (existsSync(`${dir}/.git`)) {
    const remotes = await git.listRemotes({ fs, dir });
    const branch = await git.currentBranch({ fs, dir, fullname: false });
    const origin = remotes.find((remote) => remote.remote === "origin")?.url;
    if (origin !== config.repositoryUrl || branch !== (config.branch || "main")) {
      await rm(dir, { recursive: true, force: true });
    }
  }
  if (existsSync(`${dir}/.git`)) {
    await git.pull({
      fs,
      http,
      dir,
      ref: config.branch || "main",
      singleBranch: true,
      fastForwardOnly: true,
      author: { name: "QuarkfanTools", email: "local@quarkfantools" },
      onAuth
    });
    return;
  }
  await rm(dir, { recursive: true, force: true });
  await git.clone({
    fs,
    http,
    dir,
    url: config.repositoryUrl,
    ref: config.branch || "main",
    singleBranch: true,
    depth: 1,
    onAuth
  });
}
