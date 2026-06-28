export type DesktopTargetApp = "wechat";

export type DesktopAgentAction =
  | { type: "activate-app"; app: DesktopTargetApp }
  | { type: "search-contact"; app: DesktopTargetApp; contactName: string }
  | { type: "capture-window"; app: DesktopTargetApp; reason: string }
  | { type: "verify-conversation"; app: DesktopTargetApp; expectedTitle: string; minConfidence: number }
  | { type: "paste-draft"; app: DesktopTargetApp; text: string }
  | { type: "stop-for-user-confirmation"; app: DesktopTargetApp; reason: string }
  | { type: "send-message"; app: DesktopTargetApp };

export interface WeChatDraftPlanRequest {
  contactName: string;
  draftText: string;
  recentMessageLimit?: number;
}

export interface DesktopAgentObservation {
  app: DesktopTargetApp;
  activeConversationTitle?: string;
  conversationConfidence?: number;
  inputText?: string;
}

export interface DesktopAgentValidationOptions {
  expectedContactName: string;
  draftText: string;
  allowAutoSend?: boolean;
  autoSendWhitelist?: string[];
  minConversationConfidence?: number;
}

export interface DesktopAgentValidationResult {
  ok: boolean;
  issues: string[];
}

const HIGH_RISK_DRAFT_PATTERNS = [
  /转账|打款|付款|收款|发票|合同|报价|退款|赔偿|承诺|保证|一定交付/,
  /\b\d+(?:\.\d+)?\s*(?:元|万|w|W|k|K)\b/
];

export function buildWeChatDraftPlan(request: WeChatDraftPlanRequest): DesktopAgentAction[] {
  const contactName = request.contactName.trim();
  const draftText = request.draftText.trim();
  if (!contactName) throw new Error("缺少微信联系人名称");
  if (!draftText) throw new Error("缺少要写入微信输入框的草稿内容");
  return [
    { type: "activate-app", app: "wechat" },
    { type: "search-contact", app: "wechat", contactName },
    { type: "capture-window", app: "wechat", reason: `读取最近 ${request.recentMessageLimit ?? 10} 条消息并确认当前会话` },
    { type: "verify-conversation", app: "wechat", expectedTitle: contactName, minConfidence: 0.9 },
    { type: "paste-draft", app: "wechat", text: draftText },
    { type: "capture-window", app: "wechat", reason: "确认输入框中已写入草稿且未发送" },
    { type: "stop-for-user-confirmation", app: "wechat", reason: "PoC 默认只生成草稿，不点击发送或按 Enter" }
  ];
}

export function validateDesktopAgentActions(
  actions: DesktopAgentAction[],
  observation: DesktopAgentObservation,
  options: DesktopAgentValidationOptions
): DesktopAgentValidationResult {
  const issues: string[] = [];
  const minConfidence = options.minConversationConfidence ?? 0.9;
  if (observation.app !== "wechat") issues.push("当前活动应用不是微信");
  if ((observation.activeConversationTitle ?? "").trim() !== options.expectedContactName.trim()) {
    issues.push("当前会话标题与目标联系人不一致");
  }
  if ((observation.conversationConfidence ?? 0) < minConfidence) {
    issues.push(`当前会话识别置信度低于 ${minConfidence}`);
  }
  if ((observation.inputText ?? "").trim() && (observation.inputText ?? "").trim() !== options.draftText.trim()) {
    issues.push("微信输入框已有其他内容，不能覆盖");
  }
  const wantsSend = actions.some((action) => action.type === "send-message");
  if (wantsSend) {
    if (!options.allowAutoSend) issues.push("未开启自动发送授权");
    if (!options.autoSendWhitelist?.includes(options.expectedContactName)) issues.push("目标联系人不在自动发送白名单");
    if (isHighRiskDraft(options.draftText)) issues.push("草稿内容涉及金额、合同、承诺或其他高风险语义，禁止自动发送");
  }
  return { ok: issues.length === 0, issues };
}

export function isHighRiskDraft(text: string): boolean {
  return HIGH_RISK_DRAFT_PATTERNS.some((pattern) => pattern.test(text));
}

export function appleScriptActivateWeChat(): string {
  return [
    'tell application "WeChat"',
    "  activate",
    "end tell"
  ].join("\n");
}
