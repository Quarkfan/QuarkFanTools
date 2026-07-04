# 运行、排障与发布

## 0. 远端授权门禁

- 应用启动后、窗口创建前会请求远端授权文本，只有内容明确包含 `Auth=open` 才继续启动。
- 如果远端返回 `Auth=close`、响应不包含有效 `Auth=` 字段或 HTTP 状态异常，应用会提示“授权未开放”并退出。
- 如果是超时、DNS、断网等网络不可达，不会立即关闭。应用会在 `state/auth-gate.json` 记录首次不可达时间、最近不可达时间和不可达次数；从第一次不可达开始，连续 90 天以上且累计 200 次以上检测都不可达时，才视为未授权并退出。
- 应用运行中会按 10-30 分钟随机间隔复检同一地址；复检得到 `Auth=open` 时会重置网络不可达累计，复检得到 `Auth=close` 或不可达累计达到阈值时会停止 Runtime 并退出。
- 排查启动后立即退出时，先检查远端文件内容是否仍为 `Auth=open`；如果是长期离线环境，再检查 `state/auth-gate.json` 中的不可达累计。

## 1. 用户配置

首次使用需要：

1. 在配置页的 “MODEL PROVIDER” 中配置一个或多个兼容 Claude Messages API 和工具调用的 Provider。每个 Provider 需要填写 Base URL、模型名和 API Key，并可单独启停和声明是否支持多模态。
2. 在 “系统设置” 中选择 MODEL PROVIDER 使用策略：轮流或随机；如需高可用，可开启“失败切换”，当前命中的 Provider 调用失败后会尝试下一个完整 Provider。
3. 可选选择界面主题：跟随系统、浅色或深色。
4. 新增机器人，选择消息平台。当前正式开放飞书，填写 App ID/App Secret；企业微信因官方能力限制暂时封闭，历史配置会保留但不能启动监听、轮询或投递。
5. 为机器人选择可访问的 Skills。
6. 需要搜索或读取飞书文档、Wiki、云盘或云 PPT 的机器人在应用配置页完成用户态 OAuth。
7. 启动监听。

主题是应用级配置，不随 Bot 变化。跟随系统模式下，界面会跟随 macOS 当前浅色/深色外观自动切换。

多模态模型能力由每个 MODEL PROVIDER 自己的开关控制。PowerPoint 视觉解析和截图识别只会使用已启用、配置完整且开启多模态的 Provider。

每个 Bot 可配置“长任务提示秒数”和“长任务提示文案”。秒数为 `0` 时关闭；大于 `0` 时，单次消息处理超过该时间仍未结束，应用会自动先回复一次配置文案。该提示不替代最终答案，任务完成后仍会正常回复最终结果。

每个飞书 Bot 可配置“历史补处理 Beta 上限”，默认 50，范围 1-500。运行台中正在运行的飞书 Bot 会显示“补处理历史 Beta”按钮，用于断网或长连接中断恢复后手动拉取该 Bot 已记录 chat 游标之后的历史消息。补处理只处理已有游标的 chat，不会扫描 Bot 从未看见过的会话；拉取到的消息仍会经过 mention 路由、Beta 职责判断、去重和原有任务队列。该能力依赖飞书历史消息接口和现场权限，当前仍按 Beta 使用。

## 2. Skill 来源

- **内置 Skills**：随安装包提供，无需导入。
- **本地 Skill 市场**：在 GUI 选择文件夹后复制到 `workspace/skills/`，默认不授权给任何机器人。
- **Skill 市场**：配置 HTTPS Git URL、分支和可选 Token，应用启动时同步到 `workspace/market-skills/`。

Skill 市场使用应用内置纯 JavaScript Git 客户端，只支持 HTTPS。拉取暂时失败时保留现有市场副本；仓库或分支改变时重新克隆。

“技能市场”页面展示全部 Skill 的来源和描述，并允许删除本地导入的 Skill。删除会停止当前监听并撤销所有机器人对该 Skill 名称的授权。Git 市场和应用内置 Skill 不能在列表中单独删除。

导入本地 Skill 时，如果目标目录或 `SKILL.md` frontmatter `name` 与已有本地 Skill 冲突，应用会弹出冲突处理选择：“以新的为准”覆盖现有受管目录，“以旧的为准”保留现有版本，“自己编辑”会打开新旧 `SKILL.md`，用户手动调整后可重新导入。

导入或同步后，需要进入机器人配置明确授权 Skills。新增 Skill 不会自动进入任何机器人的权限范围；Skill 较多时可搜索名称或描述，并对当前筛选结果批量授权或取消。技能市场页可按来源或“未授权给任何 Bot”筛选，并展示授权概览。

## 2.1 套件、自定义应用与能力治理

“能力”页展示统一能力目录、已导入的套件和自定义应用。套件目录必须包含 `suite.json`，导入后复制到：

```text
~/Library/Application Support/quarkfantools/workspace/suites/<suite-id>/
```

套件用于按角色或行业组合 Skills、自定义应用、MCP 和工作流说明。当前版本支持导入、预览、Bot 挂载授权、版本/发布者/可信来源/标签展示、同 ID 升级和卸载；挂载套件不会自动替代底层 Skill、自定义应用或 MCP 的显式授权。套件卸载前会检查 Bot 授权、命令和定时任务引用。

能力页的“扩展治理”面板会集中展示自定义应用、套件和 Workflow 的治理诊断：

- 自定义应用：展示入口类型、网络权限、文件系统权限、Owner 审批声明和可调用能力声明带来的风险。
- 桌面自动化自定义应用：如果 manifest 声明 `desktopAutomation`，能力页会把屏幕录制、辅助功能、剪贴板和键盘输入标记为高风险；当前 PoC 阶段 `autoSend=true` 会作为阻断错误。
- 套件：展示缺失的 Skill、自定义应用或 MCP 依赖、来源可信提示和 Workflow manifest 问题。
- Workflow：展示步骤 capability 引用缺失。

导入资源不等于授权给 Bot。授权前应先处理扩展治理中的 `ERROR` 和 `WARN` 项；高风险自定义应用只应授权给明确可信的 Bot，并结合 Owner 审批策略使用。

