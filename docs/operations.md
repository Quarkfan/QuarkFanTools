# 运行、排障与发布

## 1. 用户配置

首次使用需要：

1. 配置兼容 Claude Messages API 和工具调用的 Base URL、模型名和 API Key。
2. 可选选择界面主题：跟随系统、浅色或深色。
3. 新增机器人，选择消息平台。飞书填写 App ID/App Secret；企业微信填写 Corp ID/Secret，并按企业微信 CLI 协议配置 Agent/Profile。
4. 为机器人选择可访问的 Skills。
5. 需要搜索或读取飞书文档、Wiki、云盘或云 PPT 的机器人在应用配置页完成用户态 OAuth；若消息入口是企业微信，需要先在 Bot 中启用飞书知识连接器。
6. 启动监听。

主题是应用级配置，不随 Bot 变化。跟随系统模式下，界面会跟随 macOS 当前浅色/深色外观自动切换。

多模态模型能力由模型配置中的开关控制。PowerPoint 视觉解析需要开启多模态。

每个 Bot 可配置“长任务提示秒数”和“长任务提示文案”。秒数为 `0` 时关闭；大于 `0` 时，单次消息处理超过该时间仍未结束，应用会自动先回复一次配置文案。该提示不替代最终答案，任务完成后仍会正常回复最终结果。

## 2. Skill 来源

- **内置 Skills**：随安装包提供，无需导入。
- **本地 Skill 市场**：在 GUI 选择文件夹后复制到 `workspace/skills/`，默认不授权给任何机器人。
- **Skill 市场**：配置 HTTPS Git URL、分支和可选 Token，应用启动时同步到 `workspace/market-skills/`。

Skill 市场使用应用内置纯 JavaScript Git 客户端，只支持 HTTPS。拉取暂时失败时保留现有市场副本；仓库或分支改变时重新克隆。

“技能市场”页面展示全部 Skill 的来源和描述，并允许删除本地导入的 Skill。删除会停止当前监听并撤销所有机器人对该 Skill 名称的授权。Git 市场和应用内置 Skill 不能在列表中单独删除。

导入或同步后，需要进入机器人配置明确授权 Skills。新增 Skill 不会自动进入任何机器人的权限范围；Skill 较多时可搜索名称或描述，并对当前筛选结果批量授权或取消。技能市场页可按来源或“未授权给任何 Bot”筛选，并展示授权概览。

## 2.1 套件、自定义应用与能力治理

“能力”页展示统一能力目录、已导入的套件和自定义应用。套件目录必须包含 `suite.json`，导入后复制到：

```text
~/Library/Application Support/quarkfantools/workspace/suites/<suite-id>/
```

套件用于按角色或行业组合 Skills、自定义应用、MCP 和工作流说明。当前版本支持导入、预览和 Bot 挂载授权；挂载套件不会自动替代底层 Skill、自定义应用或 MCP 的显式授权。

Skill、本地自定义应用和套件卡片都提供“打开目录”操作，用于在 Finder 中定位已发现资源目录。渲染层只传资源类型和 ID，目录解析由主进程重新发现资源后完成，不支持打开任意用户输入路径。

自定义应用目录必须包含 `app.json`，导入后复制到：

```text
~/Library/Application Support/quarkfantools/workspace/apps/<app-id>/
```

开发环境中对应仓库根目录下的 `apps/<app-id>/`。

`app.json` 至少需要声明 `id`、`name` 和 `entry`。`id` 只能包含小写字母、数字、短横线、下划线和点。导入自定义应用不会自动授权给任何 Bot；需要在 Bot 编辑弹窗中勾选“允许访问的自定义应用”。

当前 2.0.0 已接入命令路由：Bot 编辑弹窗中的“命令映射”可把 `/xxx` 绑定到已授权 Skill、已授权套件、已授权套件下派生的 Workflow，或绑定到已授权且声明 `commandCallable=true` 的自定义应用。命令名仅建议使用小写字母、数字、短横线和下划线；`/new`、`/continue`、`/owner` 为保留命令。

命令绑定支持可选 `Prompt 模板`。模板中的 `{{args}}` 会在收到命令时替换为实际参数，例如把 `/ppt 周报` 变成固定格式 prompt 再交给目标 Skill、套件上下文下的 Agent，或某个派生 Workflow。若绑定的是自定义应用，则模板结果会作为 `input` 传给应用入口。

