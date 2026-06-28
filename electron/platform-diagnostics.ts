import type { AppConfig, PlatformConnectorDiagnostic } from "./types.js";

export function platformConnectorDiagnostics(config: AppConfig): PlatformConnectorDiagnostic[] {
  return config.bots.map((bot) => {
    const provider = bot.provider ?? "lark";
    const issues: string[] = [];
    const recommendations: string[] = [];
    if (!bot.enabled) issues.push("Bot 已停用");
    if (!bot.appId.trim()) issues.push(provider === "wecom" ? "未配置企业微信 Bot ID" : "未配置 App ID");
    if (!bot.appSecret.trim()) issues.push(provider === "wecom" ? "未配置企业微信 Bot Secret" : "未配置 App Secret");
    if (provider === "wecom") {
      issues.push("企业微信 Provider 因官方能力限制暂时封闭，当前版本不会启动监听、轮询或投递");
      recommendations.push("请先改用飞书作为主消息平台；已填写的企业微信配置会保留，后续重新开放时可继续参考。");
      const lark = bot.connectors?.lark;
      if (lark?.enabled) {
        if (!lark.appId.trim()) issues.push("飞书知识连接器未配置 App ID");
        if (!lark.appSecret.trim()) issues.push("飞书知识连接器未配置 App Secret");
        if (!lark.oauthScopes?.includes("search:docs:read")) recommendations.push("飞书知识连接器建议包含 search:docs:read scope，并在 Bot 配置页完成用户态 OAuth。");
      }
      for (const route of bot.deliveryRoutes ?? []) {
        if (!route.enabled) continue;
        if (!route.chatId.trim()) issues.push(`投递路由 ${route.name || route.id} 未配置 chat_id`);
        if (route.provider === "lark" && !lark?.enabled) issues.push(`投递路由 ${route.name || route.id} 指向飞书，但飞书知识连接器未启用`);
      }
    }
    if (provider === "dingtalk") {
      issues.push("钉钉 Provider 仅预留结构，当前不能启动监听");
    }
    const status: PlatformConnectorDiagnostic["status"] = issues.some((issue) => /未配置|不能/.test(issue))
      ? "error"
      : issues.length > 0 || recommendations.length > 0 ? "warn" : "ok";
    return {
      botId: bot.id,
      botName: bot.name || bot.id,
      provider,
      status,
      issues,
      recommendations
    };
  });
}
