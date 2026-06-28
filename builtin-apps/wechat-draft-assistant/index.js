import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_UNREAD_CONVERSATIONS = 5;

const ACCESSIBILITY_SCRIPT = `
on joinLines(rowItems)
  set AppleScript's text item delimiters to linefeed
  set joined to rowItems as text
  set AppleScript's text item delimiters to ""
  return joined
end joinLines

on appendIfPresent(rowItems, label, valueText)
  if valueText is not "" and valueText is not "missing value" then set end of rowItems to label & ": " & valueText
  return rowItems
end appendIfPresent

on describeElement(theElement)
  set outputRows to {}
  tell application "System Events"
    set roleText to ""
    set nameText to ""
    set valueText to ""
    set descriptionText to ""
    try
      set roleText to role of theElement as text
    end try
    try
      set nameText to name of theElement as text
    end try
    try
      set valueText to value of theElement as text
    end try
    try
      set descriptionText to description of theElement as text
    end try
    set parts to {}
    set parts to my appendIfPresent(parts, "role", roleText)
    set parts to my appendIfPresent(parts, "name", nameText)
    set parts to my appendIfPresent(parts, "value", valueText)
    set parts to my appendIfPresent(parts, "description", descriptionText)
    if (count of parts) > 0 then set end of outputRows to my joinLines(parts)
  end tell
  return outputRows
end describeElement

tell application "WeChat" to activate
delay 0.4
tell application "System Events"
  if not (exists process "WeChat") then error "WeChat process is not visible to System Events"
  tell process "WeChat"
    set frontmost to true
    if (count of windows) = 0 then error "WeChat has no visible window"
    set outputRows to my describeElement(window 1)
    set elementList to entire contents of window 1
    repeat with uiElement in elementList
      set elementRows to my describeElement(uiElement)
      repeat with elementRow in elementRows
        set end of outputRows to elementRow as text
      end repeat
      if (count of outputRows) > 500 then exit repeat
    end repeat
  end tell
end tell
return my joinLines(outputRows)
`;