Bot 编辑弹窗可为 MCP、自定义应用和套件授权行配置运行策略：`Agent + 命令 + 定时`、`仅 Agent`、`Agent + 命令`、`Agent + 定时`、`使用前 Owner 审批` 或 `已授权但禁用运行`。策略会写入 `capabilityRefs[].policy`，保存 Bot 配置时不会被默认值覆盖。

当 Bot capability policy 设置 `requireOwnerApproval=true`，或自定义应用 `app.json` 声明 `permissions.requiresOwnerApproval=true` 时，命令调用会先私聊 Owner 创建审批请求，不会直接执行目标能力。定时任务命中该策略时会失败并在运行历史中记录“需要 Owner 审批”，同时向任务投递 chat 发送失败告警，避免无人值守任务绕过审批边界。

能力页的“Bot Governance Console”会按 Bot 展示授权引用、policy、命令数量、定时任务数量和最近能力审计统计；“Capability Usage Audit”会展示最近命令、定时任务和 Owner 审批阻断记录。审计文件位于 `state/bots/<bot-id>/capability-audit.jsonl`，只读用于治理排障，不作为授权来源。

能力页的 “IM / CONNECTORS” 面板会按 Bot 检查消息平台、企业微信封闭状态、飞书知识连接器、投递路由和钉钉占位状态。它用于在真实端到端验证前发现常见配置缺口，例如飞书资料连接器未配置、投递路由未填写 `chat_id`，或旧企业微信 Bot 仍停留在封闭 Provider 上。

Skill、本地自定义应用和套件卡片都提供“打开目录”操作，用于在 Finder 中定位已发现资源目录。渲染层只传资源类型和 ID，目录解析由主进程重新发现资源后完成，不支持打开任意用户输入路径。

自定义应用目录必须包含 `app.json`，导入后复制到：

```text
~/Library/Application Support/quarkfantools/workspace/apps/<app-id>/
```

开发环境中对应仓库根目录下的 `apps/<app-id>/`。

`app.json` 至少需要声明 `id`、`name` 和 `entry`。`id` 只能包含小写字母、数字、短横线、下划线和点。导入自定义应用不会自动授权给任何 Bot；需要在 Bot 编辑弹窗中勾选“允许访问的自定义应用”。当前 `node` 和受控 `executable` 入口可执行；`webview`、`mcp-adapter` 和 `workflow` 会在能力页和 Bot 授权区显示建设中，不会出现在命令或定时任务目标中。能力页会展示自定义应用生命周期状态、manifest 诊断和权限提示；同 ID 新版本可通过“升级”替换本机受管目录并保留首次安装时间。卸载前必须确认没有 Bot 授权引用，也没有套件依赖该应用。

微信桌面辅助 Agent 仅作为自定义应用 PoC 存在，内置模板位于 `builtin-apps/wechat-draft-assistant/`。该模板会尝试激活微信，读取微信窗口边界，截取当前微信窗口，并通过本地初筛和已配置多模态模型识别可见未读；识别到多个可见未读候选时，当前会按视觉模型返回顺序读取最多 5 个会话，每个会话只抽取打开后当前窗口可见消息。提供草稿时才会把草稿写入系统剪贴板。它不会搜索联系人、粘贴输入框或点击发送。测试前需要用户在 macOS 系统设置中授予 QuarkfanTools 辅助功能权限和屏幕录制权限，并在配置页填写支持视觉输入的 Claude / Anthropic 兼容模型。首版仍应停在可见未读读取和草稿模式，由用户手动确认会话、粘贴和发送。

能力页的自定义应用卡片点击后会打开应用详情弹窗，弹窗内按当前应用提供“回复后处理”。每个应用默认原样返回输出；选择“交给大模型总结后返回”时，主进程会按系统设置中的 MODEL PROVIDER 策略选择当前可用模型，对该应用最终回复做一次无工具文本总结。该总结不会把 API Key 传给自定义应用脚本。适合只让微信多会话读取这类高噪声应用整理为更短回复，同时让其他应用保留完整原始输出。旧版全局 `runtime.customAppReplyProcessing` 只作为兼容兜底，新配置应写入 `runtime.customAppReplyProcessingByApp[appId]`。

自定义应用需要把处理结果联动投递到飞书群等目标时，应先在 Bot 编辑弹窗配置并启用“结果投递路由”，然后让自定义应用 stdout 返回受控 `deliveries` 请求。例如：

```json
{
  "ok": true,
  "reply": "已读取 2 个未读会话，摘要如下...",
  "deliveries": [
    {
      "routeId": "ops-group",
      "useReply": true,
      "label": "运维群"
    }
  ]
}
```

`routeId` 必须等于当前 Bot 已启用投递路由的 ID。未显式提供 `text` 且 `useReply` 不为 `false` 时，应用会把回复后处理完成后的最终文本投递到该路由；提供 `text` 时则投递指定文本。自定义应用输入上下文只会看到可用路由摘要，不会拿到 `chat_id`、App Secret、OAuth 状态或任意发送接口。

安装包内置模板位于 `builtin-apps/` 和 `builtin-suites/`，打包后放在 `resources/builtin-apps` 与 `resources/builtin-suites`。能力页会把这些资源标记为“内置模板”，展示在自定义应用和套件列表中，但不会提供卸载或升级入口。用户需要改造模板时，应复制目录后再作为本地自定义应用或本地套件导入；内置模板本身用于学习 manifest、Workflow 和命令/定时调用结构。

点击能力页的自定义应用或套件卡片会打开说明与 Manifest 编辑器。本地导入的自定义应用可直接编辑并保存 `app.json`；本地导入的套件可直接编辑并保存 `suite.json`。保存时主进程会先写入并重新解析 manifest：如果 JSON 语法错误、入口缺失、权限字段非法、Workflow 步骤重复或存在阻断诊断，会恢复保存前文件并把错误反馈给 UI。编辑现有资源时不能修改 `id`；需要新 ID 时应复制模板或重新导入。内置模板不能直接编辑，必须在弹窗里填写新的本地 ID 并点击复制，生成本地副本后再保存。

当前已接入命令路由：Bot 编辑弹窗中的“命令映射”可新增 `/xxx` 并绑定到已授权 Skill、已授权 stdio MCP、已授权套件、已授权套件下派生的 Workflow，或绑定到已授权且声明 `commandCallable=true` 的可执行自定义应用。命令支持配置别名，命令名和别名仅建议使用小写字母、数字、短横线和下划线；`/new`、`/continue`、`/owner`、`/help` 为保留命令。用户发送 `/help` 时，应用会自动列出当前 Bot 已启用命令、别名和说明。命令映射区会提示保留命令或命令名/别名冲突。

