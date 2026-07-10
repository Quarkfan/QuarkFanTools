# macOS 依赖与 Linux 服务端迁移

本文梳理 QuarkfanTools 当前对 macOS 的依赖，并给出未来迁移到 Linux 服务器部署时的蓝图方向。Linux 服务端是远期蓝图功能，不是当前或下一阶段开发路线；当前路线仍在 macOS 本机应用上，下一步技术重点是按八个中心拆分子系统、接口和边界。

当前 `2.2.6` 产品形态仍是 macOS 本机 Electron 应用，默认交付 Apple Silicon / arm64 安装包。Linux 服务端只有在 macOS 本机子系统拆分稳定后，才进入单独评审和立项。

## 1. 结论摘要

| 层级 | 当前 macOS 依赖程度 | Linux 迁移判断 |
| --- | --- | --- |
| Electron 桌面壳和 UI | 高 | 服务端应拆为 Web Console / API Server；Electron 只保留为可选本机客户端 |
| 数据目录 | 中 | 可迁移；需要抽象 `AppDataProvider`，不要直接依赖 Electron `app.getPath` |
| 飞书事件和 OpenAPI | 低到中 | 核心可迁移；需要确认 Linux 版 `lark-cli` 或改为原生 OpenAPI SDK |
| Claude Code Runtime | 高 | 当前打包只拉取 darwin arm64；Linux 需确认 SDK runtime 包和 sandbox 行为 |
| Claude sandbox / filesystem allowlist | 高 | Linux 不能复用 macOS sandbox 假设；应改为进程、用户、容器或命名空间隔离 |
| Office Open XML 文本解析 | 低 | 可直接迁移；纯 Node 解压和 XML 解析 |
| PowerPoint 视觉预览 | 高 | 当前依赖 macOS Quick Look；Linux 需 LibreOffice、Playwright 渲染或独立转换服务 |
| Vision OCR helper | 高 | 当前 Swift + Apple Vision；Linux 需 OCR 服务、Tesseract、PaddleOCR 或模型接口 |
| 微信桌面辅助 PoC | 极高 | Linux 服务端不应迁移；属于本机桌面自动化能力 |
| 默认 Playwright MCP | 中 | 可迁移；但不能继续假设 Electron 可执行文件和本机 Chrome 存在 |
| 打包发布 | 极高 | DMG、HFS+、hdiutil、签名/公证仅 macOS；Linux 需 Docker/系统服务/二进制包 |
| Keychain / lark-cli 安全存储 | 中到高 | 当前用 Bot 专属 HOME 模拟隔离；Linux 需确认 CLI 安全存储路径和权限 |

远期推荐路线：不要把现有 Electron 应用“直接搬到 Linux”。如果未来启动 Linux 蓝图，应先在 macOS 本机主线中完成八个中心的子系统拆分，再评估 Headless Core、API Server、Worker 和 Web Console。短期不把 Linux PoC 作为优先级。

## 2. 当前 macOS 依赖清单

### 2.1 桌面应用与 UI

当前依赖：

- Electron 主进程和渲染进程。
- `electron/paths.ts` 使用 `app.getPath("userData")`、`app.getPath("appData")`、`process.resourcesPath`。
- UI 通过 Electron IPC 调用主进程受控能力。
- 发布产物是 `.app`、`.dmg`、`.zip`。

Linux 服务端影响：

- 服务端没有桌面窗口、系统托盘、Finder 打开目录、macOS 拖拽窗口等概念。
- 不能把 Electron IPC 作为服务端 API 边界。

迁移方向：

- 新增 `Headless Core`：只包含配置、MG、知识、模型、工具、运行时、资源、调度、治理。
- 新增 `Web Console`：替代 Electron 渲染层，调用 HTTP / WebSocket / RPC API。
- Electron Desktop 可继续作为 macOS 本机客户端，但不再承载唯一主进程能力。

### 2.2 数据目录与配置

当前依赖：

- 开发态：项目内 `config/`、`state/`、`workspace/`。
- 打包态：`~/Library/Application Support/quarkfantools/`。
- 旧版迁移：`~/Library/Application Support/qah/`。
- Bot 的 lark-cli HOME：`state/bots/<bot-id>/lark-home/Library/Application Support/lark-cli/`。

Linux 服务端影响：

- 服务端应使用明确数据根，例如 `/var/lib/quarkfantools`、`/var/log/quarkfantools`、`/etc/quarkfantools`，或容器挂载卷。
- 旧 `qah` 迁移只属于 macOS 桌面升级，不应进入 Linux 服务端核心路径。

迁移方向：

```ts
interface AppDataProvider {
  configRoot(): string;
  stateRoot(): string;
  workspaceRoot(): string;
  cacheRoot(): string;
  logRoot(): string;
  runtimeRoot(): string;
}
```

