# QuarkfanTools

QuarkfanTools 是运行在 macOS 上的本地飞书 Skill Agent。安装包内置 Electron、Claude Agent SDK、飞书 CLI，以及 Word、PowerPoint、Excel 基础 Skills；支持多个相互隔离、可独立启停的飞书机器人。

当前版本为 `1.8.1`。应用左下角显示当前版本，点击版本号可查看面向用户的更新记录。项目接续、需求、架构、运维和安全说明统一从 [`docs/AI.md`](docs/AI.md) 开始阅读。当前开发状态见 [`STATUS.md`](STATUS.md)，开发变更历史见 [`CHANGELOG.md`](CHANGELOG.md)。

## 核心能力

- 分别提供 Apple Silicon 与 Intel macOS 安装包。
- 支持配置多个飞书机器人，每个机器人使用独立凭据、HOME、状态与 Claude 工作区，并可在运行台独立启动和停止；事件进入 Runtime 后按被艾特 Bot 统一路由。
- 点击运行台中的机器人可查看其独立详细日志，并按信息、成功、警告或错误等级筛选。
- 每个机器人只能访问明确授权的 Skills；导入或同步的新 Skill 默认不授权，授权区支持搜索和对筛选结果批量操作。
- 使用内置 `lark-cli event +subscribe` NDJSON 长连接接收飞书事件，异常断线自动重连；多 Bot 同时运行时每个 Bot 维护自己的隔离订阅，并保留跨 Bot 路由保护。
- 收到消息后先在原消息上添加处理中表情，执行 Skill 并回复最终结果后移除表情。
- 私聊按机器人与会话保持 24 小时连续上下文；群聊额外按发送者隔离。发送 `/new`、`新对话` 或 `重置会话` 可清空上下文。
- 图片消息会自动下载并作为多模态输入交给模型；Skill 生成的图片或文件可通过内置 `lark-cli` 回复。
- Agent 默认可调用当前机器人隔离身份下的 `lark-cli`，用于读取飞书文档、Wiki、云盘及发送媒体消息。
- 内置 Word、Excel 和强制多模态视觉解析的 PowerPoint Skills，无需手动导入。
- 每个连续会话使用独立 workspace；存储管理页可查看占用并清理过期或全部会话数据，保留机器人配置、飞书授权和用户 Skills。
- 本地技能市场展示 Skill 来源和描述，可删除用户导入的 Skill；Git 市场可配置 HTTPS 仓库并由应用内置 Git 客户端同步，无需本机安装 Git。
- Office 文件由应用内置 ZIP/XML 解析器预处理；不要求用户安装 Office、Python、Node、LibreOffice 或其他命令行环境。
- PPT 视觉预览调用目标系统自带的 macOS Quick Look 服务，不依赖任何用户安装的软件。
- 日志记录飞书事件投递延迟和资源、Agent、飞书回复分段耗时，便于判断消息延迟来源。
- 支持 Bot 态或用户态接收与回复，并可针对单个机器人完成用户态 OAuth。
- 用户态 OAuth、lark-cli 本地密钥和加密凭据按 Bot 专属 HOME 隔离；升级后需要为每个读取飞书资料的 Bot 重新授权。
- 使用官方 `@anthropic-ai/claude-agent-sdk` 作为 Agent 运行内核。
- 自动发现用户导入、HTTPS Git 市场和安装包内置 Skills；同名时按用户、市场、内置顺序选择。
- Skill 可读取和更新自身目录下的 `knowledge/` 内容。
- GUI 提供按机器人启停、独立日志、Skill 授权、连接配置和会话存储管理；技能市场可按来源和未授权状态筛选。
- Bot 可配置 Owner；无法解决或需要人工授权时会向 Owner 私聊发送卡片，并将处理结果回复原提问人。
- 跨会话 Agent 按可配置并发上限运行，超出后排队，避免多人同时提问时无限争抢资源。
- 消息事件按 `event_id` 和 `message_id` 双重去重，状态和日志保存在本机。

## 使用

1. 打开 QuarkfanTools，进入“配置”。
2. 填写兼容 Claude Messages API 和工具调用的模型 Base URL、模型名与 API Key。
3. 按需点击“导入到本地 Skill 市场”，选择包含 `SKILL.md` 的文件夹；也可配置 HTTPS Git Skill 市场。
4. 新增一个或多个机器人，填写各自 App ID、App Secret、接收/回复身份，并明确勾选允许访问的 Skills。
5. 保存配置，进入运行台分别启动需要监听的机器人。

导入或同步 Skill 不会自动改变任何机器人的授权。用户态需要针对对应机器人在应用配置页额外完成飞书 OAuth 登录。Bot 态只需要正确配置应用凭据、事件订阅和必要权限。

## Skill 结构

```text
skills/
└── example-skill/
    ├── SKILL.md
    ├── knowledge/
    ├── references/
    └── scripts/
```

仓库中的魔介问答内容位于 `skills/moje-qa-assistant/`，仅供开发参考，不会打入安装包。

## 开发

```bash
npm install
npm test
npm run dev
```

`npm run dev` 使用 Vite 热更新。`npm start` 会先构建再启动 Electron；开发服务器不可用时，Electron 会自动加载本地构建页面。

分别生成 Intel 与 Apple Silicon 安装包：

```bash
npm run pack:mac
```

也可以只构建一个架构：

```bash
npm run pack:mac:arm64
npm run pack:mac:x64
```

输出位于 `release/arm64/` 和 `release/x64/`。

## 本机数据

开发模式下状态保存在项目的 `state/`；打包应用的数据保存在 `~/Library/Application Support/quarkfantools/`。点击“导入到本地 Skill 市场”后，所选文件夹会复制到 `workspace/skills/`，但不会默认授权给任何机器人。首次运行会自动迁移旧版 `~/Library/Application Support/qah/` 中的配置、Skills 和状态。

每个机器人使用独立目录：

```text
state/bots/<bot-id>/       # 飞书 CLI、消息去重、Claude 状态
workspace/bots/<bot-id>/
└── sessions/<hash>/       # 每个连续对话的隔离 workspace 与授权 Skills
```

更完整的配置、数据目录、故障排查与发布说明见 [`docs/operations.md`](docs/operations.md)。