命令绑定支持可选 `Prompt 模板`。模板中的 `{{args}}` 会在收到命令时替换为实际参数，例如把 `/ppt 周报` 变成固定格式 prompt 再交给目标 Skill、目标 MCP、套件上下文下的 Agent，或某个派生 Workflow。若绑定的是自定义应用，则模板结果会作为 `input` 传给应用入口。

Workflow 来自套件 `suite.json` 中的 `workflows`。未声明 `steps` 时，Workflow 按 `prompt` 作为强约束执行；声明 `steps` 时，当前支持 `prompt` 步骤和 `capability` 步骤。`capability` 步骤可调用已授权 Skill、MCP、套件或自定义应用，但不能递归调用 Workflow。

Workflow step 可选字段：

- `input`：步骤输入模板，支持 `{{input}}`、`{{previous}}`、`{{workflowPrompt}}`、`{{stepPrompt}}`、`{{steps.<stepId>}}` 和 `{{variables.<key>}}`。
- `condition`：步骤执行条件，支持 `if` 模板与 `equals`、`includes`、`matches`、`not` 判断；不满足时写入 skipped 事件。
- `repeat.maxTimes` / `repeat.until`：步骤循环上限和提前结束条件。
- `continueOnError`：步骤重试耗尽后允许 Workflow 继续执行。
- `timeoutSeconds`：单步超时秒数，超过后该尝试失败。
- `retry.maxAttempts`：单步最大尝试次数，适合包裹偶发失败的自定义应用或外部能力。

Workflow 执行过程会进入运行台日志。日志会记录每个步骤开始、完成、失败、跳过和重试尝试次数；定时任务触发的 Workflow 还会把步骤状态、尝试次数和短输出摘要写入 `state/bots/<bot-id>/scheduled-runs.jsonl` 的运行记录。

Bot 编辑弹窗中的“定时任务”当前支持：

- `interval`：按分钟间隔触发
- `daily`：按时区和时间点每日触发
- `weekly`：按时区、时间点和周几触发
- `cron`：按 5 段表达式触发，格式为 `分钟 小时 日 月 周`，支持 `*`、列表、范围和步进；例如 `15 9 * * 1-5` 表示工作日 09:15，`*/30 8-20 * * *` 表示每天 08:00 到 20:59 每 30 分钟

任务目标支持：

- `agent`：按当前 Bot 已授权 Skill 集合执行
- `command`：复用该 Bot 已启用命令
- `capability`：直接调用已授权 Skill、stdio MCP、套件、已授权套件下派生的 Workflow，或声明 `scheduledCallable=true` 且入口可执行的自定义应用

定时任务需要填写投递 `chat_id`。优先填写真实会话 ID，例如飞书群 `oc_xxx`；为兼容旧配置，运行时也会把已启用的结果投递路由 ID/名称解析为该路由的真实 `chat_id` 和 provider，但不要把未填写目标的空路由 ID 当作投递目标。任务只在应用运行期间触发，并与普通消息共享并发上限；如果应用启动后发现持久化的 `nextRunAt` 已到期，会保留该到期时间并在本次运行中尽快触发一次，而不是直接跳到下一次未来计划。若目标能力的治理 policy 禁止定时调用，任务会在运行记录中明确失败原因，并向投递 `chat_id` 发送失败告警。Bot 编辑弹窗支持对已保存且启用的任务点击“立即运行”，手动运行会进入同一运行历史，并保留原本已计算的下一次计划时间。

任务编辑弹窗中的“治理”区可配置失败重试。最大重试次数为 `0` 时不立即重试；大于 `0` 时，计划触发失败会按“重试延迟分钟”设置下一次 `retryAt`，并优先于原计划触发。连续失败超过上限后任务会写入暂停原因并停止自动排期，列表和任务编辑弹窗会显示该原因。手动立即执行不消耗重试次数；手动或计划执行成功会清空连续失败状态。

任务定义与运行态分开持久化：用户编辑的 schedule、target、delivery、retry 等定义字段保存在配置文件；`lastRunAt`、`nextRunAt`、`lastStatus`、`failureCount`、`retryAt` 和 `pausedReason` 保存在 `state/bots/<bot-id>/scheduled-tasks.json`。升级时可读取旧版完整任务数组状态文件，但只合并运行态字段，避免旧状态覆盖当前任务定义。

Bot 编辑弹窗中的任务区以列表展示任务摘要和操作；列表中可直接“状态/日志”“立即执行”“编辑”“删除”，详细计划、目标和投递参数在任务编辑弹窗中配置。任务编辑弹窗底部也提供“立即执行已保存任务”，方便用户编辑后就近触发；新增草稿或未保存修改需要先保存。“状态/日志”弹窗会展示当前启用状态、计划、目标、投递、上次执行、下次执行、失败计数、重试时间、暂停原因、Prompt 和最近几条运行详情，并提供同一个立即执行入口。

“配置”页中的 MCP 服务当前支持：

- `stdio` 命令
- HTTP / SSE URL 占位配置
- 参数列表
- 可选环境变量
- 可选超时
- `alwaysLoad` 开关

配置完成后，还需要在 Bot 编辑弹窗中勾选“允许访问的 MCP”，并通过同一行的策略下拉决定是否开放给 Agent、命令和定时任务。只有被授权、已启用且传输类型为 `stdio` 的 MCP 才会进入该 Bot 的 Claude Agent SDK 上下文；当前只有 `stdio` MCP 可以作为命令映射或定时任务 capability 的直接目标。HTTP / SSE 现在只用于提前保存服务地址和治理诊断，不会注入运行时。

应用还内置一个默认 Playwright MCP，不在配置页展示，也不需要单独授权。它让 Agent 默认拥有网页访问和验证能力，包括打开页面、点击、填写表单、读取页面结构、查看网络请求和截图。运行时使用隔离的 headless Chrome，会话文件写入当前 workspace 的 `.playwright/`，不会复用用户日常浏览器登录态。当前实现采用 Chrome channel；如果目标机器没有可用 Chrome，相关 `browser_*` 工具会启动失败，后续若要完全自包含浏览器，需要在发布包中额外捆绑 Playwright Chromium。