Workflow 来自套件 `suite.json` 中的 `workflows`。未声明 `steps` 时，Workflow 按 `prompt` 作为强约束执行；声明 `steps` 时，当前支持 `prompt` 步骤和 `capability` 步骤。`capability` 步骤可调用已授权 Skill、套件或自定义应用，但不能递归调用 Workflow。

Workflow 执行过程会进入运行台日志。日志会记录每个步骤开始、完成或失败；定时任务触发的 Workflow 还会把步骤状态和短输出摘要写入 `state/bots/<bot-id>/scheduled-runs.jsonl` 的运行记录。

Bot 编辑弹窗中的“定时任务”当前支持：

- `interval`：按分钟间隔触发
- `daily`：按时区和时间点每日触发
- `weekly`：按时区、时间点和周几触发
- `cron`：按 5 段表达式触发，格式为 `分钟 小时 日 月 周`，支持 `*`、列表、范围和步进；例如 `15 9 * * 1-5` 表示工作日 09:15，`*/30 8-20 * * *` 表示每天 08:00 到 20:59 每 30 分钟

任务目标支持：

- `agent`：按当前 Bot 已授权 Skill 集合执行
- `command`：复用该 Bot 已启用命令
- `capability`：直接调用已授权 Skill、已授权套件、已授权套件下派生的 Workflow，或声明 `scheduledCallable=true` 的自定义应用

定时任务需要填写投递 `chat_id`。任务只在应用运行期间触发，并与普通消息共享并发上限。若目标能力的治理 policy 禁止定时调用，任务会在运行记录中明确失败原因。Bot 编辑弹窗支持对已保存且启用的任务点击“立即运行”，手动运行会进入同一运行历史，并保留原本已计算的下一次计划时间。

Bot 编辑弹窗中的任务区以列表展示任务摘要和操作；列表中可直接“立即执行”“编辑”“删除”，详细计划、目标和投递参数在任务编辑弹窗中配置。

“配置”页中的 MCP 服务当前支持：

- `stdio` 命令
- 参数列表
- 可选环境变量
- 可选超时
- `alwaysLoad` 开关

配置完成后，还需要在 Bot 编辑弹窗中勾选“允许访问的 MCP”。只有被授权的 MCP 才会进入该 Bot 的 Claude Agent SDK 上下文。

“能力”页会展示每个 MCP 的诊断状态：

- `OK`：服务已启用、命令可解析，并且至少授权给一个 Bot。
- `WARN`：配置可解析但存在治理提示，例如尚未授权给任何 Bot，或服务已停用。
- `ERROR`：命令无法解析、cwd 不存在或不可读、缺少启动命令，或存在不支持的传输类型。

页面初始加载只做轻量静态检查。点击“刷新 MCP 诊断”时，应用会对静态检查通过的 `stdio` MCP 做短生命周期协议探测：启动进程、发送 `initialize`、发送 `tools/list`、展示最多 20 个工具名，然后关闭进程。失败时卡片会展示协议错误、退出码、signal 和 stderr 尾部。该探测不会长期常驻 MCP 服务；HTTP/SSE 探测和持久化启动日志仍属于后续增强。

当 Bot 已挂载套件时，普通聊天和套件命令还会把该套件的说明、工作流，以及套件内已经被该 Bot 授权的 Skill、自定义应用、MCP 摘要注入 Agent 上下文，帮助模型在当前权限边界内决定使用哪组能力。

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

存储管理区分会话数据和文件缓存。清理单个、过期或全部会话时，会删除对应 workspace、Claude 会话文件和跟踪的消息附件，但保留：

- 应用与机器人配置
- 飞书 OAuth 和 CLI 状态
- 用户导入 Skills
- Skill 市场配置
- 应用级内容哈希文件缓存

文件缓存位于 `state/file-cache/<sha256>/`，用于复用飞书下载的大文件和 Agent 生成文件。缓存按内容哈希去重，metadata 记录关联 Bot。用户可在存储管理中单独清理文件缓存；清理后不删除会话记录，但后续需要相关文件时可能重新下载或生成。