const WECHAT_BOUNDS_SCRIPT = `
tell application "System Events"
  if not (exists process "WeChat") then error "WeChat process is not visible to System Events"
  tell process "WeChat"
    set frontmost to true
    if (count of windows) = 0 then error "WeChat has no visible window"
    tell window 1
      set p to position
      set s to size
      return ((item 1 of p) as text) & "," & ((item 2 of p) as text) & "," & ((item 1 of s) as text) & "," & ((item 2 of s) as text)
    end tell
  end tell
end tell
`;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const payload = input.trim() ? JSON.parse(input) : {};
  const parsed = parseInput(String(payload.input || ""));
  const workspace = String(payload.context?.workspace || "");
  const visionResult = String(payload.context?.visionResult || "");
  const visionStage = String(payload.context?.visionStage || "");
  const visionState = payload.context?.visionState;
  const dryRun = process.env.QFT_WECHAT_DRAFT_DRY_RUN === "1";
  if (visionResult && visionStage === "open-first-unread") {
    process.stdout.write(JSON.stringify(handleUnreadVisionResult(visionResult, parsed, workspace, dryRun)));
    return;
  }
  if (visionResult && visionStage === "read-opened-conversation") {
    process.stdout.write(JSON.stringify(handleOpenedConversationVisionResult(visionResult, visionState, parsed, workspace, dryRun)));
    return;
  }
  const scan = dryRun
    ? {
      status: 0,
      stdout: [
        "role: static text\nname: 张三\nvalue: 2条未读消息",
        "role: static text\nname: 张三\nvalue: 明天上午可以吗？",
        "role: static text\nname: 文件传输助手\nvalue: [草稿] 测试内容"
      ].join("\n"),
      stderr: ""
    }
    : spawnSync("/usr/bin/osascript", ["-e", ACCESSIBILITY_SCRIPT], { encoding: "utf8" });
  let unreadCandidates = extractUnreadCandidates(scan.stdout || "");
  let ocrStatus = "跳过";
  let visionRequest;
  let visionContinuation;
  if (!dryRun) {
    const ocr = runScreenOcr(workspace, "wechat-list.png");
    ocrStatus = ocr.ok ? "成功" : `失败：${ocr.error}`;
    if (ocr.text) {
      unreadCandidates = extractUnreadCandidates(ocr.text);
    }
    if (ocr.imagePath) {
      visionRequest = {
        imagePath: path.relative(workspace, ocr.imagePath),
        prompt: [
          "这是一张用户本人当前 macOS 微信窗口截图。请只根据截图可见内容抽取未读或疑似未读会话。",
          "重点检查左侧聊天列表和最左侧导航栏上的红点、红色数字徽标、未读数字，即使没有 OCR 文字也要识别。",
          "请把红点或红色数字徽标与最近的会话行合并判断；点击目标应选择会话行中部，不要点红点本身。",
          "不要推测不可见内容，不要编造联系人，不要输出发送建议或自动操作步骤。",
          "只输出严格 JSON，不要使用 Markdown 代码块。格式：",
          "{\"unreadFound\":true,\"items\":[{\"conversationName\":\"会话名\",\"badgeText\":\"红点或数字\",\"preview\":\"可见预览\",\"clickTarget\":{\"x\":260,\"y\":180},\"confidence\":0.92,\"evidence\":\"依据\"}]}",
          "clickTarget 坐标必须是截图左上角为原点的像素坐标，指向对应会话行的安全点击位置。",
          "如果没有看到可见未读，输出 {\"unreadFound\":false,\"items\":[]}。"
        ].join("\n")
      };
      visionContinuation = {
        input: payload.input || "",
        stage: "open-first-unread"
      };
    }
  }
  const shouldWriteDraft = parsed.draft.length > 0;
  const clipboard = dryRun || !shouldWriteDraft
    ? { status: 0, stderr: "" }
    : spawnSync("/usr/bin/pbcopy", [], {
      input: parsed.draft,
      encoding: "utf8"
    });
  const scanOk = scan.status === 0;
  const clipboardOk = clipboard.status === 0;
  const replyLines = [
    "微信未读草稿助手 PoC",
    "",
    `读取可见未读：${scanOk ? "成功" : `失败：${scan.stderr || scan.error || "未知错误"}`}`,
    `本地截图 OCR：${ocrStatus}`,
    `本地候选数量：${unreadCandidates.length}`,
    ...formatCandidates(unreadCandidates),
    visionRequest ? "视觉模型：将继续识别红点/未读数字并尝试打开第一个可见未读会话。" : "",
    "",
    shouldWriteDraft
      ? `剪贴板写入：${clipboardOk ? "成功" : `失败：${clipboard.stderr || clipboard.error || "未知错误"}`}`
      : "剪贴板写入：跳过（未提供草稿）",
    parsed.contact ? `目标联系人提示：${parsed.contact}` : "目标联系人提示：未提供",
    "",
    "请手动完成：",
    "1. 在微信中确认候选未读是否对应目标会话。",
    "2. 如提供了草稿，打开目标会话并在输入框按 Command+V 粘贴。",
    "3. 检查内容无误后手动发送。",
    "",
    "当前模板只读取微信当前窗口可见的辅助功能文本；不会读取微信数据库、协议或进程内存，也不会自动搜索、粘贴或发送。"
  ];
  process.stdout.write(JSON.stringify({
    ok: clipboardOk,
    reply: replyLines.join("\n"),
    visionRequest,
    visionContinuation,
    error: clipboardOk ? undefined : "剪贴板写入失败"
  }));
});