“能力”页会展示每个 MCP 的诊断状态：

- `OK`：服务已启用、命令可解析，并且至少授权给一个 Bot。
- `WARN`：配置可解析但存在治理提示，例如尚未授权给任何 Bot，或服务已停用。
- `ERROR`：命令无法解析、cwd 不存在或不可读、缺少启动命令，或 HTTP / SSE 未填写 URL。

页面初始加载只做轻量静态检查。点击“刷新 MCP 诊断”时，应用会对静态检查通过的 `stdio` MCP 做短生命周期协议探测：启动进程、发送 `initialize`、发送 `tools/list`、展示最多 20 个工具名，然后关闭进程。失败时卡片会展示协议错误、退出码、signal 和 stderr 尾部。每次探测摘要会追加到 `state/mcp-diagnostics.jsonl`，页面静态诊断会展示最近一次探测结果，方便重启应用后继续排障。该探测不会长期常驻 MCP 服务；HTTP / SSE 只展示“已可保存配置，但运行时注入和协议探测尚未接入”的诊断提示，仍属于后续增强。

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

Owner 审批结果只作为人工处理结论回到原提问人，不会自动重新执行被拦截的命令或定时任务；需要执行时由用户在获得结论后重新发起。

## 4. 本机数据与清理

打包应用数据位于：

```text
~/Library/Application Support/quarkfantools/
```

### 4.1 升级兼容与备份

升级策略是先兼容、再迁移、最后才重建。旧版本配置和状态字段应尽量由 `config-merge`、会话降级展示、定时任务 state merge helper、文件缓存索引修复等路径兼容读取。新增字段必须有保守默认值，不得因为旧配置缺字段而扩大授权、自动启用新能力或删除用户数据。

确实无法兼容的旧数据结构，迁移前必须在本机留下备份。当前从旧应用数据目录 `~/Library/Application Support/qah/` 迁移到 `quarkfantools/` 时，应用会先把旧目录复制到：

```text
~/Library/Application Support/quarkfantools/backups/legacy-qah-<timestamp>/
```

随后再迁移 `config/`、`workspace/` 和 `state/`。迁移完成后会写入 `.legacy-qah-migrated` marker，避免每次启动重复备份。若升级后出现不可恢复的数据问题，应先保留该备份目录，再按其中的 `BACKUP-README.txt` 和目录内容进行人工恢复。

存储管理区分会话数据和文件缓存。会话详情会以弹窗展示结构化时间线、Claude session、workspace 文件清单和旧会话 message id，可按接收消息、Agent 过程、提示、最终回复和错误筛选事件，也可导出当前会话详情 JSON。清理单个、过期或全部会话时，会删除对应 workspace、Claude 会话文件和跟踪的消息附件，但保留：

- 应用与机器人配置
- 飞书 OAuth 和 CLI 状态
- 用户导入 Skills
- Skill 市场配置
- 历史补处理 Beta 游标
- 应用级内容哈希文件缓存

文件缓存位于 `state/file-cache/<sha256>/`，用于复用飞书下载的大文件和 Agent 生成文件。缓存按内容哈希去重，metadata 记录关联 Bot。用户可在存储管理中单独清理全部文件缓存；清理后不删除会话记录，但后续需要相关文件时可能重新下载或生成。新写入的缓存索引会记录 `cachedAt`，存储统计会自动清理超过 90 天且有明确缓存时间的索引；共享内容 hash 仍被其他索引引用时，内容目录会继续保留。缓存命中前主进程会确认索引指向的实际文件仍存在，缺失时不会把坏路径交给 Agent。

历史补处理 Beta 游标位于 `state/bots/<bot-id>/message-cursors.json`，只记录 chat、最后消息 ID 和时间，不保存消息正文。存储管理的“清理动作”页会展示游标占用并提供单独清理入口。清理游标不会删除会话或文件缓存，但会让“补处理历史 Beta”失去当前起点，需要等待该 Bot 再收到新消息后重新建立游标。

自定义应用运行产物位于当前会话 workspace 的 `apps/<app-id>/` 下，例如微信模板生成的 `wechat-list.png`、`wechat-conversation*.png`。存储管理会单独展示这些产物的占用、关联 Bot、会话 key、应用 ID、文件数和更新时间，并提供“清理过期产物”和“清理全部应用产物”。配置页可设置保留天数和是否在刷新存储统计时自动清理过期产物。该清理只删除运行产物，不删除 `workspace/apps/` 中本地导入的自定义应用、不删除内置模板、不改变 Bot 授权、飞书 OAuth 或用户 Skills。

飞书消息附件下载已支持下载前缓存命中：同一 Bot 再次处理相同消息资源 key 时，会优先从文件缓存复制到当前消息目录。Agent 需要下载飞书云盘文件或导出云文档时，应输出 `LARK_CACHED_FILE` 结构化请求交给主进程受控 helper。helper 会先按 Bot 和飞书文件标识查缓存，未命中时再用用户态 `lark-cli drive +download` 或 `drive +export` 获取文件，并把文件复制到当前会话目录后继续 Agent 分析。若 Agent 尝试通过 Bash 裸调 `lark-cli drive +download`、`drive +export` 或通过 `./qft-cli lark drive +download/+export` 绕过 helper，Runtime 会中止该次执行并提示改用受控缓存协议。

存储管理会展示文件缓存索引。索引行展示来源类型、关联 Bot、文件名、大小、缓存日期、来源摘要和新鲜度状态；远端云盘或云文档缓存缺少 `freshnessKey` 时会标记为“新鲜度未知”。列表可按 Bot 或来源类型筛选，并支持删除单条缓存索引。单条删除只接收索引 `cacheKey`，不会暴露全局缓存目录路径；如果同一内容 hash 仍被其他索引引用，内容目录会保留到最后一个引用被删除。“校验缓存索引”会移除缺失文件索引、清理孤立内容 hash，并补齐可安全恢复的索引字段。