飞书消息附件下载已支持下载前缓存命中：同一 Bot 再次处理相同消息资源 key 时，会优先从文件缓存复制到当前消息目录。Agent 需要下载飞书云盘文件或导出云文档时，应输出 `LARK_CACHED_FILE` 结构化请求交给主进程受控 helper。helper 会先按 Bot 和飞书文件标识查缓存，未命中时再用用户态 `lark-cli drive +download` 或 `drive +export` 获取文件，并把文件复制到当前会话目录后继续 Agent 分析。若 Agent 尝试通过 Bash 裸调 `lark-cli drive +download` 或 `drive +export`，Runtime 会中止该次执行并提示改用受控缓存协议。

存储管理会展示只读文件缓存索引。索引行展示来源类型、关联 Bot、文件名、大小和来源摘要，可按 Bot 或来源类型筛选。该列表用于确认缓存是否来自消息附件、云盘下载或云文档导出，不提供单条删除，也不会暴露全局缓存目录路径；需要清理时仍使用“清理文件缓存”一次性删除整个应用级缓存。

存储管理还会展示最近定时任务运行历史。该列表读取各 Bot 的 `state/bots/<bot-id>/scheduled-runs.jsonl`，展示任务、Bot、状态、开始时间、耗时和详情；Workflow 任务会在详情中包含步骤状态和短输出摘要，手动运行会在详情中标记“手动触发”。列表支持按 Bot 和状态筛选。会话清理和文件缓存清理不会删除这些运行历史。

删除整个应用数据目录会同时删除上述保留信息，应只在明确需要完全重置时执行。

## 5. 常见排障

### Codex App 网络代理撤回

如果曾为排查 Codex `stream disconnected before completion` 而通过 `launchctl setenv` 固定
Codex App 走 Clash，本机网络恢复后应撤回这些环境变量并重启 Codex App。完整步骤见
[`codex-network-proxy-rollback.md`](codex-network-proxy-rollback.md)。

### 无法启动监听

- 检查机器人是否启用，以及 App ID、App Secret 是否完整。
- 如果飞书 Bot 启动失败，检查是否已有另一个运行中的飞书 Bot 使用相同 App ID。同一飞书应用同一时间只能对应一个本地 Bot；多角色应放在同一个 Bot 下通过 Skill、命令或套件区分。
- 检查 Claude 兼容模型的 Base URL、模型名和 API Key 是否完整。
- 检查日志中是否存在旧监听进程或飞书 CLI 错误。
- `2.0.3` 起，点击运行台“启动”会立即写入本地启动日志，并记录“收到机器人启动请求”“正在确认飞书 Bot 身份”等阶段。如果仍没有任何新日志，优先检查前端事件或应用是否为最新版本；如果停在飞书 CLI 配置、初始化或密钥降级阶段，短命令 30 秒后会显示明确超时错误。
- 如果升级后出现 `invalid_client` 或 `The auth method is not supported`，确认正在运行 `2.0.3` 或更高版本。新版本凭据 marker 已加入 per-Bot HOME 版本，会重新初始化 Bot 态配置；需要读取飞书资料的用户态 OAuth 仍需在每个 Bot 配置页重新授权。
- QuarkfanTools 只允许一个应用实例；重复打开时会聚焦已有窗口。
- 正常停止和退出应用都会等待监听进程结束；若应用或 CLI 异常退出，再次启动监听会验证并清理该机器人记录的旧订阅 PID。

### 多飞书 Bot 群聊艾特路由异常