需要提供：

- `MacElectronDataProvider`
- `DevDataProvider`
- `LinuxServerDataProvider`
- `ContainerDataProvider`

### 2.3 打包和运行时二进制

当前依赖：

- `scripts/prepare-arm64-claude.sh` 只下载 `@anthropic-ai/claude-agent-sdk-darwin-arm64`。
- `scripts/prepare-arm64-lark-cli.sh` 下载 `lark-cli-<version>-darwin-arm64.tar.gz`。
- `scripts/prepare-arm64-wecom-cli.sh` 只准备 macOS arm64 企业微信 CLI。
- `scripts/prepare-arm64-vision-ocr.sh` 用 `swiftc -target arm64-apple-macos12` 编译 Apple Vision OCR helper。
- `scripts/create-arm64-dmg.sh` 使用 `ditto`、`ln -s /Applications`、`hdiutil create -fs HFS+ -format UDZO`。
- `package.json` 的 `pack:mac` 只构建 macOS arm64。

Linux 服务端影响：

- 当前发布链路不能生成 Linux 产物。
- 当前内嵌 runtime 也不是 Linux 架构。

迁移方向：

- 把 `runtime` 准备脚本拆成平台矩阵：
  - `prepare-runtime-claude --platform darwin|linux --arch arm64|x64`
  - `prepare-runtime-lark-cli --platform darwin|linux --arch arm64|x64`
  - `prepare-runtime-browser --platform ...`
- Linux 发布形态优先考虑 Docker image、tarball、systemd service，而不是桌面安装包。
- 不要把 macOS DMG 验证口径沿用到 Linux；Linux 需要镜像启动、健康检查和卷权限验证。

### 2.4 Claude Code Runtime 与 sandbox

当前依赖：

- `electron/claude.ts` 使用 `@anthropic-ai/claude-agent-sdk`。
- 当前打包准备的是 darwin arm64 Claude runtime。
- 使用 Claude sandbox、`bypassPermissions`、filesystem allowlist / denylist。
- macOS 下为 lark-cli TLS 信任放宽 `trustd` 相关网络隔离。

Linux 服务端影响：

- 需要确认 Claude Code Runtime 是否提供 Linux 可执行和等价 sandbox 能力。
- 即使可运行，也不能假设 macOS sandbox 策略在 Linux 上语义相同。
- 服务端多租户风险比本机单用户更高，不能只靠当前 allowlist。

迁移方向：

- 先落 `AgentRuntime` 抽象。
- `ClaudeCodeRuntime` 下再分 `DarwinClaudeCodeRuntime` 和 `LinuxClaudeCodeRuntime`。
- Linux 隔离优先级：
  1. 容器级隔离：每 Bot / 每任务容器或沙箱。
  2. Linux 用户隔离：不同 Bot 用不同系统用户运行 worker。
  3. Namespace / cgroup / seccomp / AppArmor。
  4. 仅路径 allowlist 只能作为补充，不能作为服务端主边界。

### 2.5 IM Provider 与飞书 CLI

当前依赖：

- 飞书事件订阅通过本机 `lark-cli event +subscribe`。
- 每个 Bot 设置独立 `HOME` 和 profile。
- 新版 CLI 兼容问题已通过 OpenAPI 补取 Bot `open_id`。
- 企业微信 CLI 代码保留但 Provider 封闭。

Linux 服务端影响：

- 如果 Linux 存在官方 `lark-cli`，需要验证 event subscribe、OAuth、安全存储、drive export/download、reaction、send message 参数是否一致。
- 如果 Linux CLI 不稳定，应把核心能力迁移为直接调用飞书 OpenAPI，而不是依赖 CLI。
- 服务端部署会长期运行，事件连接、重连、限流和日志量都需要服务化治理。

迁移方向：

```ts
interface ImProviderAdapter {
  start(botId: string): Promise<void>;
  stop(botId: string): Promise<void>;
  sendMessage(request: SendMessageRequest): Promise<SendMessageResult>;
  addReaction(request: ReactionRequest): Promise<void>;
  removeReaction(request: ReactionRequest): Promise<void>;
  fetchHistory(request: HistoryRequest): Promise<InboundMessage[]>;
}
```

实现候选：

- `LarkCliProviderAdapter`：保留桌面版 CLI 路径。
- `LarkOpenApiProviderAdapter`：Linux 服务端优先目标。
- `WebhookProviderAdapter`：未来可支持飞书事件回调，替代长连接。

### 2.6 Office 与多模态文件处理

当前依赖：

- Word / Excel / PowerPoint 的文本预处理是 Node 解压 + XML 解析，可跨平台。
- PowerPoint 视觉预览依赖 `/usr/bin/qlmanage`，只能在 macOS 使用。
- PPT 多模态质量受 Quick Look 输出影响。