“定时任务”页会集中展示各 Bot 的任务、启用状态、计划、目标、投递 chat、上次状态、下次计划时间、失败重试和暂停原因，并提供“立即执行”和编辑入口。存储管理仍会展示最近定时任务运行历史。运行历史读取各 Bot 的 `state/bots/<bot-id>/scheduled-runs.jsonl`，以摘要列表展示任务、Bot、状态、开始时间和耗时；详情通过弹窗查看，Workflow 任务会在详情中包含步骤状态和短输出摘要，手动运行会在详情中标记“手动触发”。列表支持按 Bot 和状态筛选。会话清理和文件缓存清理不会删除这些运行历史。

运行台的“执行日志”工具栏提供“导出排障包”。点击后应用会弹出保存位置选择框，并生成 ZIP 文件，便于用户直接发给支持排查现场问题。排障包包含 `README.txt`、脱敏配置/快照、内存日志、落盘日志、存储统计、定时任务历史、MCP/平台诊断和能力审计摘要。导出时会递归脱敏名称中包含 Secret、Token、API Key、Password、Authorization 等的字段；日志本身仍可能包含用户发送的消息正文、文件名、chat id 或错误详情，客户有严格合规要求时应先自行检查再外发。

删除整个应用数据目录会同时删除上述保留信息，应只在明确需要完全重置时执行。

### 4.2 飞书 CLI 选择与升级

安装包会内嵌一份 arm64 `lark-cli`，因此普通用户不需要额外安装飞书 CLI。需要临时跟进官方 CLI 新版本时，应用会按以下顺序选择运行时二进制：

1. Bot 配置里的显式 `cliPath`。
2. 本机可执行的 `lark-cli`，包括应用进程 `PATH`、`/opt/homebrew/bin/lark-cli` 和 `/usr/local/bin/lark-cli`。
3. 安装包内嵌的 `resources/runtime/lark-cli/bin/lark-cli`。

推荐升级方式是安装或更新官方 `lark-cli` 到 Homebrew 路径，或在 Bot 配置中填写明确的 CLI 路径。应用仍会为该 Bot 注入专属 `HOME`、`LARKSUITE_CLI_CONFIG_DIR`、日志目录和 profile，本机 CLI 只替换可执行文件，不复用 macOS 用户全局 OAuth 状态。

如果本机 CLI 升级后出现兼容问题，删除或移走本机 `lark-cli`，或清空 Bot 的显式 CLI 路径后重启应用，即可回退到内嵌版本。现场排障时要确认本机 CLI 来自可信官方来源，因为它会在当前 Bot 的隔离环境中读取该 Bot 的飞书配置和 OAuth 状态。

## 5. 常见排障

### Codex App 网络代理撤回

如果曾为排查 Codex `stream disconnected before completion` 而通过 `launchctl setenv` 固定
Codex App 走 Clash，本机网络恢复后应撤回这些环境变量并重启 Codex App。完整步骤见
[`codex-network-proxy-rollback.md`](codex-network-proxy-rollback.md)。

### 无法启动监听

- 检查机器人是否启用，以及 App ID、App Secret 是否完整。
- 如果飞书 Bot 启动失败，检查是否已有另一个运行中的飞书 Bot 使用相同 App ID。同一飞书应用同一时间只能对应一个本地 Bot；多角色应放在同一个 Bot 下通过 Skill、命令或套件区分。
- 检查至少一个已启用 MODEL PROVIDER 的 Base URL、模型名和 API Key 是否完整。
- 检查日志中是否存在旧监听进程或飞书 CLI 错误。
- `2.0.3` 起，点击运行台“启动”会立即写入本地启动日志，并记录“收到机器人启动请求”“正在确认飞书 Bot 身份”等阶段。如果仍没有任何新日志，优先检查前端事件或应用是否为最新版本；如果停在飞书 CLI 配置、初始化或密钥降级阶段，短命令 30 秒后会显示明确超时错误。
- 如果旧包启动时报 `飞书未返回 Bot open_id`，通常是新版 `lark-cli` 对 `/open-apis/bot/v3/info` 返回了 `ok: true` 但 `data` 为空。2.2.6 起会先绕过 CLI 的空响应，直接调用飞书原始 OpenAPI 补取 Bot `open_id`；原始接口也不可用时才记录“飞书 Bot 身份缺少 open_id，已降级启动”，后续群聊仍按 App ID、Bot 名称和 mention 元数据做严格 @ 路由。
- 升级飞书 CLI 后必须同步审计应用内所有 `lark-cli` 调用点。`@larksuite/cli` 1.0.64/1.0.65 实测 `whoami --as bot` 只返回 profile、App ID 和 token 状态，不返回 Bot `open_id`，因此不能替代 Bot info 路由身份；`drive +export` 新版参数为 `--token`、`--file-name`、`--output-dir`，旧 `--file-token` 会被拒绝；IM 文本发送优先使用 shortcut typed flags `--text`/`--markdown`，表情删除优先使用 `--message-id`/`--reaction-id`，避免 raw params 和旧 content 形态在新版 CLI 中产生歧义。
- 如果升级后出现 `invalid_client` 或 `The auth method is not supported`，确认正在运行 `2.0.3` 或更高版本。新版本凭据 marker 已加入 per-Bot HOME 版本，会重新初始化 Bot 态配置；需要读取飞书资料的用户态 OAuth 仍需在每个 Bot 配置页重新授权。
- QuarkfanTools 只允许一个应用实例；重复打开时会聚焦已有窗口。
- 正常停止和退出应用都会等待监听进程结束；若应用或 CLI 异常退出，再次启动监听会验证并清理该机器人记录的旧订阅 PID。

### 多飞书 Bot 群聊艾特路由异常