- 当前未发布变更已同步 `v1.6.17` 结构：QuarkfanTools 为每个运行中的飞书 Bot 启动一个使用该 Bot 专属 HOME/profile 的隔离事件订阅。`v2.0.3` 同步的单共享入口方案在部分 Intel 客户环境下会只覆盖后启动 Bot 所属飞书应用，导致先启动 Bot 收不到自身事件；新结构保证每个飞书应用至少通过自己的订阅接收事件。
- 官方 `lark-cli event +subscribe --force` 帮助提示多个订阅会被服务端随机拆分事件；QuarkfanTools 不使用 `--force`，并通过 per-Bot HOME/profile 分离本地单实例锁。若飞书服务端仍把一个 Bot 的事件投递到另一个 Bot 的连接，Runtime 会继续按 mention 目标跨 Bot 路由，后续回复、表情、附件下载和 Agent 执行仍使用目标 Bot 自己的隔离凭据。企业微信事件桥不受飞书订阅结构影响。
- 配置里的 `cli_...` 是飞书开放平台应用 App ID，用于初始化对应 Bot 的 lark-cli profile。
- 运行时会记录 `/open-apis/bot/v3/info` 返回的 `bot.open_id` 和应用名。群聊消息有 `message.mentions` 时，应用会先用 mention 目标里的名称、App ID、应用名和 open_id 等值匹配当前 Bot；`mentions[].id.open_id` 只作为命中信号，不作为排他条件，因为现场事件中它可能不同于 bot info 的 `bot.open_id`。
- 事件头里的 App ID 表示当前监听连接所属应用，不一定是消息中被 @ 的目标。有 `mentions` 时不要用 `sourceAppId` 判定目标 Bot；它只用于缺少 mention 元数据的旧事件兜底。
- lark-cli WebSocket 日志里可能出现 `aid=552564` 之类参数。该值来自飞书服务端返回的 WebSocket endpoint URL，是飞书事件网关或 SDK 连接层参数，不是配置的 App ID，也不能用于判断两个机器人是否接入了同一个飞书应用。
- 本地 POC 确认：两个不同 `cli_...` 应用同时监听时，WebSocket URL 中可以出现相同 `aid`；但 `/open-apis/bot/v3/info` 返回的 `open_id` 和应用名不同。因此排查多 Bot 路由时，应看脱敏 App ID、bot info 的 `open_id` 和应用名、事件 `mentions` 里的目标值，以及“已忽略非当前机器人艾特消息”的判定原因。
- 多飞书 Bot 同时运行时，如果群聊事件缺少 `mentions` 元数据，应用会记录 `missing-group-mention-metadata` 并忽略该消息，避免多个 Bot 同时回复。出现这种日志时，需要确认飞书事件是否为原始消息事件、机器人是否被真正 @、以及 lark-cli 输出没有开启会丢失 mention 的紧凑模式。

### 群成员看到“需要机器人主人的允许”

- 这类提示通常由飞书平台在消息投递到 QuarkfanTools 之前生成。运行台如果没有对应的“收到飞书消息”，说明本地监听、路由和 Agent 都没有处理该消息。
- 用户态 OAuth 只授权当前用户用于搜索、读取或导出飞书资料，不会改变飞书 Bot 面向群成员的使用权限。重新 OAuth 后“谁先说话谁可用”的现象，通常表示当前应用仍处于测试、未发布或可用范围只包含少数用户。
- 到飞书开放平台检查该应用是否已发布、机器人能力是否启用、应用可用范围是否包含整个目标组织/部门/群成员。客户现场至少要把所有会在群里 @ 机器人的成员纳入应用可用范围。
- 排查时让 A 和 B 分别 @ 同一个机器人：若 A 的消息有“收到飞书消息”而 B 没有，且 B 看到权限提示，应优先修正飞书开放平台可用范围，而不是重做用户态 OAuth。

### 用户态 OAuth 失败

- 应用应使用推荐权限发起 OAuth。
- `2.0.3` 起，用户态 OAuth 存在每个 Bot 专属 HOME 下，不再读取旧的 macOS 用户全局 lark-cli 授权。升级后需要在每个需要读取飞书资料的 Bot 配置页重新点击用户态授权。
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
- 如果回复提到 `master.key.file`、授权令牌或 lark-cli 安全存储被 sandbox 阻止，确认正在运行 `2.0.3` 或更高版本，并在对应 Bot 配置页重新完成用户态 OAuth；新版本只应访问 `state/bots/<bot-id>/lark-home/Library/Application Support/lark-cli/`。
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

### 命令未生效

- 确认消息以 `/命令名` 开头，且未使用保留命令 `/new`、`/continue`、`/owner`。
- 到 Bot 编辑弹窗确认该命令仍处于启用状态。
- 如果目标是 Skill，确认该 Skill 仍被该 Bot 授权。
- 如果目标是自定义应用，确认该应用仍被该 Bot 授权，并在 `app.json` 中声明了 `capabilities.commandCallable = true`。
- 如果目标是套件，确认该套件仍被该 Bot 授权；命令本身不会自动补齐底层 Skill、自定义应用或 MCP 授权。
- 命令名中包含空格或其他非法字符时，保存配置会被归一化过滤；字母会统一转成小写。

### 定时任务未触发

