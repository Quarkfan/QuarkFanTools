# 微信桌面辅助 Agent PoC

本文记录对“通过 macOS 桌面层操作微信”的可行性验证。该方向只作为产品和技术 PoC，不代表 QuarkfanTools 已支持微信机器人。

## 1. 结论

可行，但不应按 IM Provider 或协议机器人实现。更合适的产品定位是：

```text
非侵入式微信桌面辅助 Agent
```

它只做用户本人在屏幕上可见、可操作的动作：

- 激活微信窗口。
- 截取当前微信窗口，并通过本地初筛和已配置多模态模型识别可见未读标记和文本。
- 后续真实执行器可再探索搜索联系人、截图并识别当前会话。
- 生成或接收回复草稿。
- 把草稿写入系统剪贴板，用户手动粘贴到微信输入框。
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
  -> capability governance
  -> desktop action plan
  -> user manually sends in WeChat
```

本分支新增内置模板：

```text
builtin-apps/wechat-draft-assistant/
```

模板会实际尝试激活微信、读取当前窗口边界、截取当前微信窗口，并在提供草稿时写入剪贴板。截图识别请求通过主进程调用已配置多模态模型，API Key 不暴露给模板脚本。它仍不搜索联系人、不自动粘贴、不自动发送。后续若接入更完整的执行器，应继续复用 `desktopAutomation` 权限声明和治理诊断。

## 3. 权限模型

自定义应用 manifest 可声明：

```json
{
  "permissions": {
    "requiresOwnerApproval": false,
    "desktopAutomation": {
      "screenCapture": true,
      "accessibility": true,
      "clipboard": true,
      "keyboardInput": false,
      "autoSend": false
    }
  }
}
```

治理规则：

- `screenCapture` / `accessibility` / `clipboard` / `keyboardInput` 都会标记高风险。
- `autoSend=true` 在当前 PoC 中直接阻断导入或升级。
- 内置 PoC 模板默认允许命令调用，便于本机验证；能力治理仍会把屏幕录制、辅助功能和剪贴板标记为高风险。
- 真实读取前必须由用户在 macOS 系统设置中授予 QuarkfanTools 辅助功能和屏幕录制权限，并在配置页启用支持视觉输入的模型。

## 4. 当前 PoC 能力

新增纯逻辑模块：

```text
electron/desktop-agent.ts
```

它提供：

- `buildWeChatDraftPlan`：生成微信草稿动作计划。
- `buildWeChatUnreadScanPlan`：生成可见未读优先的动作计划。
- `extractWeChatUnreadCandidates`：从辅助功能文本、OCR 文本或多模态识别结果中提取未读或可见文本候选。
- `validateDesktopAgentActions`：校验当前会话、置信度、输入框状态和自动发送风险。
- `isHighRiskDraft`：识别金额、合同、报价、承诺等高风险草稿。
- `appleScriptActivateWeChat`：最小 AppleScript 激活命令示例。

当前内置模板真实执行 AppleScript 激活微信、System Events 窗口边界读取、微信窗口截图、本地初筛、受控多模态识别请求，以及可选 `pbcopy` 写入剪贴板；没有真实执行 Quartz 事件，也不会搜索联系人、自动粘贴或发送。读取范围只限当前可见微信窗口截图，不能保证覆盖滚动列表之外的未读会话。

## 5. 下一步验证

1. 在安装包中验证辅助功能和屏幕录制授权后的微信窗口截图识别，并记录不同微信版本的视觉识别稳定性。
2. 加入会话标题校验，确保“张三”和“张三丰”这类误点能被拦截。
3. 评估是否需要进一步裁剪聊天列表区域，减少模型看到非微信或非列表内容。
4. 草稿仍只写入剪贴板，由用户手动粘贴到输入框，不点击发送。
5. 形成可审计日志：可见读取结果、动作计划、校验结果和用户确认状态。

自动发送只能在后续单独评审后开放，并且必须满足白名单联系人、低风险内容、会话标题一致、置信度足够高和发送前截图存档。