function parseInput(rawInput) {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let contact = "";
  let draft = "";
  for (const line of lines) {
    if (/^联系人[:：]/.test(line)) {
      contact = line.replace(/^联系人[:：]\s*/, "").trim();
    } else if (/^草稿[:：]/.test(line)) {
      draft = line.replace(/^草稿[:：]\s*/, "").trim();
    } else if (!contact) {
      contact = line;
    } else if (!draft) {
      draft = line;
    } else {
      draft = `${draft}\n${line}`;
    }
  }
  return { contact, draft, rawInput };
}

function handleUnreadVisionResult(visionResult, parsed, workspace, dryRun) {
  const detected = parseVisionUnreadResult(visionResult);
  if (!detected.unreadFound || detected.items.length === 0) {
    return {
      ok: true,
      reply: [
        "微信未读草稿助手 PoC",
        "",
        "连续读取：未打开会话",
        "视觉模型未确认可见未读会话。",
        "",
        "视觉模型结果：",
        visionResult,
        "",
        "当前模板不会读取微信数据库、协议或进程内存，也不会自动搜索、粘贴或发送。"
      ].join("\n")
    };
  }
  const items = detected.items.slice(0, MAX_UNREAD_CONVERSATIONS);
  const item = items[0];
  const bounds = dryRun ? "0,0,800,600" : wechatWindowBounds();
  const click = clickUnreadConversation(bounds, item.clickTarget, dryRun, workspace);
  if (!click.ok) {
    return {
      ok: true,
      reply: [
        "微信未读草稿助手 PoC",
        "",
        "连续读取：未打开会话",
        `识别到未读：${formatUnreadItem(item)}`,
        `点击失败：${click.error}`,
        "",
        "视觉模型结果：",
        visionResult
      ].join("\n")
    };
  }
  const scan = dryRun
    ? {
      status: 0,
      stdout: "role: static text\nname: Vei_G\nvalue: 你几点起床的？小肚肚",
      stderr: ""
    }
    : spawnSync("/usr/bin/osascript", ["-e", ACCESSIBILITY_SCRIPT], { encoding: "utf8" });
  const ocr = dryRun
    ? { ok: true, error: "", text: "Vei_G\n你几点起床的？小肚肚", imagePath: workspace ? path.join(workspace, "wechat-conversation.png") : "" }
    : runScreenOcr(workspace, "wechat-conversation.png");
  const localMessages = extractConversationText(scan.stdout || ocr.text || "");
  const replyLines = [
    "微信未读草稿助手 PoC",
    "",
    `连续读取：已点击第 1/${items.length} 个可见未读会话`,
    "注意：点击会话可能会让微信把该会话标记为已读。",
    `识别到未读：${formatUnreadItem(item)}`,
    `点击位置：截图像素 (${Math.round(item.clickTarget.x)}, ${Math.round(item.clickTarget.y)})${click.windowPoint ? ` / 窗口点 (${click.windowPoint.x}, ${click.windowPoint.y})` : ""}${click.strategy ? ` / 策略 ${click.strategy}` : ""}`,
    `打开后辅助功能读取：${scan.status === 0 ? "成功" : `失败：${scan.stderr || scan.error || "未知错误"}`}`,
    `打开后截图 OCR：${ocr.ok ? "成功" : `失败：${ocr.error}`}`,
    "",
    ...formatConversationText(localMessages),
    "",
    parsed.draft ? "剪贴板写入：已在第一阶段完成；仍需手动粘贴和发送。" : "剪贴板写入：跳过（未提供草稿）",
    parsed.contact ? `目标联系人提示：${parsed.contact}` : "目标联系人提示：未提供",
    "",
    "当前模板只读取当前微信窗口可见内容；不会读取微信数据库、协议或进程内存，也不会自动搜索、粘贴或发送。"
  ];
  const visionRequest = ocr.imagePath
    ? {
      imagePath: path.relative(workspace, ocr.imagePath),
      prompt: conversationVisionPrompt(item, 0, items.length)
    }
    : undefined;
  return {
    ok: true,
    reply: replyLines.filter(Boolean).join("\n"),
    visionRequest,
    visionContinuation: visionRequest
      ? {
        input: parsed.rawInput || "",
        stage: "read-opened-conversation",
        state: {
          items,
          index: 0,
          results: [],
          clicks: [click.windowPoint ? {
            conversationName: item.conversationName,
            screenshotX: Math.round(item.clickTarget.x),
            screenshotY: Math.round(item.clickTarget.y),
            windowX: click.windowPoint.x,
            windowY: click.windowPoint.y
          } : undefined].filter(Boolean)
        }
      }
      : undefined
  };
}