Linux 服务端影响：

- `.docx/.xlsx/.pptx` 文本摘要可继续用。
- PPT 视觉预览必须替换。

迁移方向：

- 将 Office 处理拆为：
  - `OfficeTextExtractor`：跨平台。
  - `PresentationPreviewRenderer`：平台适配。
- Linux 渲染方案可选：
  - LibreOffice headless 转 PDF/PNG。
  - OnlyOffice / Collabora 转换服务。
  - Playwright 渲染自建 PPT 预览页。
  - 直接跳过视觉预览，降级为文本模式。

### 2.7 OCR 与桌面自动化

当前依赖：

- Vision OCR helper 使用 Swift + Apple Vision。
- 微信桌面辅助 PoC 使用 AppleScript / System Events / 屏幕录制 / 辅助功能 / 剪贴板 / CGEvent 等 macOS 桌面能力。

Linux 服务端影响：

- Linux 服务器通常没有用户桌面，也不应代用户操作微信桌面。
- 微信桌面 PoC 不应迁移到 Linux 服务端。
- OCR 可迁移，但必须换实现。

迁移方向：

- 桌面自动化保留为 `DesktopAutomationCapability`，仅 macOS 本机客户端可用。
- Linux 上该能力应显示为不可用或转为远程客户端委托。
- OCR 抽象：

```ts
interface OcrProvider {
  recognizeImage(input: ResourceRef): Promise<OcrResult>;
}
```

Linux 实现候选：Tesseract、PaddleOCR、云 OCR、多模态模型。

### 2.8 默认 Playwright MCP

当前依赖：

- 默认 Playwright MCP 通过当前 Electron 可执行文件加 `ELECTRON_RUN_AS_NODE=1` 启动。
- 默认 `--browser chrome`，要求目标机器存在可用 Chrome。
- 产物写入当前 workspace 的 `.playwright/`。

Linux 服务端影响：

- 服务端不应依赖 Electron 可执行文件。
- Linux 容器内需要安装浏览器依赖和字体。
- 多 Bot 并发浏览器上下文需要资源配额。

迁移方向：

- 桌面版：继续用 Electron as Node 启动 MCP。
- Linux 服务端：使用 Node.js 直接启动 `@playwright/mcp`，并捆绑或安装 Chromium。
- 资源中心需要监控 Playwright 产物、浏览器进程、截图大小和超时。

### 2.9 自定义应用与 MCP

当前依赖：

- 自定义应用 `node` 入口依赖应用内置 Node/Electron 运行。
- `executable` 入口执行本机命令，当前风险提示偏本机桌面语境。
- MCP `stdio` 会启动本机命令。

Linux 服务端影响：

- 自定义应用和 MCP 在服务器上执行，风险从“用户本机”变成“服务器租户边界”。
- 必须重新设计执行隔离、环境变量、文件系统、网络访问和资源配额。

迁移方向：

- 自定义应用执行器拆为：
  - `LocalDesktopAppRunner`
  - `LinuxWorkerAppRunner`
  - `ContainerizedAppRunner`
- MCP 执行器拆为：
  - `LocalStdioMcpRunner`
  - `ServerStdioMcpRunner`
  - `RemoteHttpMcpRunner`
- Linux 服务端默认不应允许任意 `executable`，除非容器隔离和管理员 allowlist 完成。

### 2.10 日志、排障包和可观测性

当前依赖：

- 日志和排障包都在本机应用数据目录中生成。
- 用户手工保存 ZIP 后发给支持。

Linux 服务端影响：

- 服务端需要区分用户可见日志、管理员日志和系统运维日志。
- 排障包可能包含多 Bot、多租户数据，不能让普通用户导出全局日志。

迁移方向：

- 资源中心新增租户 / Bot / workspace 维度日志索引。
- 排障包导出必须要求治理中心判定导出范围。
- 服务端应支持结构化日志、健康检查、指标和 trace。

## 3. 按八个中心看迁移任务

| 中心 | Linux 迁移重点 |
| --- | --- |
| Message Gateway（MG，消息网关） | 从本机 CLI 长连接逐步支持 OpenAPI / Webhook；事件入队服务化 |
| Context Hub（CH，上下文中心） | 从本机文件缓存和会话摘要演进为服务端缓存、对象存储、RAG 索引、短期/中期/长期记忆和权限过滤 |
| 模型中心 | 服务端集中管理 Provider、限流、额度、计费和失败切换 |
| 工具与能力中心 | 自定义应用、MCP、Skill 从本机目录迁移为受管资源和版本化包 |
| 运行时中心 | 抽象 `AgentRuntime`，区分 Darwin / Linux Runtime，明确工具能力差异 |
| 资源中心 | 数据根、日志、缓存、排障包、配额、清理、监控全部服务化 |
| 调度与系统基础中心 | 定时任务从桌面常驻改为服务端队列、worker 和持久调度 |
| 治理与安全中心 | 从单机 Bot 隔离升级为多租户、容器、secret、审计和导出权限 |

