import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

test("wechat assistant template continues from vision result to open unread conversation", () => {
  const script = path.resolve("builtin-apps/wechat-draft-assistant/index.js");
  const workspace = mkdtempSync(path.join(tmpdir(), "qft-wechat-test-"));
  writeFileSync(path.join(workspace, "wechat-list.png"), pngHeader(1600, 1200));
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      input: "",
      context: {
        workspace,
        visionStage: "open-first-unread",
        visionResult: JSON.stringify({
          unreadFound: true,
          items: [
            {
              conversationName: "Vei_G",
              badgeText: "1",
              preview: "你几点起床的？小肚肚",
              clickTarget: { x: 260, y: 180 },
              confidence: 0.96,
              evidence: "左侧会话头像右上角有红色数字 1"
            }
          ]
        })
      }
    }),
    encoding: "utf8",
    env: {
      ...process.env,
      QFT_WECHAT_DRAFT_DRY_RUN: "1"
    }
  });
  rmSync(workspace, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { ok: boolean; reply: string; visionContinuation?: { stage?: string; state?: { items?: unknown[] } }; visionRequest?: { imagePath?: string } };
  assert.equal(output.ok, true);
  assert.match(output.reply, /连续读取：已点击第 1\/1 个可见未读会话/);
  assert.match(output.reply, /识别到未读：Vei_G/);
  assert.match(output.reply, /你几点起床的？小肚肚/);
  assert.match(output.reply, /截图像素 \(260, 180\) \/ 窗口点 \(130, 90\)/);
  assert.match(output.reply, /注意：点击会话可能会让微信把该会话标记为已读/);
  assert.equal(output.visionContinuation?.stage, "read-opened-conversation");
  assert.equal(output.visionContinuation?.state?.items?.length, 1);
  assert.ok(output.visionRequest?.imagePath);
});

test("wechat assistant template aggregates multiple visible unread conversations", () => {
  const script = path.resolve("builtin-apps/wechat-draft-assistant/index.js");
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      input: "",
      context: {
        workspace: "/tmp",
        visionStage: "read-opened-conversation",
        visionResult: "会话标题：Vei_G\n消息：你几点起床的？",
        visionState: {
          index: 0,
          items: [
            {
              conversationName: "Vei_G",
              badgeText: "1",
              preview: "你几点起床的？",
              clickTarget: { x: 260, y: 180 },
              confidence: 0.96
            }
          ],
          results: []
        }
      }
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
  assert.match(output.reply, /连续读取：已读取 1\/1 个可见未读会话/);
  assert.match(output.reply, /Vei_G/);
  assert.match(output.reply, /你几点起床的/);
});

test("wechat assistant template reports failed click strategies", () => {
  const script = path.resolve("builtin-apps/wechat-draft-assistant/index.js");
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      input: "",
      context: {
        workspace: "/tmp",
        visionStage: "open-first-unread",
        visionResult: JSON.stringify({
          unreadFound: true,
          items: [
            {
              conversationName: "Vei_G",
              badgeText: "1",
              preview: "你几点起床的？小肚肚",
              clickTarget: { x: 260, y: 180 },
              confidence: 0.96,
              evidence: "左侧会话头像右上角有红色数字 1"
            }
          ]
        })
      }
    }),
    encoding: "utf8",
    env: {
      ...process.env,
      QFT_WECHAT_DRAFT_DRY_RUN: "0",
      QFT_WECHAT_CLICK_FORCE_FAIL: "1"
    }
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { ok: boolean; reply: string };
  assert.equal(output.ok, true);
  assert.match(output.reply, /连续读取：未打开会话|连续读取：已点击第一个可见未读会话/);
  if (/点击失败/.test(output.reply)) {
    assert.match(output.reply, /wechat-process/);
    assert.match(output.reply, /system-events/);
    assert.match(output.reply, /jxa-cgevent/);
  }
});

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt8(0x89, 0);
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt8(0x0d, 4);
  buffer.writeUInt8(0x0a, 5);
  buffer.writeUInt8(0x1a, 6);
  buffer.writeUInt8(0x0a, 7);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
