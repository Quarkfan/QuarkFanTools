# 运行、排障与发布

## 1. 用户配置

首次使用需要：

1. 配置兼容 Claude Messages API 和工具调用的 Base URL、模型名和 API Key。
2. 新增飞书机器人，填写 App ID、App Secret 和收发身份。
3. 为机器人选择可访问的 Skills。
4. 需要搜索或读取飞书文档、Wiki、云盘或云 PPT 的机器人在应用配置页完成用户态 OAuth；Bot 态确认应用权限和事件订阅。
5. 启动监听。

多模态模型能力由模型配置中的开关控制。PowerPoint 视觉解析需要开启多模态。

## 2. Skill 来源

- **内置 Skills**：随安装包提供，无需导入。
- **本地 Skill 市场**：在 GUI 选择文件夹后复制到 `workspace/skills/`，默认不授权给任何机器人。
- **Skill 市场**：配置 HTTPS Git URL、分支和可选 Token，应用启动时同步到 `workspace/market-skills/`。

Skill 市场使用应用内置纯 JavaScript Git 客户端，只支持 HTTPS。拉取暂时失败时保留现有市场副本；仓库或分支改变时重新克隆。

“技能市场”页面展示全部 Skill 的来源和描述，并允许删除本地导入的 Skill。删除会停止当前监听并撤销所有机器人对该 Skill 名称的授权。Git 市场和应用内置 Skill 不能在列表中单独删除。

导入或同步后，需要进入机器人配置明确授权 Skills。新增 Skill 不会自动进入任何机器人的权限范围；Skill 较多时可搜索名称或描述，并对当前筛选结果批量授权或取消。技能市场页可按来源或“未授权给任何 Bot”筛选，并展示授权概览。

## 3. Owner 人工协作

机器人可配置 Owner 的飞书 `open_id`。Owner 必须有该应用的使用权限，Bot 才能向其发送私聊卡片。Agent 无法解决或需要人工授权时，会创建请求编号并私聊 Owner。

Owner 按卡片提示回复机器人：

```text
/owner <请求编号> 通过
/owner <请求编号> 拒绝
/owner <请求编号> 回复 <回复内容>
```

只有配置的 Owner 本人可处理请求。待处理请求保存在机器人独立状态目录，应用重启后仍然有效。

## 4. 本机数据与清理

打包应用数据位于：

```text
~/Library/Application Support/quarkfantools/
```

存储管理只面向会话相关数据。清理单个、过期或全部会话时，会删除对应 workspace、Claude 会话文件和跟踪的消息附件，但保留：

- 应用与机器人配置
- 飞书 OAuth 和 CLI 状态
- 用户导入 Skills
- Skill 市场配置

删除整个应用数据目录会同时删除上述保留信息，应只在明确需要完全重置时执行。

## 5. 常见排障

### Codex App 网络代理撤回

如果曾为排查 Codex `stream disconnected before completion` 而通过 `launchctl setenv` 固定
Codex App 走 Clash，本机网络恢复后应撤回这些环境变量并重启 Codex App。完整步骤见
[`codex-network-proxy-rollback.md`](codex-network-proxy-rollback.md)。

### 无法启动监听

- 检查机器人是否启用，以及 App ID、App Secret 是否完整。
- 检查 Claude 兼容模型的 Base URL、模型名和 API Key 是否完整。
- 检查日志中是否存在旧监听进程或飞书 CLI 错误。
- QuarkfanTools 只允许一个应用实例；重复打开时会聚焦已有窗口。
- 正常停止和退出应用都会等待监听进程结束；若应用或 CLI 异常退出，再次启动监听会验证并清理该机器人记录的旧订阅 PID。

### 用户态 OAuth 失败