function handleOpenedConversationVisionResult(visionResult, state, parsed, workspace, dryRun) {
  const currentState = normalizeVisionState(state);
  if (!currentState.items.length) {
    return {
      ok: true,
      reply: [
        "微信未读草稿助手 PoC",
        "",
        "连续读取：未找到可继续处理的未读队列。",
        "",
        "当前模板不会读取微信数据库、协议或进程内存，也不会自动搜索、粘贴或发送。"
      ].join("\n")
    };
  }
  const item = currentState.items[currentState.index] || currentState.items[0];
  const results = [
    ...currentState.results,
    {
      conversationName: item.conversationName || `会话 ${currentState.index + 1}`,
      badgeText: item.badgeText || "",
      preview: item.preview || "",
      confidence: item.confidence || 0,
      content: visionResult
    }
  ];
  const nextIndex = currentState.index + 1;
  if (nextIndex < currentState.items.length && nextIndex < MAX_UNREAD_CONVERSATIONS) {
    const nextItem = currentState.items[nextIndex];
    const bounds = dryRun ? "0,0,800,600" : wechatWindowBounds();
    const click = clickUnreadConversation(bounds, nextItem.clickTarget, dryRun, workspace);
    if (!click.ok) {
      return finalUnreadQueueReply(results, currentState.items, parsed, `第 ${nextIndex + 1} 个会话点击失败：${click.error}`);
    }
    const ocr = dryRun
      ? { ok: true, error: "", text: "", imagePath: workspace ? path.join(workspace, `wechat-conversation-${nextIndex + 1}.png`) : "" }
      : runScreenOcr(workspace, `wechat-conversation-${nextIndex + 1}.png`);
    if (!ocr.imagePath) {
      return finalUnreadQueueReply(results, currentState.items, parsed, `第 ${nextIndex + 1} 个会话截图失败：${ocr.error || "未生成截图"}`);
    }
    return {
      ok: true,
      reply: [
        "微信未读草稿助手 PoC",
        "",
        `连续读取：已读取 ${results.length}/${currentState.items.length} 个会话，正在打开第 ${nextIndex + 1} 个。`,
        `下一个未读：${formatUnreadItem(nextItem)}`,
        `点击位置：截图像素 (${Math.round(nextItem.clickTarget.x)}, ${Math.round(nextItem.clickTarget.y)})${click.windowPoint ? ` / 窗口点 (${click.windowPoint.x}, ${click.windowPoint.y})` : ""}${click.strategy ? ` / 策略 ${click.strategy}` : ""}`
      ].join("\n"),
      visionRequest: {
        imagePath: path.relative(workspace, ocr.imagePath),
        prompt: conversationVisionPrompt(nextItem, nextIndex, currentState.items.length)
      },
      visionContinuation: {
        input: parsed.rawInput || "",
        stage: "read-opened-conversation",
        state: {
          items: currentState.items,
          index: nextIndex,
          results,
          clicks: [
            ...currentState.clicks,
            click.windowPoint ? {
              conversationName: nextItem.conversationName,
              screenshotX: Math.round(nextItem.clickTarget.x),
              screenshotY: Math.round(nextItem.clickTarget.y),
              windowX: click.windowPoint.x,
              windowY: click.windowPoint.y
            } : undefined
          ].filter(Boolean)
        }
      }
    };
  }
  return finalUnreadQueueReply(results, currentState.items, parsed);
}

