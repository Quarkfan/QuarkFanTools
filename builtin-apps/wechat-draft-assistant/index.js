import { spawnSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const payload = input.trim() ? JSON.parse(input) : {};
  const raw = String(payload.input || "").trim();
  const [contactPart, ...replyParts] = raw.split(/\n+/);
  const contact = contactPart?.replace(/^联系人[:：]\s*/, "").trim() || "请在命令参数第一行填写联系人";
  const reply = replyParts.join("\n").replace(/^草稿[:：]\s*/, "").trim() || "请在命令参数第二行填写要写入微信输入框的草稿";
  const dryRun = process.env.QFT_WECHAT_DRAFT_DRY_RUN === "1";
  const clipboard = dryRun
    ? { status: 0, stderr: "" }
    : spawnSync("/usr/bin/pbcopy", [], {
      input: reply,
      encoding: "utf8"
    });
  const activate = dryRun
    ? { status: 0, stderr: "" }
    : spawnSync("/usr/bin/osascript", ["-e", 'tell application "WeChat" to activate'], {
      encoding: "utf8"
    });
  const clipboardOk = clipboard.status === 0;
  const activateOk = activate.status === 0;
  process.stdout.write(JSON.stringify({
    ok: clipboardOk,
    reply: [
      "微信草稿助手 PoC 动作计划",
      "",
      `目标联系人：${contact}`,
      `草稿内容：${reply}`,
      `剪贴板写入：${clipboardOk ? "成功" : `失败：${clipboard.stderr || clipboard.error || "未知错误"}`}`,
      `微信激活：${activateOk ? "成功" : `失败：${activate.stderr || activate.error || "可能未安装或应用名不是 WeChat"}`}`,
      "",
      "请手动完成：",
      "1. 在微信中搜索并打开目标联系人。",
      "2. 确认当前会话标题与目标联系人一致。",
      "3. 在输入框按 Command+V 粘贴草稿。",
      "4. 检查内容无误后手动发送。",
      "",
      "当前模板不会点击发送，也不会读取微信数据库、协议或进程内存。"
    ].join("\n"),
    error: clipboardOk ? undefined : "剪贴板写入失败"
  }));
});
