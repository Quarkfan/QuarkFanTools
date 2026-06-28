import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("wechat assistant template reads visible unread candidates before optional draft in dry-run mode", () => {
  const script = path.resolve("builtin-apps/wechat-draft-assistant/index.js");
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      input: "联系人：张三\n草稿：我晚点看一下"
    }),
    encoding: "utf8",
    env: {
      ...process.env,
      QFT_WECHAT_DRAFT_DRY_RUN: "1"
    }
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { ok: boolean; reply: string };
  assert.equal(output.ok, true);
  assert.match(output.reply, /读取可见未读：成功/);
  assert.match(output.reply, /2条未读消息/);
  assert.match(output.reply, /明天上午可以吗/);
  assert.match(output.reply, /目标联系人提示：张三/);
  assert.match(output.reply, /剪贴板写入：成功/);
  assert.match(output.reply, /手动发送/);
});
