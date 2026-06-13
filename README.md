# QuarkfanTools

QuarkfanTools 是运行在 macOS 上的本地飞书 Skill Agent。安装包内置 Electron、Claude Agent SDK/Claude Code、飞书 CLI，以及 Word、PowerPoint、Excel 基础 Skills；支持多个相互隔离的飞书机器人。

项目接续、需求、架构、运维和安全说明统一从 [`docs/AI.md`](docs/AI.md) 开始阅读。当前开发状态见 [`STATUS.md`](STATUS.md)，版本历史见 [`CHANGELOG.md`](CHANGELOG.md)。

## 1.0 能力

- 支持 Apple Silicon 与 Intel macOS 通用安装包。
- 支持配置多个飞书机器人，每个机器人使用独立凭据、监听进程、状态与 Claude 工作区。
- 每个机器人可单独选择允许访问的 Skills，未授权 Skill 对该机器人不可见。
- 使用内置 `lark-cli event +subscribe` NDJSON 长连接接收飞书事件，异常断线自动重连。
- 收到消息后先在原消息上添加处理中表情，执行 Skill 并回复最终结果后移除表情。
- 私聊按机器人与会话保持 24 小时连续上下文；群聊额外按发送者隔离。发送 `/new`、`新对话` 或 `重置会话` 可清空上下文。
- 图片消息会自动下载并作为多模态输入交给模型；Skill 生成的图片或文件可通过内置 `lark-cli` 回复。
- Agent 默认可调用当前机器人隔离身份下的 `lark-cli`，用于读取飞书文档、Wiki、云盘及发送媒体消息。
- 内置 Word、Excel 和强制多模态视觉解析的 PowerPoint Skills，无需手动导入。
- 每个连续会话使用独立 workspace；存储管理页可查看占用并清理过期或全部会话数据，保留机器人配置、飞书授权和用户 Skills。
- 存储管理支持按会话勾选清理；Skill 市场可配置 HTTPS Git 仓库并由应用内置 Git 客户端同步，无需本机安装 Git。
- Office 文件由应用内置 ZIP/XML 解析器预处理；不要求用户安装 Office、Python、Node、LibreOffice 或其他命令行环境。
- PPT 视觉预览调用目标系统自带的 macOS Quick Look 服务，不依赖任何用户安装的软件。
- 日志记录飞书事件投递延迟，便于判断消息延迟发生在飞书侧还是本机处理侧。
- 支持 Bot 态或用户态接收与回复，并可针对单个机器人完成用户态 OAuth。
- 使用官方 `@anthropic-ai/claude-agent-sdk` 作为 Agent 运行内核。
- 自动发现 `skills/*/SKILL.md`，由 Claude 根据消息选择 Skill。
- Skill 可读取和更新自身目录下的 `knowledge/` 内容。
- GUI 提供运行状态、启停、日志、Skill 列表和连接配置。
- 消息事件去重，状态和日志保存在本机。

## 使用

1. 打开 QuarkfanTools，进入“配置”。
2. 填写兼容 Claude Messages API 和工具调用的模型 Base URL、模型名与 API Key。
3. 按需点击“导入 Skill 文件夹”，选择至少包含 `SKILL.md` 的文件夹，QuarkfanTools 会自动复制；也可配置 Skill 市场仓库。
4. 新增一个或多个机器人，填写各自 App ID、App Secret、接收/回复身份，并勾选允许访问的 Skills。
5. 保存配置并启动监听。

用户态需要针对对应机器人额外完成飞书 OAuth 登录。Bot 态只需要正确配置应用凭据、事件订阅和必要权限。

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
npm run build
npm test
npm run dev
```

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

开发模式下状态保存在项目的 `state/`；打包应用的数据保存在 `~/Library/Application Support/quarkfantools/`。点击“导入 Skill 文件夹”后，所选文件夹会复制到 `workspace/skills/`。首次运行会自动迁移旧版 `~/Library/Application Support/qah/` 中的配置、Skills 和状态。

每个机器人使用独立目录：

```text
state/bots/<bot-id>/       # 飞书 CLI、消息去重、Claude 状态
workspace/bots/<bot-id>/
└── sessions/<hash>/       # 每个连续对话的隔离 workspace 与授权 Skills
```

更完整的配置、数据目录、故障排查与发布说明见 [`docs/operations.md`](docs/operations.md)。