function normalizeVisionState(state) {
  const value = state && typeof state === "object" ? state : {};
  const items = Array.isArray(value.items) ? value.items.map((item) => ({
    conversationName: String(item.conversationName || "").trim(),
    badgeText: String(item.badgeText || "").trim(),
    preview: String(item.preview || "").trim(),
    evidence: String(item.evidence || "").trim(),
    confidence: Number(item.confidence || 0),
    clickTarget: normalizeClickTarget(item.clickTarget)
  })).filter((item) => item.clickTarget) : [];
  const results = Array.isArray(value.results) ? value.results.map((item) => ({
    conversationName: String(item.conversationName || "").trim(),
    badgeText: String(item.badgeText || "").trim(),
    preview: String(item.preview || "").trim(),
    confidence: Number(item.confidence || 0),
    content: String(item.content || "").trim()
  })).filter((item) => item.conversationName || item.content) : [];
  const clicks = Array.isArray(value.clicks) ? value.clicks : [];
  const index = Math.max(0, Math.min(items.length - 1, Math.floor(Number(value.index || 0))));
  return { items, results, clicks, index };
}

function conversationVisionPrompt(item, index, total) {
  return [
    `这是一张用户本人当前 macOS 微信会话窗口截图，已经由用户授权的桌面自动化流程打开。当前正在读取第 ${index + 1}/${total} 个可见未读候选。`,
    `列表候选：${formatUnreadItem(item)}`,
    "请只读取截图中当前打开会话可见的消息内容，不要推测不可见历史。",
    "如果同一会话中有多条可见未读或近期消息，请逐条列出。",
    "请输出：会话标题、可见消息列表、每条消息的发送方可见线索、时间可见线索、正文、置信度。",
    "如果右侧会话区域没有可见消息，请明确说明。",
    "禁止输出发送建议或自动操作步骤。"
  ].join("\n");
}

function finalUnreadQueueReply(results, items, parsed, warning = "") {
  const lines = [
    "微信未读草稿助手 PoC",
    "",
    `连续读取：已读取 ${results.length}/${items.length} 个可见未读会话`,
    "注意：点击会话可能会让微信把对应会话标记为已读。",
    warning ? `中断原因：${warning}` : "",
    "",
    "未读候选：",
    ...items.map((item, index) => `${index + 1}. ${formatUnreadItem(item)}`),
    "",
    "打开后可见消息：",
    ...results.flatMap((result, index) => [
      `${index + 1}. ${result.conversationName || "未知会话"}${result.preview ? ` / 列表预览：${result.preview}` : ""}`,
      indentBlock(result.content || "视觉模型未返回可见消息。")
    ]),
    "",
    parsed.draft ? "剪贴板写入：已在第一阶段完成；仍需手动粘贴和发送。" : "剪贴板写入：跳过（未提供草稿）",
    parsed.contact ? `目标联系人提示：${parsed.contact}` : "目标联系人提示：未提供",
    "",
    "当前模板只读取当前微信窗口可见内容；不会读取微信数据库、协议或进程内存，也不会自动搜索、粘贴或发送。"
  ];
  return { ok: true, reply: lines.filter(Boolean).join("\n") };
}

function indentBlock(text) {
  return String(text || "").split(/\r?\n/).map((line) => `   ${line}`).join("\n");
}

function parseVisionUnreadResult(visionResult) {
  const fallback = { unreadFound: false, items: [] };
  const jsonText = extractJsonObject(visionResult);
  if (!jsonText) return fallback;
  try {
    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed.items) ? parsed.items
      .map((item) => ({
        conversationName: String(item.conversationName || "").trim(),
        badgeText: String(item.badgeText || "").trim(),
        preview: String(item.preview || "").trim(),
        evidence: String(item.evidence || "").trim(),
        confidence: Number(item.confidence || 0),
        clickTarget: normalizeClickTarget(item.clickTarget)
      }))
      .filter((item) => item.clickTarget && Number.isFinite(item.clickTarget.x) && Number.isFinite(item.clickTarget.y))
      : [];
    return { unreadFound: Boolean(parsed.unreadFound) && items.length > 0, items };
  } catch {
    return fallback;
  }
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return text.slice(start, end + 1);
}