- 应用应使用推荐权限发起 OAuth。
- 应用会额外申请 `search:docs:read`，用于用户态搜索飞书文档和云 PPT；旧授权需要重新点击用户态授权以补充该权限。
- 如需导出或预览云文档、云 PPT，可在 Bot 配置的“用户态 OAuth 额外权限”中填写额外 scope，例如 `drive:export:readonly`、`docs:document:export`。多个 scope 支持空格、逗号或换行分隔，保存后需要重新点击用户态 OAuth。
- 额外 scope 只影响用户态授权请求；对应权限仍必须先在飞书开放平台为该应用开通，否则授权或调用仍会失败。
- 用户态 OAuth 必须从 QuarkfanTools 配置页发起；不要让聊天用户在 Agent 会话内执行 `lark-cli auth login` 或扫码授权。
- 确认浏览器完成授权，并检查对应机器人的飞书 CLI 日志。

### 能回复消息但无法读取飞书文档或云 PPT

- 事件监听和消息回复可使用 Bot 态，但飞书文档搜索与读取固定使用用户态；先确认机器人已完成用户态 OAuth。
- 文档搜索报 `missing required scope(s): search:docs:read` 时，重新点击用户态授权。
- 导出或下载报 `missing required scope(s)` 时，把错误里列出的 scope 加入该 Bot 的“用户态 OAuth 额外权限”，确认飞书开放平台已开通后保存配置并重新授权。
- 如果回复提到 `lark-cli/locks/` 无法写入，说明旧版本 sandbox 误拦截了当前 Bot 的飞书 CLI 状态目录；升级到包含精确 Bot 目录隔离的版本。
- 如果回复提到 `~/Library/Application Support/lark-cli/`、`master.key.file`、授权令牌或全局配置文件被 sandbox 阻止，说明旧版本没有放行官方 lark-cli 的全局安全存储目录；升级到 `1.6.4` 或更高版本，并在应用配置页重新确认用户态 OAuth。
- macOS sandbox 内的 lark-cli 通过受控网络代理访问飞书；应用允许系统 trustd 完成 TLS 校验。若仍出现 `x509: OSStatus -26276`，确认正在运行包含该修复的新版本。
- 飞书云 PPT 属于 slides 文档，需要先用户态搜索，再使用 `drive +export --file-extension pptx` 导出；普通飞书文件才使用 `drive +download`。

### 消息长时间没有反应

- 查看日志中的飞书事件投递延迟。若接收时已经延迟，问题发生在飞书事件投递或连接侧。
- 若接收及时但处理慢，查看“Agent 工作过程”和“消息处理耗时”日志。工作过程记录工具调用、检索和重试阶段；耗时日志中的 Agent 段长通常表示模型服务响应慢、Skill 工具调用较多或达到最大 turns；飞书回复段长表示回复 API 或 CLI 慢。
- 运行台会显示运行中与排队任务数。多人同时提问时，超出“最大并发任务数”的消息会排队，避免无限并发拖慢所有回复。
- 模型侧配额不足会出现 `429`；Agent 工具调用跑满会出现 `Reached maximum number of turns`，两者都不是飞书事件投递延迟。
- 如果复杂 Skill 或飞书资料检索触发 turns 上限，可在配置页调高“单次 Agent 最大步数”。默认值为 60，允许范围为 10-100。
- 检查机器人事件订阅、权限和监听连接是否稳定。
- lark-cli 配置或密钥链状态丢失时，应用会自动重新初始化并执行官方 `keychain-downgrade`，让 Claude sandbox 内的 lark-cli 可读取凭据；若仍失败，检查运行台中的具体错误，不应让普通聊天用户在终端执行初始化命令。

### 日志出现 reaction not found handler

飞书可能在 Bot 长连接中额外投递表情创建或删除事件，尤其是应用添加、移除处理中表情时。当前 Runtime 只处理消息接收事件，因此旧版本 lark-cli 会输出 `im.message.reaction.created_v1` 或 `deleted_v1, not found handler`。这不代表消息处理失败；新版本会过滤这两类无害日志，同时保留其他飞书连接错误。