- `2.1.0` 已同步 `v1.6.17` 结构：QuarkfanTools 为每个运行中的飞书 Bot 启动一个使用该 Bot 专属 HOME/profile 的隔离事件订阅。`v2.0.3` 同步的单共享入口方案在部分 Intel 客户环境下会只覆盖后启动 Bot 所属飞书应用，导致先启动 Bot 收不到自身事件；新结构保证每个飞书应用至少通过自己的订阅接收事件。
- 官方 `lark-cli event +subscribe --force` 帮助提示多个订阅会被服务端随机拆分事件；QuarkfanTools 不使用 `--force`，并通过 per-Bot HOME/profile 分离本地单实例锁。若飞书服务端仍把一个 Bot 的事件投递到另一个 Bot 的连接，Runtime 会继续按 mention 目标跨 Bot 路由，后续回复、表情、附件下载和 Agent 执行仍使用目标 Bot 自己的隔离凭据。企业微信事件桥不受飞书订阅结构影响。
- 配置里的 `cli_...` 是飞书开放平台应用 App ID，用于初始化对应 Bot 的 lark-cli profile。
- 运行时会记录 `/open-apis/bot/v3/info` 返回的 `bot.open_id` 和应用名。群聊消息有 `message.mentions` 时，应用会先用 mention 目标里的名称、App ID、应用名和 open_id 等值匹配当前 Bot；`mentions[].id.open_id` 只作为命中信号，不作为排他条件，因为现场事件中它可能不同于 bot info 的 `bot.open_id`。
- 事件头里的 App ID 表示当前监听连接所属应用，不一定是消息中被 @ 的目标。有 `mentions` 时不要用 `sourceAppId` 判定目标 Bot；群聊没有 `mentions` 时也不能用它兜底，必须记录 `missing-group-mention-metadata` 并忽略。`sourceAppId` 只用于私聊或非群聊旧事件的兼容兜底。
- lark-cli WebSocket 日志里可能出现 `aid=552564` 之类参数。该值来自飞书服务端返回的 WebSocket endpoint URL，是飞书事件网关或 SDK 连接层参数，不是配置的 App ID，也不能用于判断两个机器人是否接入了同一个飞书应用。
- 本地 POC 确认：两个不同 `cli_...` 应用同时监听时，WebSocket URL 中可以出现相同 `aid`；但 `/open-apis/bot/v3/info` 返回的 `open_id` 和应用名不同。因此排查多 Bot 路由时，应看脱敏 App ID、bot info 的 `open_id` 和应用名、事件 `mentions` 里的目标值，以及“已忽略非当前机器人艾特消息”的判定原因。
- 不论当前运行一个还是多个飞书 Bot，如果群聊事件缺少 `mentions` 元数据，默认都会记录 `missing-group-mention-metadata` 并忽略该消息，避免未 @ 机器人时误触发回答。出现这种日志时，需要确认飞书事件是否为原始消息事件、机器人是否被真正 @、以及 lark-cli 输出没有开启会丢失 mention 的紧凑模式。
- 如果某个 Bot 在配置页开启“上下文免艾特回复 Beta”，无 `mentions` 的群聊消息会进入该 Bot 的 beta 职责判断流程；运行台会记录“未艾特群消息进入职责判断 Beta”。这类消息不会先添加处理中表情，也不会触发长任务提示。Agent 输出 `QFT_NO_REPLY` 时 Runtime 静默结束；只有 Agent 判定属于当前 Bot 职责并输出普通回复时，才会实际回群。排查误插嘴时优先检查该 Bot 开关、日志中的 `chatType`、`mentions`、`betaBotIds` 和最终是否出现“Beta 职责判断后静默”。

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

- 确认当前命中的 Provider 服务兼容 Claude Messages API、工具调用和所配置模型名。
- 确认至少一个已启用 Provider 的 Base URL 与 API Key 正确。
- 如果配置了多个 Provider，可在系统设置中开启“失败切换”。开启后，轮流或随机命中的 Provider 失败时会尝试下一个完整 Provider；关闭时会直接把当前 Provider 的失败暴露出来，便于排查单个服务。
- 只有 OpenAI Responses 兼容并不足以运行当前 Claude Agent SDK 内核。

### Skill 未被使用

- 确认目录包含 `SKILL.md`。
- 确认 Skill 已被发现并授权给目标机器人。
- 同名 Skill 优先级为用户、市场、内置，检查是否被更高优先级版本覆盖。
- 如果多个本地目录的 `SKILL.md` 声明了同一个 `name`，技能市场会保留第一个声明名，并用后续目录名区分显示，例如 `moje-qa-assistant-adv`。
- 正在被 Bot 授权使用的本地 Skill 删除按钮会禁用；先到配置页取消对应 Bot 授权后再删除。

### 命令未生效

- 确认消息以 `/命令名` 开头，且未使用保留命令 `/new`、`/continue`、`/owner`、`/help`。
- 到 Bot 编辑弹窗确认该命令仍处于启用状态。
- 检查命令映射区是否提示命令名或别名冲突。
- 如果目标是 Skill，确认该 Skill 仍被该 Bot 授权。
- 如果目标是自定义应用，确认该应用仍被该 Bot 授权，并在 `app.json` 中声明了 `capabilities.commandCallable = true`。
- 如果目标是 MCP，确认该 MCP 是 `stdio`、已启用、已授权给 Bot，且策略允许命令调用；HTTP/SSE MCP 当前只显示建设中诊断，不会出现在命令目标中。
- 如果目标是套件，确认该套件仍被该 Bot 授权；命令本身不会自动补齐底层 Skill、自定义应用或 MCP 授权。
- 命令名中包含空格或其他非法字符时，保存配置会被归一化过滤；字母会统一转成小写。

### 定时任务未触发

- 确认应用当时处于运行状态；当前版本不提供后台常驻调度服务。
- 如果应用或电脑在计划时间关闭，重启后会追赶执行持久化 `nextRunAt` 已到期的任务一次；如果运行历史仍为空，优先检查该任务是否曾保存出有效 `nextRunAt`。
- 确认该 Bot 已启用，且至少一个已启用 MODEL PROVIDER 的 Base URL、模型名、API Key 完整。
- 手动“立即运行”只支持已保存且启用的任务；修改表单后需先保存 Bot 配置。
- 确认任务的 `chat_id` 有效，且对应身份可向该会话发消息。定时任务投递字段不是自定义应用 `deliveries[].routeId`；当前仅兼容已启用且已填写真实 `chat_id` 的投递路由 ID/名称。
- `command` 目标要求对应命令已启用；`capability` 目标要求底层 Skill、stdio MCP、套件、Workflow 或可执行自定义应用仍然授权有效，并且策略允许定时调用。
- 如果目标类型是 `Agent`，且 prompt 要求执行 `/Users/...` 下的绝对路径脚本，需要确认该路径在 Agent sandbox 可访问，并且目标机器确实有可用运行时。更稳定的做法是把脚本封装为受管自定义应用或 Skill，避免依赖用户主目录中的散落脚本。
- 如果运行历史显示失败，检查投递 chat 中的失败告警；告警发送失败时运行台会记录原因。
- 任务行的“状态/日志”按钮可直接查看该任务最近运行详情；如果下次执行时间显示“已到期，等待调度器追赶”，说明调度器已保留过期计划，应用应在运行态尽快触发。
- 周计划的 `weekdays` 使用 `0-6`，其中 `0=周日`。
- Cron 表达式必须是 5 段数字表达式，支持 `*`、逗号列表、范围和步进；周字段支持 `0` 或 `7` 表示周日。当前不支持秒级、`L/W/#`、英文月份或英文星期。
- 如果任务暂停自动排期，打开 Bot 编辑弹窗查看任务摘要或任务编辑弹窗中的“暂停原因”。确认问题修复后可手动立即执行；执行成功会清空失败计数、重试时间和暂停原因。

