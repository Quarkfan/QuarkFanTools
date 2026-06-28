import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const dryRun = process.env.QFT_WECHAT_DRAFT_DRY_RUN === "1";
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
  if (!dryRun && shouldUseOcrFallback(unreadCandidates)) {
    const ocr = runScreenOcr(workspace);
    ocrStatus = ocr.ok ? "成功" : `失败：${ocr.error}`;
    if (ocr.text) {
      unreadCandidates = extractUnreadCandidates(ocr.text);
    }
    if (ocr.imagePath) {
      visionRequest = {
        imagePath: path.relative(workspace, ocr.imagePath),
        prompt: [
          "这是一张用户本人当前 macOS 微信窗口截图。请只根据截图可见内容抽取未读或疑似未读会话。",
          "不要推测不可见内容，不要编造联系人。",
          "请用中文输出简短列表，优先包含：联系人/会话名、是否有红点或未读数、可见预览文本、置信度。",
          "如果没有看到未读标记，请明确说未看到可见未读。",
          "禁止输出任何发送建议或自动操作步骤。"
        ].join("\n")
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
    `截图 OCR：${ocrStatus}`,
    `候选数量：${unreadCandidates.length}`,
    ...formatCandidates(unreadCandidates),
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
  return { contact, draft };
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

function shouldUseOcrFallback(candidates) {
  if (candidates.some((candidate) => candidate.score >= 0.9)) return false;
  const useful = candidates.filter((candidate) => !/AXWindow|AXButton|关闭按钮|全屏幕按钮|最小化按钮|标准窗口|AXGroup|组/.test(candidate.text));
  return useful.length < 3;
}

function runScreenOcr(workspace) {
  const helper = resolveOcrHelper();
  if (!helper) return { ok: false, error: "未找到内置 Vision OCR helper", text: "" };
  const dir = workspace || mkdtempSync(path.join(tmpdir(), "qft-wechat-ocr-"));
  const imagePath = path.join(dir, "screen.png");
  const bounds = wechatWindowBounds();
  const captureArgs = bounds ? ["-x", "-R", bounds, imagePath] : ["-x", imagePath];
  const capture = spawnSync("/usr/sbin/screencapture", captureArgs, { encoding: "utf8" });
  if (capture.status !== 0) return { ok: false, error: capture.stderr || "截屏失败", text: "" };
  const ocr = spawnSync(helper, [imagePath], { encoding: "utf8" });
  if (ocr.status !== 0) return { ok: false, error: ocr.stderr || "OCR 失败", text: ocr.stdout || "" };
  return { ok: true, error: "", text: ocr.stdout || "" };
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
