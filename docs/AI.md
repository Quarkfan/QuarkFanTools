# 项目接续入口

此文件是 QuarkfanTools 的首要导航页。任何新会话应先阅读此页，再根据任务进入对应文档和代码。

## 30 秒恢复上下文

QuarkfanTools 是一个自包含的 macOS 飞书 Skill Agent。用户配置兼容 Claude Messages API 的模型和一个或多个飞书机器人；应用通过内置 `lark-cli` 监听消息，使用 Claude Agent SDK 在机器人隔离的会话 workspace 中匹配和执行获授权 Skills，再通过飞书回复。

当前版本 `1.6.19`。当前状态、风险和下一步见 [`../STATUS.md`](../STATUS.md)。

## 文档地图

| 文档 | 用途 |
| --- | --- |
| [`../README.md`](../README.md) | 用户和开发者快速入口 |
| [`../STATUS.md`](../STATUS.md) | 当前版本、已完成、风险、下一步、最近验证 |
| [`requirements.md`](requirements.md) | 产品目标、范围、需求和验收标准 |
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
| `electron/lark-cli.ts` | 飞书 CLI 监听、回复、表情、资源下载与 OAuth |
| `electron/claude.ts` | Claude Agent SDK、会话恢复、工具与 sandbox |
| `electron/conversation.ts` | 连续对话键和 workspace 哈希 |
| `electron/sessions.ts` | 24 小时会话状态持久化 |
| `electron/skills.ts` | 内置、市场、用户 Skills 发现与导入 |
| `electron/skill-market.ts` | 应用内置 Git Skill 市场同步 |
| `electron/release-notes.ts` | 应用内版本号与面向用户的更新记录 |
| `electron/office.ts` | Word、PPT、Excel 预处理 |
| `electron/storage.ts` | 会话数据统计和清理 |
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