### MCP 未生效

- 确认 MCP 服务在“配置”页处于启用状态，且命令、参数有效。
- 确认该 Bot 已勾选“允许访问的 MCP”。
- 查看“能力”页 MCP 卡片的 OK/WARN/ERROR 诊断，优先处理命令无法解析、cwd 不可读或环境变量缺值。
- 点击“刷新 MCP 诊断”执行协议探测；若握手或 `tools/list` 失败，按卡片中的协议错误、退出码和 stderr 尾部处理 MCP 服务启动参数、环境变量或协议兼容问题。
- 如果问题发生后应用已重启，查看 MCP 卡片中的“最近探测”，或检查 `state/mcp-diagnostics.jsonl` 中对应服务的最后一条记录。
- 当前版本使用严格 MCP 配置，不会自动读取项目目录或用户目录中的 `.mcp.json`。
- 如果 MCP 进程依赖环境变量，确认已在 MCP 配置中显式填写。

### 默认 Playwright 工具不可用

- 运行台若显示 `browser_*` 工具启动失败，先确认当前机器存在可用 Chrome；当前默认 Playwright MCP 使用 `--browser chrome`。
- 默认 Playwright MCP 不使用用户 Chrome profile，所以需要登录态的网站不会自动继承用户浏览器中的登录状态。
- 截图、下载和其他产物会写入当前会话 workspace 的 `.playwright/`，可通过存储管理随会话清理。
- 打包前如要改成完全自包含浏览器，需要先准备并核对 Playwright Chromium 的包内路径、安装包体积和 Apple Silicon 运行结果。

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

生成 Apple Silicon / arm64 的 DMG 和 ZIP：

```bash
npm run pack:mac
```

打包脚本显式使用 `node_modules/electron/dist` 作为 electron-builder 的 `electronDist`，避免发布打包阶段重新访问 GitHub 下载 Electron 分发包。DMG 由本机 `hdiutil` 基于 electron-builder 产出的 `mac-arm64/QuarkfanTools.app` 生成，并在镜像内放入 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式，提供拖动安装布局，同时避免 DMG 阶段下载外部辅助工具。DMG 文件系统显式指定为无分区布局的 `HFS+`，避免新系统默认生成 APFS 或 GPT 分区镜像后在旧 macOS、部分传输工具或安全软件处理后提示“未能加载镜像”或“装载文件系统失败”。上述依赖只属于开发/打包环境，生成的安装包仍是自包含交付物。

若客户侧仍然无法装载 DMG，应优先发同版本的 app ZIP 兜底安装包。生成方式为：

```bash
ditto -c -k --sequesterRsrc --keepParent release/arm64/mac-arm64/QuarkfanTools.app release/arm64/QuarkfanTools-X.Y.Z-arm64-app.zip
```

用户解压 ZIP 后，把 `QuarkfanTools.app` 拖到 `/Applications` 即可，不依赖磁盘镜像挂载。

等价单独构建命令：

```bash
npm run pack:mac:arm64
```

构建产物会先输出到：

```text
release/arm64/
```

`release/` 是本机忽略目录，不提交到 Git。另一台电脑从 Git 拉取代码后不会拿到本机已验证的 DMG / ZIP；如果需要在那台电脑生成安装包，应先安装依赖并执行 `npm run pack:mac`，或者通过外部分发渠道获取已校验的归档产物。

正式发布归档按版本目录保存，结构与 1.x 系列保持一致。例如 `v2.2.0` 的最终可分发文件位于：

```text
release/v2.2.0/
```

`release/v2.2.0/` 根目录保留 DMG、ZIP、`zip.blockmap` 和 `latest-mac.yml` 等发布文件；打包生成的中间 `.app` 放入 `release/v2.2.0/build-arm64/`，不作为面向客户的安装包。

2.x 本地发布归档默认只保留最近两个版本目录。完成新版本打包、DMG 校验、挂载检查和归档后，应清理更早的 `release/v2.*` 目录；当前保留 `release/v2.1.7/` 和 `release/v2.2.0/`。`release/arm64/` 是 electron-builder 的临时输出目录，完成归档后也只保留最近两个 2.x 版本相关的 DMG、ZIP、blockmap 和 `latest-mac.yml`，避免旧包误发给客户。历史恢复包或 1.x 封板包如需保留，应单独说明用途，不纳入 2.x 最近两个版本规则。

发布检查：

1. 确认产品已决定发版；未准备打包的变化必须留在 `CHANGELOG.md` 的 `Unreleased`。
2. 按版本规则更新 `package.json`、`package-lock.json`、根 `CHANGELOG.md`、`electron/release-notes.ts`、`README.md`、`docs/AI.md` 和 `STATUS.md`。
   - 远端授权门禁、授权地址、内部治理开关等客户不需要感知的发布控制，只写根 `CHANGELOG.md`、运维/安全文档和 `STATUS.md`；不要写入应用内面向用户的 `electron/release-notes.ts`。
3. 确认用户可见变更、运行结构、配置、数据路径、发布方式已同步到相关文档。
4. 运行 `npm test`。
5. 运行 `npm run pack:mac`。
6. 核对 app 版本号、主程序架构、内置 `lark-cli`、`wecom-cli` 和 Claude runtime 架构。
7. 执行 `hdiutil verify` 校验 DMG。
8. 用 `hdiutil imageinfo` 确认 DMG 为 `partition-scheme: none`，分区为 `Apple_HFS` / `HFS+`，再挂载 DMG，确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式。
9. 归档到 `release/vX.Y.Z/`，并按“最近两个 2.x 版本”规则清理旧归档。
10. 在 `STATUS.md` 记录命令、结果、归档路径、保留目录和未签名/未公证状态。

