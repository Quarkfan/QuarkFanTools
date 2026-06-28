# 微信桌面辅助 Agent PoC

本文记录对“通过 macOS 桌面层操作微信”的可行性验证。该方向只作为产品和技术 PoC，不代表 QuarkfanTools 已支持微信机器人。

## 1. 结论

可行，但不应按 IM Provider 或协议机器人实现。更合适的产品定位是：

```text
非侵入式微信桌面辅助 Agent
```

它只做用户本人在屏幕上可见、可操作的动作：

- 激活微信窗口。
- 搜索并打开指定联系人。
- 截图并识别当前会话。
- 生成或接收回复草稿。
- 把草稿粘贴到微信输入框。
- 默认停止，等待用户手动发送。

PoC 不做：

- 不读取微信本地数据库。
- 不调用微信未公开协议。
- 不注入、Hook 或逆向微信进程。
- 不绕过微信登录、权限或风控。
- 不做批量营销、自动加好友、自动拉群或敏感内容自动发送。

## 2. 接入位置

当前 PoC 不恢复企业微信 Provider，也不新增 `wechat` IM Provider。它应先作为自定义应用能力进入现有 Capability Governance：

```text
Custom App template
  -> Bot capability ref
  -> command target
  -> Owner approval
  -> desktop action plan
  -> user manually sends in WeChat
```

本分支新增内置模板：

```text
builtin-apps/wechat-draft-assistant/
```

模板只输出动作计划，不实际操作系统 UI。后续若接入真实执行器，应继续复用 `desktopAutomation` 权限声明和治理诊断。

## 3. 权限模型

自定义应用 manifest 可声明：

```json
{
  "permissions": {
    "requiresOwnerApproval": true,
    "desktopAutomation": {
      "screenCapture": true,
      "accessibility": true,
      "clipboard": true,
      "keyboardInput": true,
      "autoSend": false
    }
  }
}
```

治理规则：

- `screenCapture` / `accessibility` / `clipboard` / `keyboardInput` 都会标记高风险。
- `autoSend=true` 在当前 PoC 中直接阻断导入或升级。
- 默认要求 Owner 审批。
- 真实执行前必须由用户在 macOS 系统设置中授予屏幕录制和辅助功能权限。

## 4. 当前 PoC 能力

新增纯逻辑模块：

```text
electron/desktop-agent.ts
```

它提供：

- `buildWeChatDraftPlan`：生成微信草稿动作计划。
- `validateDesktopAgentActions`：校验当前会话、置信度、输入框状态和自动发送风险。
- `isHighRiskDraft`：识别金额、合同、报价、承诺等高风险草稿。
- `appleScriptActivateWeChat`：最小 AppleScript 激活命令示例。

当前没有真实执行 AppleScript、Accessibility API、ScreenCaptureKit、OCR 或 Quartz 事件。

## 5. 下一步验证

1. 先在本机独立原型中验证微信窗口激活和窗口截图，不接入主运行时。
2. 固定微信窗口大小、浅色模式和字体大小，验证最近 10 条纯文本单聊 OCR。
3. 加入会话标题校验，确保“张三”和“张三丰”这类误点能被拦截。
4. 只把草稿粘贴到输入框，不点击发送。
5. 形成可审计日志：截图路径、识别结果、动作计划、校验结果和用户确认状态。

自动发送只能在后续单独评审后开放，并且必须满足白名单联系人、低风险内容、会话标题一致、置信度足够高和发送前截图存档。