## 4. 蓝图迁移阶段

以下阶段仅作为远期蓝图。当前下一步不是做 Linux PoC，而是在 macOS 本机上完成子系统拆分，让这些抽象未来可复用。

### 阶段一：macOS 本机子系统拆分

- 抽象 `AppDataProvider`，移除业务代码对 Electron `app.getPath` 的直接依赖。
- 抽象 `AgentRuntime`，当前 Claude Code 作为 Darwin 默认实现。
- 抽象 `ImProviderAdapter`，保留 CLI 实现，同时准备 OpenAPI 实现。
- 抽象 `OfficePreviewRenderer` 和 `OcrProvider`。
- 抽象 `BrowserToolProvider`，桌面版用 Electron as Node，Linux 版用 Node + Chromium。

### 阶段二：Headless Core 可行性评审

- 在 macOS 本机子系统拆分稳定后，再评估是否将 Electron 主进程中的核心能力拆成可无窗口启动的服务。
- 提供本地 HTTP / RPC API。
- Electron UI 改为 API client。
- 保持 macOS 桌面版行为不变。

### 阶段三：Linux Worker PoC

- 仅在产品明确立项 Linux 蓝图后，先跑一个单租户 Linux Worker。
- 只启用飞书 MG、模型调用、文本 Skill、受控文件缓存和基础定时任务。
- 暂时关闭桌面自动化、PPT 视觉预览、任意 executable、自定义应用自动运行。
- 用 Docker volume 固定 config/state/workspace/cache/log。

### 阶段四：服务端安全模型

- Bot / 租户隔离。
- Secret 管理。
- 容器或系统用户隔离。
- 资源限额。
- 审计和排障包导出范围控制。

### 阶段五：完整服务端产品化

- Web Console。
- 多 worker 队列。
- Webhook 或长连接事件网关。
- RAG / 知识索引服务。
- 模型用量统计和限额。
- 备份、迁移、升级和健康检查。

## 5. 当前不可直接迁移项

这些能力不能假设在 Linux 服务端可用：

- macOS Electron 桌面窗口和拖拽体验。
- `.app` / `.dmg` / HFS+ / `hdiutil` 打包验证。
- macOS Quick Look PowerPoint 预览。
- Swift / Apple Vision OCR helper。
- AppleScript、System Events、CGEvent、屏幕录制、辅助功能、剪贴板自动化。
- Finder 打开目录。
- macOS Gatekeeper、签名和公证。
- 当前 darwin arm64 内嵌 Claude / lark-cli / wecom-cli runtime。
- 依赖真实用户桌面会话的微信未读读取和草稿能力。

## 6. 可以优先复用项

这些能力迁移成本较低：

- 配置结构和 Bot 配置大部分字段。
- 飞书 OpenAPI 语义、Bot 身份、MG 规则和严格 mention 策略。
- 多 MODEL PROVIDER 策略、轮流/随机、失败切换。
- Skill 目录规范和大部分纯文本 Skill。
- Office Open XML 文本提取。
- 受控文件缓存协议的治理思想。
- 定时任务定义模型和运行历史语义。
- 能力目录、Bot 授权、policy、Owner 审批模型。
- 排障包脱敏规则，但导出范围要重做。
- 平台中心和跨中心协议文档。

## 7. Linux 服务端最小可行形态

第一版 Linux 服务端建议只承诺：

- 单租户或单团队部署。
- 飞书 Bot 消息接收和回复。
- MODEL PROVIDER 管理。
- 文本 Agent Runtime。
- 纯文本 Skill。
- 飞书文档 / 云盘读取和受控缓存。
- 定时任务。
- Web Console 基础配置和日志。
- Docker 部署。

第一版明确不承诺：

- 微信桌面辅助。
- PPT 视觉预览。
- macOS Vision OCR。
- 任意本机 executable 自定义应用。
- 多租户强隔离。
- 未验证的 Linux Claude Code sandbox 等价安全。

## 8. 决策问题

进入 Linux 设计前需要先确定：

1. Linux 是单客户私有化部署，还是多租户 SaaS？
2. 消息入口使用飞书长连接、Webhook，还是两者都支持？
3. Agent Runtime 是否继续以 Claude Code 为主，还是先做无工具文本 runtime？
4. Skill 和自定义应用是否允许客户上传代码到服务器执行？
5. 是否接受 Docker 作为唯一 Linux 部署形态？
6. 是否需要服务端集中管理模型 Key、用量、计费和额度？
7. 本机桌面能力是否保留为 macOS 客户端远程委托，而不是迁移到服务器？