当前没有配置代码签名和 Apple 公证，安装时可能出现系统安全提示。

如果其他机器提示“未能装载镜像 / 装载文件系统失败”，先在目标机器执行：

```bash
hdiutil verify path/to/QuarkfanTools-2.2.5-arm64.dmg
shasum -a 256 path/to/QuarkfanTools-2.2.5-arm64.dmg
```

`hdiutil verify` 失败通常表示下载、复制或本地构建产物损坏；校验通过但仍无法挂载时，优先确认是否使用了当前仓库的 `scripts/create-arm64-dmg.sh` 重新打包，或改用同版本 ZIP 产物临时安装。

### 当前分支状态

截至 2026-06-22，2.0 已进入远端 `main` 主线，`main` 与 `codex/2.0.0-stabilize` 指向同一接续提交。1.x 系列分支已封版，后续只作为历史兼容样本，不再作为同步目标；后续开发优先完成 2.0 完成度矩阵中的未完成需求。

定时任务版本合并治理已完成首轮收口：任务定义字段与 `failureCount`、`retryAt`、`pausedReason`、`lastRunAt`、`nextRunAt`、`lastStatus` 等运行态字段已拆成明确 merge helper，并补齐历史 cron 任务、2.0 retry 任务、旧状态文件和回滚后再升级形态的兼容测试。后续继续关注真实现场升级样本。

### 版本号规则

版本号使用 `主版本.次版本.修订版本`：

- **主版本**：出现大的应用能力变更、核心使用方式变化或不兼容调整时升级，例如 `1.x.x` 到 `2.0.0`。
- **次版本**：新增用户能够明显感知的完整功能时升级，例如 `1.4.x` 到 `1.5.0`。
- **修订版本**：修复问题、优化体验或增加轻量小能力时升级，例如 `1.4.0` 到 `1.4.1`。

每次版本更新必须同步开发用根 `CHANGELOG.md` 和应用内面向用户的 `electron/release-notes.ts`。未完成打包验证时，`STATUS.md` 必须明确标记当前版本尚未生成安装包。

形成具体版本号并写入版本记录后，必须在同一轮执行 `npm run pack:mac`，生成并核对 arm64 的 DMG 和 ZIP。尚未准备打包的变化必须继续保留在 `Unreleased`，不得提前建立正式版本记录。Intel x64 不再作为当前发布目标，旧 x64 产物只作为历史版本兼容样本保留。

如果用户说“发一版”，默认含义是完整发布流程：版本号同步、变更记录、应用内更新记录、测试、打包、DMG 校验、挂载检查、归档和旧版本清理。不能只改版本号，也不能只运行打包命令后就结束。
## 2.1 多 IM 平台、连接器与投递路由

Bot 的“消息平台”只决定从哪里接收消息和默认回复到哪里。当前正式开放飞书；企业微信入口因官方能力限制暂时封闭：

- 飞书 Bot：主平台配置即可同时承担消息入口、回复和飞书资料能力。
- 企业微信 Bot：历史配置、Bot ID / Secret、事件桥、轮询 Chat ID 和聊天列表选择结果会保留，但当前版本不会启动企业微信监听、轮询、缓存初始化或聊天列表获取。
- 结果投递路由：最终回复先回到原消息平台；当前企业微信投递路由暂时封闭，不能作为可选目标。

企业微信首版曾参考官方 `WecomTeam/wecom-cli` 命令形态：`wecom-cli <category> <method> '<json_args>'`，并实现过 `msg send_message`、`msg get_msg_media`、`msg get_message` 和 `msg get_msg_chat_list` 的适配。由于官方 CLI 本身是调用型工具，不提供飞书式事件长连接，且轮询指定会话的产品体验和稳定性不足，当前版本暂时封闭企业微信 Provider。

Bot 编辑弹窗会把企业微信消息平台、CLI 缓存初始化、聊天列表获取、事件桥和轮询配置标记为“暂时封闭”并禁用操作。运行台启动旧企业微信 Bot 时会直接提示“企业微信 Provider 因官方能力限制暂时封闭”，不会隐式启动旧轮询桥。

已保存的 `providerOptions.eventCommand`、轮询会话类型、轮询 Chat ID 列表、回看窗口和高级 JSON 参数不会被清理，便于后续重新开放时参考或迁移。当前版本不会调用这些配置。

安装包仍会携带 arm64 版官方 `@wecom/cli` runtime，位置为 `resources/runtime/wecom-cli/bin/wecom-cli`，作为后续恢复企业微信 Provider 和排查 CLI 行为的基础。开发和打包准备由 `npm run pack:prepare` 完成：它会把固定的 `assets/app-icon.icns` 复制为 `build/icon.icns`，并准备 arm64 版 `lark-cli`、`wecom-cli` 和 Claude runtime。

Agent 会话 workspace 会自动生成 `CLAUDE.md`、`.quarkfan/cli-channels.json` 和 `qft-cli` wrapper。当前开放路径应通过 `./qft-cli lark ...` 调用飞书能力；企业微信 channel 会随 Provider 封闭而不作为当前用户可用路径。

### 企业微信 CLI 参考源码

官方 `wecom-cli` 是开源项目，后续排查企业微信消息、媒体和命令行为时优先参考本地源码缓存：

```text
github/wecom-cli/
```

该目录通过以下命令获取，作为本地参考资料，不纳入 QuarkfanTools Git 提交：

```bash
git clone https://github.com/WecomTeam/wecom-cli.git github/wecom-cli
```

当前本地参考版本：

```text
origin: https://github.com/WecomTeam/wecom-cli.git
commit: 72e14f7695f34d28f1ff23ea504ddd2210a87c13
```

需要刷新参考源码时，在项目根目录执行：

```bash
git -C github/wecom-cli pull --ff-only
```

刷新后如果据此调整 QuarkfanTools 的企业微信 Provider、默认轮询桥、媒体下载或配置说明，需要同步更新 `docs/architecture.md`、`docs/requirements.md`、`docs/operations.md`、`STATUS.md` 和 `CHANGELOG.md`。
