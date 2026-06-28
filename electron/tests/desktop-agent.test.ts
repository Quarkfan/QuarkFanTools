import assert from "node:assert/strict";
import test from "node:test";
import {
  appleScriptActivateWeChat,
  buildWeChatDraftPlan,
  buildWeChatUnreadScanPlan,
  extractWeChatUnreadCandidates,
  isHighRiskDraft,
  validateDesktopAgentActions
} from "../desktop-agent.js";

test("builds a safe WeChat draft-only desktop action plan", () => {
  const plan = buildWeChatDraftPlan({ contactName: "张三", draftText: "我晚点看一下" });
  assert.deepEqual(plan.map((action) => action.type), [
    "activate-app",
    "search-contact",
    "capture-window",
    "verify-conversation",
    "paste-draft",
    "capture-window",
    "stop-for-user-confirmation"
  ]);
  assert.equal(plan.some((action) => action.type === "send-message"), false);
});

test("builds a visible unread-first WeChat scan plan", () => {
  const plan = buildWeChatUnreadScanPlan({ contactHint: "张三", includeDraft: true });
  assert.deepEqual(plan.map((action) => action.type), [
    "activate-app",
    "scan-unread",
    "capture-window",
    "stop-for-user-confirmation"
  ]);
  assert.equal(plan.some((action) => action.type === "send-message"), false);
});

test("extracts unread candidates from accessibility text", () => {
  const candidates = extractWeChatUnreadCandidates([
    "role: static text name: 张三 value: 2条未读消息",
    "role: static text name: 李四 value: 明天上午可以吗？"
  ].join("\n"));
  assert.equal(candidates[0].reason, "包含未读或新消息标记");
  assert.match(candidates[0].text, /2条未读消息/);
  assert.ok(candidates.length >= 2);
});

test("validates conversation identity before allowing desktop actions", () => {
  const plan = buildWeChatDraftPlan({ contactName: "张三", draftText: "收到" });
  const result = validateDesktopAgentActions(plan, {
    app: "wechat",
    activeConversationTitle: "张三丰",
    conversationConfidence: 0.95
  }, {
    expectedContactName: "张三",
    draftText: "收到"
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /会话标题/);
});

test("blocks automatic sending unless whitelist and low risk checks pass", () => {
  const plan = [
    ...buildWeChatDraftPlan({ contactName: "张三", draftText: "报价 3 万，我保证周五交付" }),
    { type: "send-message" as const, app: "wechat" as const }
  ];
  const result = validateDesktopAgentActions(plan, {
    app: "wechat",
    activeConversationTitle: "张三",
    conversationConfidence: 0.98
  }, {
    expectedContactName: "张三",
    draftText: "报价 3 万，我保证周五交付",
    allowAutoSend: true,
    autoSendWhitelist: ["张三"]
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /高风险/);
  assert.equal(isHighRiskDraft("好的，我晚点看一下"), false);
});

test("exposes a minimal AppleScript activation command for macOS PoC", () => {
  assert.match(appleScriptActivateWeChat(), /tell application "WeChat"/);
  assert.match(appleScriptActivateWeChat(), /activate/);
});
