# 关键设计决策

本文件记录影响后续实现方向的稳定决策。需要改变时，保留原记录并将状态改为“已替代”或“已撤销”，再新增决策。

## D-001 使用 Claude Agent SDK 作为运行内核

- 状态：已采用
- 决策：使用官方 `@anthropic-ai/claude-agent-sdk`，模型服务必须兼容 Claude Messages API 和工具调用。
- 原因：需要 Agent 会话恢复、工具调用、Skill 调度和多模态能力；仅兼容 OpenAI Responses API 不满足当前内核要求。

## D-002 交付物不依赖用户开发环境

- 状态：已采用
- 决策：安装包内置 Electron、Claude 运行时、飞书 CLI、Git 客户端和 Office 解析能力。
- 原因：目标用户不能被假定拥有 Git、Node、Python、Office 或其他命令行环境。

## D-003 多机器人采用物理目录与权限双重隔离

- 状态：已采用
- 决策：每个机器人独立飞书状态、Claude home、会话状态与 workspace，并只映射获授权 Skills。
- 原因：只依靠提示词无法形成可靠隔离。

## D-004 连续会话按聊天场景区分

- 状态：已采用
- 决策：私聊以 chat 为会话；群聊以 chat 和发送者组合为会话；无活动 24 小时过期。
- 原因：私聊需要自然连续上下文，群聊中不同用户不应共享个人上下文。

## D-005 使用原消息表情表示处理中

- 状态：已采用
- 决策：收到消息后添加处理中表情，结束后移除，不发送额外“正在查询”文本。
- 原因：减少聊天噪声，同时向用户提供即时反馈。

## D-006 Skill 市场只支持 HTTPS Git

- 状态：已采用
- 决策：使用 `isomorphic-git` 和 HTTPS URL，支持分支与可选 Token，不支持 SSH。
- 原因：避免依赖用户系统 Git、SSH Key 和 Agent 环境。

## D-007 Office 文件在应用内预处理

- 状态：已采用
- 决策：使用 ZIP/XML 提取 Word、PowerPoint、Excel 内容；PowerPoint 多模态预览使用 macOS Quick Look。
- 原因：满足自包含交付，同时利用操作系统已有视觉渲染能力。

## D-008 会话清理保留长期配置与 Skills

- 状态：已采用
- 决策：存储清理删除目标会话 workspace、Claude 会话文件和跟踪附件，保留配置、飞书授权和用户 Skills。
- 原因：让用户控制存储，而不因清理上下文破坏可用配置。

## D-009 使用三段式版本号并区分用户与开发更新记录

- 状态：已采用
- 决策：版本号使用 `主版本.次版本.修订版本`。大的应用能力或不兼容变化升级主版本；新增明显完整功能升级次版本；修复、优化和轻量小能力升级修订版本。根 `CHANGELOG.md` 面向开发与发布，应用内 `electron/release-notes.ts` 面向用户。每次形成具体版本号后必须在同一轮完成 arm64 与 x64 打包；未打包变化只保留在 `Unreleased`。
- 原因：让版本变化能够表达影响范围，同时让普通用户在应用内直接理解更新内容。

## D-010 本地 Skill 删除必须先取消授权

- 状态：已采用
- 决策：用户只能删除未被任何机器人授权使用的本地 Skill；已授权 Skill 必须先在 Bot 配置中取消授权。Git 市场与应用内置 Skill 不提供单项删除。
- 原因：Skill 授权按名称保存；删除仍在使用的 Skill 容易让机器人能力突然缺失或暴露同名低优先级 Skill。

## D-011 跨会话使用全局并发队列

- 状态：已采用
- 决策：同一会话继续串行处理，不同会话通过全局限流器按配置并发，超出上限后排队并展示排队数量。
- 原因：无限并发会让多个 Agent 争抢模型额度、CPU 和飞书 CLI 资源，导致部分用户长时间无回复。

## D-012 Owner 人工协作使用持久化请求与私聊卡片

- 状态：已采用
- 决策：Bot 配置单个 Owner open_id；Agent 通过结构化结果发起升级，Runtime 私聊发送卡片并持久化请求，仅接受 Owner 本人的处理指令。
- 原因：无需部署公网卡片回调服务即可形成可审计、重启可恢复的人工协作闭环。

## D-013 飞书文档能力使用用户态并允许 sandbox trustd

- 状态：已采用
- 决策：事件监听与回复继续使用机器人配置身份；Agent 查找、读取和导出飞书文档、Wiki、云盘及云 PPT 固定使用用户态。macOS Claude sandbox 允许访问系统 trustd，以便内置 Go lark-cli 校验 sandbox 网络代理的 TLS 证书，但继续禁止 unsandboxed 命令。
- 原因：飞书文档搜索依赖用户态权限；sandbox 网络代理是 Agent 外部访问边界，而 Go TLS 在默认 macOS sandbox 中无法访问 trustd，会导致所有飞书文档请求在到达 API 前失败。

## D-014 延后下载使用持久化确认任务

- 状态：已采用
- 决策：Agent 通过结构化结果创建待确认任务，用户使用 `/continue <id>` 确认后在原会话队列继续。已下载附件按内容哈希全局去重，但全局缓存只由主进程访问并记录 Bot 授权。
- 原因：先回复已有答案可降低等待感；持久化任务可跨重启保留，同时避免向 Agent 开放跨机器人共享目录。

## D-015 思考开关只展示可观察工作进度

- 状态：已采用
- 决策：Bot 的工作过程开关只展示 SDK 可观察的工具调用类别、检索状态和重试状态，不展示模型隐藏推理。
- 原因：原始思维链不适合作为用户进度信息，且可能包含敏感上下文；可观察事件足以解释当前工作阶段。

## D-016 lark-cli 安全存储按 Bot HOME 隔离

- 状态：已采用
- 决策：所有 lark-cli 子进程设置当前 Bot 专属 `HOME=state/bots/<bot-id>/lark-home`，使官方 lark-cli 的 OAuth 加密材料和 `keychain-downgrade` 的 `master.key.file` 落在 Bot 状态目录下。Agent sandbox 只放行当前 Bot 状态目录，不再允许真实用户全局 `~/Library/Application Support/lark-cli/`。
- 原因：源码确认 `LARKSUITE_CLI_CONFIG_DIR` 只能隔离 profile/config，macOS 安全存储路径由 HOME 和固定 service 名决定。继续使用全局目录会让多个 Bot 共享用户态 token 与 master key，破坏 Bot 维度治理。
- 后果：升级后需要为每个需要读取飞书资料的 Bot 重新完成用户态 OAuth；换取 OAuth、密钥、profile、会话和 Skill 授权在 Bot 维度一致隔离。