### 模型调用失败

- 确认服务兼容 Claude Messages API、工具调用和所配置模型名。
- 确认 Base URL 与 API Key 正确。
- 只有 OpenAI Responses 兼容并不足以运行当前 Claude Agent SDK 内核。

### Skill 未被使用

- 确认目录包含 `SKILL.md`。
- 确认 Skill 已被发现并授权给目标机器人。
- 同名 Skill 优先级为用户、市场、内置，检查是否被更高优先级版本覆盖。
- 如果多个本地目录的 `SKILL.md` 声明了同一个 `name`，技能市场会保留第一个声明名，并用后续目录名区分显示，例如 `moje-qa-assistant-adv`。
- 正在被 Bot 授权使用的本地 Skill 删除按钮会禁用；先到配置页取消对应 Bot 授权后再删除。

### 延后下载任务

- Agent 找到高度匹配但下载耗时的飞书文件时，会先回复基本答案和 `/continue <任务编号>`。
- 用户确认后任务进入该会话队列，继续等待下载、预览和分析；任务状态保存在对应 Bot 的 `deferred-tasks.json`。
- 当前仅支持这种用户确认后的延后任务，不支持 cron 或任意指定执行时间。
- 已下载消息附件和 Agent 会话 workspace 中的下载/生成文件会进入应用控制的内容哈希缓存；清理会话不会误删配置、授权或 Skills。

### 查看会话记录

- 存储管理中点击会话“查看”可看到 Claude session、最近对话记录和 workspace 文件清单。
- 新版本会保存最近 50 轮用户输入与机器人回复；旧版本产生的会话可能只有消息 ID，没有可回放文本。

## 6. 开发验证

```bash
npm install
npm test
npm run dev
```

`npm run dev` 使用 Vite 热更新；直接运行 `npm start` 或构建后运行 Electron 时，若 Vite 未启动，应用会自动加载本地构建页面。

`npm test` 会先构建，再运行编译后的 Node 测试。当前测试覆盖配置迁移、飞书事件文本/图片/文件解析、Office XML 提取、连续对话键、workspace 哈希，以及当前版本是否存在对应的应用内用户更新记录。

## 7. 打包发布

生成两个架构的 DMG 和 ZIP：

```bash
npm run pack:mac
```

单独构建：

```bash
npm run pack:mac:arm64
npm run pack:mac:x64
```

产物位于：

```text
release/arm64/
release/x64/
```

发布检查：

1. 按版本规则更新 `package.json`、`package-lock.json`、根 `CHANGELOG.md`、`electron/release-notes.ts`、`README.md`、`docs/AI.md` 和 `STATUS.md`。
2. 运行 `npm test`。
3. 运行 `npm run pack:mac`。
4. 在 arm64 与 x64 环境验证启动、配置、监听、消息、附件和清理流程。
5. 创建与版本一致的 Git tag。

当前没有配置代码签名和 Apple 公证，安装时可能出现系统安全提示。

### 版本号规则

版本号使用 `主版本.次版本.修订版本`：

- **主版本**：出现大的应用能力变更、核心使用方式变化或不兼容调整时升级，例如 `1.x.x` 到 `2.0.0`。
- **次版本**：新增用户能够明显感知的完整功能时升级，例如 `1.4.x` 到 `1.5.0`。
- **修订版本**：修复问题、优化体验或增加轻量小能力时升级，例如 `1.4.0` 到 `1.4.1`。

每次版本更新必须同步开发用根 `CHANGELOG.md` 和应用内面向用户的 `electron/release-notes.ts`。未完成打包验证时，`STATUS.md` 必须明确标记当前版本尚未生成安装包。

形成具体版本号并写入版本记录后，必须在同一轮执行 `npm run pack:mac`，生成并核对 arm64 与 x64 的 DMG 和 ZIP。尚未准备打包的变化必须继续保留在 `Unreleased`，不得提前建立正式版本记录。
