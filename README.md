# QuarkfanTools

QuarkfanTools 是运行在 macOS 上的本地飞书 Skill Agent。安装包内置 Electron、Claude Agent SDK/Claude Code 和飞书 CLI；使用者只需配置飞书应用、模型连接，并放入 Skill 即可运行。安装后默认不包含任何 Skill。

## 首版能力

- 支持 Apple Silicon 与 Intel macOS 通用安装包。
- 使用内置 `lark-cli event +subscribe` 长连接接收飞书事件。
- 支持 Bot 态或用户态接收与回复。
- 使用官方 `@anthropic-ai/claude-agent-sdk` 作为 Agent 运行内核。
- 自动发现 `skills/*/SKILL.md`，由 Claude 根据消息选择 Skill。
- Skill 可读取和更新自身目录下的 `knowledge/` 内容。
- GUI 提供运行状态、启停、日志、Skill 列表和连接配置。
- 消息事件去重，状态和日志保存在本机。

## 使用

1. 打开 QuarkfanTools，进入“配置”。
2. 填写飞书 App ID、App Secret、接收/回复身份。
3. 填写兼容 Claude Messages API 和工具调用的模型 Base URL、模型名与 API Key。
4. 点击“打开 Skills”，将 Skill 文件夹放入该目录。每个 Skill 至少包含 `SKILL.md`。
5. 保存配置并启动监听。

用户态需要额外完成飞书 OAuth 登录。Bot 态只需要正确配置应用凭据、事件订阅和必要权限。

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

开发模式下状态保存在项目的 `state/`；打包应用的可编辑 Skills、配置、Claude 状态与日志保存在 `~/Library/Application Support/quarkfantools/`。打包应用启动时会创建空的 `workspace/skills/`，点击“打开 Skills”可直接打开该目录。首次运行会自动迁移旧版 `~/Library/Application Support/qah/` 中的配置、Skills 和状态。
