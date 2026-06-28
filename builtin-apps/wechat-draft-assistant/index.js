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
  process.stdout.write(JSON.stringify({
    ok: true,
    reply: [
      "微信草稿助手 PoC 动作计划",
      "",
      `目标联系人：${contact}`,
      `草稿内容：${reply}`,
      "",
      "计划：",
      "1. 激活微信窗口。",
      "2. 使用微信搜索打开目标联系人。",
      "3. 截图并确认当前会话标题与目标联系人一致。",
      "4. 将草稿粘贴到输入框。",
      "5. 停止，等待用户手动确认发送。",
      "",
      "当前模板不会点击发送，也不会读取微信数据库、协议或进程内存。"
    ].join("\n")
  }));
});