function normalizeClickTarget(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function clickUnreadConversation(boundsText, clickTarget, dryRun, workspace = "") {
  const bounds = String(boundsText || "").split(",").map((part) => Number(part));
  if (bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value))) {
    return { ok: false, error: "无法获取微信窗口边界" };
  }
  const [left, top, width, height] = bounds;
  const point = screenshotPixelToWindowPoint(clickTarget, workspace, width, height);
  const x = Math.round(Math.max(0, Math.min(width - 1, point.x)));
  const y = Math.round(Math.max(0, Math.min(height - 1, point.y)));
  const absoluteX = left + x;
  const absoluteY = top + y;
  if (dryRun) return { ok: true, x: absoluteX, y: absoluteY, windowPoint: { x, y } };
  if (process.env.QFT_WECHAT_CLICK_FORCE_FAIL === "1") {
    return {
      ok: false,
      error: "wechat-process: simulated failure；system-events: simulated failure；jxa-cgevent: simulated failure"
    };
  }
  const attempts = [
    runJxaClick(absoluteX, absoluteY),
    runAppleScriptClick("wechat-process", [
      `tell application "WeChat" to activate`,
      "delay 0.2",
      `tell application "System Events"`,
      `  tell process "WeChat"`,
      `    set frontmost to true`,
      `    click at {${absoluteX}, ${absoluteY}}`,
      `  end tell`,
      `end tell`,
      "delay 0.6"
    ].join("\n")),
    runAppleScriptClick("system-events", [
      `tell application "WeChat" to activate`,
      "delay 0.2",
      `tell application "System Events"`,
      `  click at {${absoluteX}, ${absoluteY}}`,
      `end tell`,
      "delay 0.6"
    ].join("\n"))
  ];
  const success = attempts.find((attempt) => attempt.ok);
  if (success) return { ok: true, x: absoluteX, y: absoluteY, windowPoint: { x, y }, strategy: success.strategy };
  return {
    ok: false,
    error: attempts.map((attempt) => `${attempt.strategy}: ${attempt.error || "未知错误"}`).join("；")
  };
}

function screenshotPixelToWindowPoint(clickTarget, workspace, width, height) {
  const imagePath = workspace ? path.join(workspace, "wechat-list.png") : "";
  const dimensions = imagePath ? pngDimensions(imagePath) : null;
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return clickTarget;
  const scaleX = dimensions.width / width;
  const scaleY = dimensions.height / height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return clickTarget;
  return {
    x: clickTarget.x / scaleX,
    y: clickTarget.y / scaleY
  };
}

function pngDimensions(imagePath) {
  try {
    const header = readFileSync(imagePath).subarray(0, 24);
    if (header.length < 24) return null;
    if (header[0] !== 0x89 || header[1] !== 0x50 || header[2] !== 0x4e || header[3] !== 0x47) return null;
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    };
  } catch {
    return null;
  }
}

function runAppleScriptClick(strategy, script) {
  const result = spawnSync("/usr/bin/osascript", ["-e", script], { encoding: "utf8" });
  if (result.status === 0) return { ok: true, strategy };
  return {
    ok: false,
    strategy,
    error: String(result.stderr || result.error || result.stdout || "点击失败").trim()
  };
}

function runJxaClick(x, y) {
  const script = [
    "ObjC.import('ApplicationServices');",
    "ObjC.import('CoreGraphics');",
    `const point = $.CGPointMake(${x}, ${y});`,
    "const down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);",
    "const up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);",
    "$.CGEventPost($.kCGHIDEventTap, down);",
    "delay(0.05);",
    "$.CGEventPost($.kCGHIDEventTap, up);",
    "delay(0.6);"
  ].join("\n");
  const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], { encoding: "utf8" });
  if (result.status === 0) return { ok: true, strategy: "jxa-cgevent" };
  return {
    ok: false,
    strategy: "jxa-cgevent",
    error: String(result.stderr || result.error || result.stdout || "点击失败").trim()
  };
}