- 确认应用当时处于运行状态；当前版本不提供后台常驻调度服务。
- 确认该 Bot 已启用，且模型 Base URL、模型名、API Key 完整。
- 手动“立即运行”只支持已保存且启用的任务；修改表单后需先保存 Bot 配置。
- 确认任务的 `chat_id` 有效，且对应身份可向该会话发消息。
- `command` 目标要求对应命令已启用；`capability` 目标要求底层 Skill 或自定义应用仍然授权有效。
- 周计划的 `weekdays` 使用 `0-6`，其中 `0=周日`。
- Cron 表达式必须是 5 段数字表达式，支持 `*`、逗号列表、范围和步进；周字段支持 `0` 或 `7` 表示周日。当前不支持秒级、`L/W/#`、英文月份或英文星期。

### MCP 未生效

- 确认 MCP 服务在“配置”页处于启用状态，且命令、参数有效。
- 确认该 Bot 已勾选“允许访问的 MCP”。
- 查看“能力”页 MCP 卡片的 OK/WARN/ERROR 诊断，优先处理命令无法解析、cwd 不可读或环境变量缺值。
- 点击“刷新 MCP 诊断”执行协议探测；若握手或 `tools/list` 失败，按卡片中的协议错误、退出码和 stderr 尾部处理 MCP 服务启动参数、环境变量或协议兼容问题。
- 当前版本使用严格 MCP 配置，不会自动读取项目目录或用户目录中的 `.mcp.json`。
- 如果 MCP 进程依赖环境变量，确认已在 MCP 配置中显式填写。

### 延后下载任务

- Agent 找到高度匹配但下载耗时的飞书文件时，会先回复基本答案和 `/continue <任务编号>`。
- 用户确认后任务进入该会话队列，继续等待下载、预览和分析；任务状态保存在对应 Bot 的 `deferred-tasks.json`。
- 延后下载任务仍只支持用户确认后立即继续；它不复用 Bot 定时任务的 cron 计划，也不支持把单个延后下载任务预约到任意时间。
- 已下载消息附件和 Agent 会话 workspace 中的下载/生成文件会进入应用控制的内容哈希缓存；清理会话不会误删配置、授权或 Skills。

### 查看会话记录

- 存储管理中点击会话“查看”可看到 Claude session、消息明细时间线和 workspace 文件清单。
- 新版本会保存最近 50 轮 transcript，并在每轮内区分接收消息、资源准备、Agent 可观察工作过程、长任务自动提示、最终回复和错误事件；旧版本产生的会话可能只有消息 ID 或用户/机器人两段文本，界面会降级展示。
- 消息明细中的“Agent 工作过程”只来自运行时可观察进度和工具阶段日志，不展示模型私有推理内容。

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
## 2.1 多 IM 平台、连接器与投递路由

Bot 的“消息平台”只决定从哪里接收消息和默认回复到哪里。飞书知识库和跨平台投递通过独立配置完成：

- 飞书 Bot：主平台配置即可同时承担消息入口、回复和飞书资料能力。
- 企业微信 Bot：主平台使用企业微信 CLI；如需读取飞书知识库、云盘或云 PPT，需要在“飞书知识连接器”里配置飞书 App ID/App Secret 和 OAuth scope。
- 结果投递路由：最终回复先回到原消息平台；启用 route 后，会把同一份最终回复复制发送到指定平台 chat。跨平台投递要求对应 connector 可用。

企业微信首版参考官方 `WecomTeam/wecom-cli` 命令形态：`wecom-cli <category> <method> '<json_args>'`。当前使用 `msg send_message` 发送文本，使用 `msg get_msg_media` 获取消息媒体。官方 CLI 本身是调用型工具，不提供飞书式事件长连接；如需启动企业微信 Bot 监听，需要在 Bot 编辑弹窗的“企业微信事件桥命令”中配置一个输出规范化 NDJSON 的本地事件桥。后续可替换为内置企业微信回调或轮询服务。

安装包会携带官方 `@wecom/cli` 的 macOS universal runtime，位置为 `resources/runtime/wecom-cli/bin/wecom-cli`。开发和打包准备由 `npm run pack:prepare` 完成：它会从 `logo.png` 生成 macOS app icon，并同时准备 universal `lark-cli`、universal `wecom-cli` 和 arm64/x64 Claude runtime。

Agent 会话 workspace 会自动生成 `CLAUDE.md`、`.quarkfan/cli-channels.json` 和 `qft-cli` wrapper。Agent 应通过 `./qft-cli lark ...` 或 `./qft-cli wecom ...` 调用平台能力，wrapper 会按 Bot 当前 channel manifest 注入隔离环境并拒绝登录、初始化等凭据命令。
