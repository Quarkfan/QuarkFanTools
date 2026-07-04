# 项目接续入口

此文件是 QuarkfanTools 的首要导航页。任何新会话应先阅读此页，再根据任务进入对应文档和代码。

## 30 秒恢复上下文

QuarkfanTools 是一个自包含的 macOS 多 IM Skill Agent。用户配置兼容 Claude Messages API 的模型和一个或多个机器人；当前正式开放飞书 Provider，应用通过飞书 IM Provider 监听消息，使用 Claude Agent SDK 在机器人隔离的会话 workspace 中匹配和执行获授权 Skills，再通过原消息平台回复。企业微信 Provider 的代码、配置兼容层和 CLI 参考缓存保留，但因官方能力限制，当前 UI 与运行时入口暂时封闭。

当前版本 `2.2.6`。2.0 当前已进入远端 `main` 主线，工作分支为 `codex/2.0.0-stabilize`。当前状态、风险和下一步见 [`../STATUS.md`](../STATUS.md)。

1.x 系列分支已封版，后续只作为历史兼容样本，不再作为同步目标。后续发布和验证默认只考虑 arm64 / Apple Silicon；Intel x64 不再作为当前交付目标。接下来优先完成 2.0 需求：真实 IM 端到端、MCP 真实服务验证和发布签名/公证收口。命令机制、定时任务、缓存治理、自定义应用本地生命周期、升级兼容备份、套件/Workflow 首版、MCP HTTP/SSE 占位配置、IM 连接器诊断和场景化使用手册已进入完成态，后续主要按端到端清单验证。

## 文档地图

| 文档 | 用途 |
| --- | --- |
| [`../README.md`](../README.md) | 用户和开发者快速入口 |
| [`../STATUS.md`](../STATUS.md) | 当前版本、已完成、风险、下一步、最近验证 |
| [`PRD.md`](PRD.md) | 面向产品经理的产品定位、历史、功能全景、范围边界和路线 |
| [`PRODUCT_HANDOFF.md`](PRODUCT_HANDOFF.md) | 产品接手交接信息、当前边界、历史结论、下一步决策问题和新会话指令 |
| [`requirements.md`](requirements.md) | 产品目标、范围、需求和验收标准 |
| [`2.0-design.md`](2.0-design.md) | 2.0.0 定时任务、MCP、自定义应用、套件、命令和主题设计 |
| [`2.0-e2e-checklist.md`](2.0-e2e-checklist.md) | 2.0 真实环境端到端验证清单 |
| [`wechat-desktop-agent-poc.md`](wechat-desktop-agent-poc.md) | 微信桌面辅助 Agent PoC 边界、权限模型和后续验证 |
| [`architecture.md`](architecture.md) | 技术结构、数据流、隔离、会话和目录模型 |
| [`operations.md`](operations.md) | 配置、运行、数据管理、排障、构建和发布 |
| [`codex-network-proxy-rollback.md`](codex-network-proxy-rollback.md) | 本机 Codex App 固定 Clash 代理后的撤回和验证手册 |
| [`security.md`](security.md) | 安全边界、敏感信息、威胁和已知风险 |
| [`decisions.md`](decisions.md) | 关键设计决策与理由 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 应用版本变更历史 |
| [`../CLAUDE.md`](../CLAUDE.md) | 后续 AI/开发者的协作和文档维护规则 |

## 代码地图

| 路径 | 职责 |
| --- | --- |
| `electron/main.ts` | Electron 主进程、窗口与 IPC |
| `src/main.ts` | GUI 渲染层 |
| `electron/runtime.ts` | 多机器人监听、任务排队与消息处理总编排 |
| `electron/im-providers.ts` | IM Provider 统一接口；当前开放飞书，企业微信和钉钉入口由运行时拒绝 |
| `electron/lark-cli.ts` | 飞书 CLI 监听、回复、表情、资源下载与 OAuth |
| `electron/wecom-cli.ts` | 企业微信 CLI 监听、回复、资源下载首版适配代码；当前入口封闭，仅作为后续恢复参考 |
| `github/wecom-cli/` | 官方 WecomTeam/wecom-cli 本地参考源码缓存，不提交到本项目 Git |
| `electron/platform-connectors.ts` | 主消息平台与飞书知识连接器解析 |
| `electron/platform-diagnostics.ts` | IM Provider、飞书连接器和投递路由配置诊断 |
| `electron/claude.ts` | Claude Agent SDK、会话恢复、工具与 sandbox |
| `electron/conversation.ts` | 连续对话键和 workspace 哈希 |
| `electron/sessions.ts` | 24 小时会话状态持久化 |
| `electron/skills.ts` | 内置、市场、用户 Skills 发现与导入 |
| `electron/suites.ts` | 套件发现、导入、升级、卸载、预览、生命周期和 manifest 诊断 |
| `electron/executable-capability-bindings.ts` | 将 capability 引用解析为可执行 binding |
| `electron/capability-executor.ts` | Skill / 套件 / Workflow / 自定义应用的统一执行分派 |
| `electron/desktop-agent.ts` | 微信桌面辅助 PoC 的动作计划与安全校验；当前不执行真实系统 UI 操作 |
| `electron/workflow-control.ts` | Workflow 条件、循环和模板变量控制语义 |
| `electron/skill-market.ts` | 应用内置 Git Skill 市场同步 |
| `electron/release-notes.ts` | 应用内版本号与面向用户的更新记录 |
| `electron/office.ts` | Word、PPT、Excel 预处理 |
| `electron/claude.ts` | Claude Agent SDK、MCP 注入与会话恢复 |
| `electron/storage.ts` | 会话数据统计和清理 |
| `electron/scheduled-task-core.ts` | 定时任务计划时间计算 |
| `electron/scheduled-tasks.ts` | 定时任务状态持久化与运行记录 |
| `electron/config.ts` | 配置加载、保存与旧版迁移 |
| `builtin-skills/` | 安装包内置 Office Skills |
| `skills/` | 开发参考 Skills，不打入安装包 |

## 开始一个任务

1. 阅读 `STATUS.md` 和相关专题文档。
2. 用代码和测试确认文档描述仍然成立。
3. 检查 `git status`，保留用户已有修改。
4. 实现并运行与风险匹配的验证，常规基线是 `npm test`。
5. 同步更新受影响文档、`STATUS.md` 和 `CHANGELOG.md`。

不要仅把聊天记录当作需求来源；新的稳定结论必须落入仓库文档。