function formatUnreadItem(item) {
  return [
    item.conversationName || "未知会话",
    item.badgeText ? `未读标记 ${item.badgeText}` : "",
    item.preview ? `预览：${item.preview}` : "",
    item.confidence ? `置信度 ${item.confidence}` : "",
    item.evidence ? `依据：${item.evidence}` : ""
  ].filter(Boolean).join(" / ");
}

function extractUnreadCandidates(snapshotText) {
  const lines = snapshotText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Set();
  const candidates = [];
  for (const line of lines) {
    const score = /未读|新消息|条消息|条未读|红点|unread|new message|\[\d+条\]/i.test(line)
      ? 0.95
      : (/role:|name:|value:|description:/i.test(line) || /微信|文件传输助手|聊天|联系人|搜索/.test(line)) && line.length >= 4
        ? 0.45
        : 0;
    if (score <= 0) continue;
    const text = line.slice(0, 300);
    if (seen.has(text)) continue;
    seen.add(text);
    candidates.push({
      text,
      score,
      reason: score >= 0.9 ? "包含未读或新消息标记" : "微信可见文本候选"
    });
  }
  return candidates.sort((left, right) => right.score - left.score).slice(0, 20);
}

function extractConversationText(snapshotText) {
  return snapshotText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && !/AXWindow|AXButton|关闭按钮|全屏幕按钮|最小化按钮|标准窗口|AXGroup|组/.test(line))
    .slice(0, 30);
}

function runScreenOcr(workspace, fileName = "screen.png") {
  const helper = resolveOcrHelper();
  if (!helper) return { ok: false, error: "未找到内置 Vision OCR helper", text: "" };
  const dir = workspace || mkdtempSync(path.join(tmpdir(), "qft-wechat-ocr-"));
  const imagePath = path.join(dir, fileName);
  const bounds = wechatWindowBounds();
  const captureArgs = bounds ? ["-x", "-R", bounds, imagePath] : ["-x", imagePath];
  const capture = spawnSync("/usr/sbin/screencapture", captureArgs, { encoding: "utf8" });
  if (capture.status !== 0) return { ok: false, error: capture.stderr || "截屏失败", text: "" };
  const ocr = spawnSync(helper, [imagePath], { encoding: "utf8" });
  if (ocr.status !== 0) return { ok: false, error: ocr.stderr || "OCR 失败", text: ocr.stdout || "", imagePath };
  return { ok: true, error: "", text: ocr.stdout || "", imagePath };
}

function wechatWindowBounds() {
  const result = spawnSync("/usr/bin/osascript", ["-e", WECHAT_BOUNDS_SCRIPT], { encoding: "utf8" });
  if (result.status !== 0) return "";
  const bounds = result.stdout.trim();
  return /^\d+,\d+,\d+,\d+$/.test(bounds) ? bounds : "";
}

function resolveOcrHelper() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "runtime", "vision-ocr", arch, "qft-vision-ocr") : "",
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "vision-ocr", arch, "qft-vision-ocr")
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function formatCandidates(candidates) {
  if (candidates.length === 0) return ["候选明细：未发现可见未读标记或可读文本。"];
  return [
    "候选明细：",
    ...candidates.map((candidate, index) => `${index + 1}. [${candidate.reason}] ${candidate.text}`)
  ];
}

function formatConversationText(lines) {
  if (lines.length === 0) return ["打开后本地可读文本：未发现可读文本，等待多模态模型读取截图。"];
  return [
    "打开后本地可读文本：",
    ...lines.map((line, index) => `${index + 1}. ${line}`)
  ];
}
