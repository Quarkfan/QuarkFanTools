const input = process.argv.slice(2).join(" ").trim() || "未提供输入";

process.stdout.write(JSON.stringify({
  ok: true,
  reply: [
    "日报生成器模板输出",
    "",
    "1. 今日进展",
    `- ${input}`,
    "",
    "2. 风险与阻塞",
    "- 请在这里补充风险、负责人和预计解决时间。",
    "",
    "3. 明日计划",
    "- 请在这里补充下一步动作。"
  ].join("\n")
}));
