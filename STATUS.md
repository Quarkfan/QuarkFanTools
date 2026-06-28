# 当前状态

最后更新：2026-06-28

## 当前基线

- 产品版本：`2.2.3`
- Git 分支：当前工作分支 `codex/2.0.0-stabilize`，远端 `main` 已同步到同一提交
- 远端：`git@github.com:Quarkfan/QuarkFanTools.git`
- 远端分支：`main` 与 `codex/2.0.0-stabilize` 指向 2.0 最新接续提交；1.x 系列已封版，后续只作为历史兼容样本，不再作为同步目标
- 运行平台：后续发布和验证默认只面向 macOS Apple Silicon / arm64；Intel x64 只作为历史版本兼容样本
- Agent 内核：`@anthropic-ai/claude-agent-sdk`
- 当前阶段：2.2.3 arm64 测试安装包已形成并校验；本轮调整微信桌面辅助 Agent PoC 为未读读取优先，为 `/wechat-read` 加入内置兜底命令，并修复飞书群聊 `@机器人 /wechat-read` 提及前缀导致命令未识别的问题，按自定义应用模板接入，不恢复企业微信 Provider，不新增微信协议机器人。每 Bot 隔离飞书事件订阅、Bot 专属 lark-cli HOME、启动可见日志、旧凭据 marker 迁移修复、定时任务版本合并治理、命令机制、定时任务、缓存、自定义应用、套件/Workflow、MCP 占位诊断、IM 连接器诊断、使用手册、建设中能力友好响应、浅色主题统一、MCP 新增草稿、应用图标恢复、内置模板、Bot Provider 动态配置、自定义应用/套件 Manifest 编辑器和能力页多层级导航已完成。接下来聚焦真实飞书端到端验证、签名公证和后续高级扩展，不再跟进 1.x 同步。
- 微信桌面辅助 Agent PoC 当前可尝试截取微信当前窗口，并通过本地初筛和已配置多模态模型识别可见未读，再可选把草稿写入系统剪贴板，同时阻断自动发送；不读取微信数据库、不调用协议、不 Hook 进程，也不自动搜索、粘贴或发送。

## 已实现

- 多飞书机器人配置、独立启停和权限隔离。
- 飞书 Provider 为每个运行中的 Bot 使用独立 HOME/profile 启动事件订阅；事件进入 Runtime 后统一按 mention 目标路由到唯一目标 Bot。这样每个飞书应用至少通过自己的订阅接收事件，如果服务端交叉投递也能路由到被艾特 Bot。
- 飞书 Bot 启动时会调用 bot info 确认实际 `open_id` 和应用名；多飞书 Bot 群聊艾特消息按 mention 目标值路由到目标机器人，`mentions.id.open_id` 只作为正向命中信号，不作为排他条件。
- 多飞书 Bot 同时运行时，群聊消息如果缺少可判定的 mention 元数据，会记录诊断并忽略，避免多个机器人同时回复。
- 每个注册机器人可独立启停监听，并可查看和筛选其独立日志。
- 应用内展示可点击版本号，并提供面向用户的更新记录弹窗。
- 单实例运行、旧订阅接管和无重复定时器的自动重连。
- 顶部拖拽带、侧栏品牌区与页面标题空白区均可用于移动窗口。
- 按机器人选择可访问的 Skills。
- 飞书消息处理中表情、最终回复、消息去重和断线重连。
- 24 小时连续会话、主动重置、私聊与群聊用户隔离。
- 图片消息多模态输入，Agent 可调用隔离身份下的 `lark-cli`。
- 内置 Word、PowerPoint、Excel Skills 和 Office 文件预处理。
- 用户 Skill 导入与 HTTPS Git Skill 市场。
- 本地技能市场管理页、Skill 来源展示和用户导入 Skill 删除。
- 导入或同步的 Skill 默认零授权，必须为机器人显式勾选。
- Bot Skill 授权支持搜索和按筛选结果批量授权或取消。
- 添加处理中表情与 Agent 并行执行，并记录消息处理分段耗时。
- 本地技能市场支持来源、未授权筛选和 Bot 授权概览。
- 跨会话任务按配置的并发上限排队，运行台展示排队数量。
- 单次 Agent 最大步数可配置，默认 60，达到上限时会回复用户明确原因。
- Bot 可配置 Owner，通过私聊卡片完成人工协助或授权结论回传。
- lark-cli 配置会校验并自动初始化，同时为 Claude sandbox 自动准备本地密钥文件。
- 飞书 CLI 运行时支持本机优先升级：Bot 显式 `cliPath` 最高优先级，其次自动检测本机 `lark-cli`，最后回退到安装包内嵌版本；所有路径仍使用当前 Bot 专属 HOME、配置目录和 profile。
- Agent 使用用户态查找、读取和导出飞书文档，macOS sandbox 允许 trustd 完成 lark-cli 代理 TLS 校验。
- Agent sandbox 允许当前 Bot 的 lark-cli 状态与锁文件目录读写，同时继续拒绝其他 Bot 的状态和 workspace。
- Agent sandbox 只允许当前 Bot 状态目录下的 lark-cli 配置、安全存储和降级密钥；所有 lark-cli 子进程设置当前 Bot 专属 HOME。用户态授权统一从应用配置页发起，升级到 `2.0.3` 后需要按 Bot 重新完成 OAuth。
- Bot 可配置用户态 OAuth 额外权限列表，发起授权时与默认文档搜索权限合并。
- 用户态 OAuth 完成日志改为摘要，并明确提示 OAuth 只授权资料读取用户，不会开放飞书 Bot 给其他群成员；群成员权限由飞书开放平台应用发布状态和可用范围控制。
- moje-qa-assistant 在本地知识不足时继续搜索飞书，并对 Office 文件使用预览、导出和多模态分析。
- 过滤处理中表情触发的 reaction created/deleted 未注册处理器日志，保留其他飞书连接错误。
- 高匹配飞书文件可先回复基本答案并创建待确认任务，用户确认后沿用原会话继续下载和分析。
- 已下载附件进入应用控制的内容哈希缓存，Bot 可配置展示安全的 Agent 工作进度。
- Skill 市场和会话支持点击预览；Skill 导入冲突会明确报错，市场与 Bot 授权筛选已优化。
- Skill、自定义应用和套件卡片支持打开已发现资源所在目录，便于复制和检查资源文件。
- 左上角 Logo 可打开应用内使用手册，集中说明配置和主要功能用法。
- 左下角全局状态按多 Bot 展示在线数量、监听数量和排队任务数。
- 配置页机器人区域改为列表加编辑弹窗，并为配置项提供说明弹窗。
- 同名 frontmatter 的本地 Skill 会使用目录名作为冲突显示名，避免导入后被去重隐藏。
- 正在被 Bot 授权使用的本地 Skill 不允许删除。
- 会话存储统计、过期清理、选择性清理和全部会话清理。
- 存储管理将会话数据和应用级文件缓存分开统计与清理。
- 存储管理会话详情展示结构化消息明细、Claude session 和 workspace 文件清单，并兼容旧会话记录。
- 存储管理会话详情支持按事件类型筛选和导出 JSON；定时任务运行历史已从长详情内嵌改为摘要列表加详情弹窗。
- 运行台日志默认记录 Agent 可观察工作过程，飞书进度消息仍由 Bot 配置控制。
- 运行台点击启动会立即记录本地启动日志；主进程记录启动请求和飞书身份确认阶段，lark-cli 配置校验、初始化和密钥降级短命令有 30 秒超时，避免启动卡住时无反馈。
- lark-cli 凭据 marker 加入 per-Bot HOME 版本，升级后会重新初始化 Bot 态配置，避免旧全局或旧 HOME 状态导致 `invalid_client`。
- Bot 支持长任务自动提示：超过配置秒数仍未完成时先回复一次配置文案，最终结果仍正常回复。
- 会话明细会按轮次记录接收消息、资源准备、Agent 可观察工作过程、长任务自动提示、最终回复和错误事件。
- 多 IM Provider 底座已接入：当前正式开放飞书作为消息平台；企业微信 Provider 代码和历史配置保留，但 UI 与运行时入口因官方能力限制暂时封闭。
- Agent 会话 workspace 会自动生成 `CLAUDE.md`、`.quarkfan/cli-channels.json` 和 `qft-cli` wrapper，让 Agent 通过统一 CLI 路由访问当前 Bot 已授权的平台通道。
- 打包链路已收敛为 arm64 发布：安装包会携带 arm64 `lark-cli`、arm64 `wecom-cli` 和 arm64 Claude runtime；macOS app icon 使用固定的 `assets/app-icon.icns` 资源，避免界面 Logo 与应用图标互相漂移。
- 2.0.0 能力治理底座初步实现：配置支持 Bot `capabilityRefs`，Runtime 输出统一能力目录，能力页支持导入和预览自定义应用，Bot 编辑器支持授权自定义应用。
- 自定义应用本机生命周期已收口：支持 manifest 阻断诊断、安装状态、同 ID 升级、卸载，以及被 Bot 授权或套件依赖时的卸载保护。
- 能力页扩展治理诊断已接入：集中展示自定义应用入口和权限风险、套件缺失依赖、Workflow 步骤引用缺失，并给出授权前处理建议。
- 能力页 Bot 治理控制台和能力使用审计报表已接入：按 Bot 展示授权引用、policy、命令/定时绑定和最近能力使用结果；命令、定时任务和 Owner 审批阻断会写入 `state/bots/<bot-id>/capability-audit.jsonl`，审计只读展示，不作为授权来源。
- 能力页 IM / CONNECTORS 诊断已接入：按 Bot 检查主消息平台、飞书知识连接器、投递路由、企业微信封闭状态和钉钉占位状态。
- 应用级主题切换已实现，支持跟随系统、浅色和深色；左侧品牌区已接入本地 `logo.png`。
- 能力页已内置自定义应用和套件模板，并按“内置模板 / 本地导入”标识来源；内置模板不可卸载，用户可复制模板结构学习 `app.json`、`suite.json` 和 Workflow 写法。
- Bot 编辑弹窗会根据飞书、企业微信封闭状态或钉钉建设中动态切换配置区；飞书接收/回复身份、处理中表情、Owner 和 OAuth 字段只在飞书主通道下展示。
- 企业微信 Bot 编辑弹窗当前显示“暂时封闭”说明，并禁用企业微信消息平台选择、初始化/刷新企业微信 CLI 缓存、聊天列表获取、事件桥和轮询配置；已有历史配置会保留但不会运行。
- Bot 级 `/xxx` 命令映射已接入，当前支持将命令配置到已授权 Skill、MCP、套件、套件派生 Workflow 或已授权且声明 `commandCallable` 的自定义应用。
- 命令映射支持别名和 `/help` 自动帮助列表，用户可查看当前 Bot 已启用命令、别名和说明。
- Bot 编辑弹窗支持新增命令、配置命令目标、别名、说明和 Prompt 模板，并在保留命令或命令名/别名冲突时给出强提示。
- Bot 能力授权行支持配置 Agent、命令、定时任务和 Owner 审批策略，保存配置时会保留用户选择的 policy。
- 套件已接入能力治理目录，支持导入、预览、Bot 挂载授权、版本/发布者/可信来源展示、同 ID 升级、卸载和引用保护，并可作为命令目标把套件说明、工作流和已授权子能力摘要注入 Agent 上下文。
- 套件下派生的 Workflow 已进入能力目录，可直接作为命令或定时任务 capability 目标执行，并复用父套件上下文。
- Workflow 已支持声明式步骤编排：当前支持 `prompt` 步骤和 `capability` 步骤，按顺序执行并把上一步输出和已命名步骤输出传给后续步骤。
- Workflow 声明式步骤支持 `input` 输入模板、`{{steps.<stepId>}}`/`{{variables.<key>}}` 变量、`condition` 条件跳过、`repeat` 循环、`continueOnError` 失败恢复、`timeoutSeconds` 单步超时和 `retry.maxAttempts` 单步重试，步骤日志和定时任务摘要会记录尝试次数。
- 能力执行链已强制 Owner 审批策略：Bot capability policy 或自定义应用声明需要 Owner 审批时，命令会先创建 Owner 私聊审批请求，定时任务会失败并记录需要审批的原因。
- Workflow 步骤执行已接入运行台日志；定时任务触发的 Workflow 会把步骤状态、跳过状态和短输出摘要写入 `scheduled-runs.jsonl`。
- Bot 级定时任务已接入：支持 `interval/daily/weekly/cron` 计划、`agent/command/capability` 目标、本机调度、chat 投递和运行记录。
- Bot 定时任务支持手动立即运行已保存且启用的任务，运行结果进入同一审计历史，且不扰动原本已计算的下一次计划时间。
- Bot 定时任务支持失败重试治理：计划触发失败可按任务配置延迟重试，连续失败超过上限后暂停自动排期并展示暂停原因。
- 定时任务定义和运行态字段已拆分：配置只保存 schedule、target、delivery、retry 等定义字段，Bot 状态目录的 `scheduled-tasks.json` 只保存 `lastRunAt`、`nextRunAt`、`lastStatus`、`failureCount`、`retryAt` 和 `pausedReason` 等运行态；升级时兼容旧版完整任务数组状态文件并只按任务 `id` 合并运行态。
- 存储管理已展示最近定时任务运行历史，可查看 Bot、任务、状态、耗时和详情；Workflow 定时任务会展示步骤摘要。
- 定时任务中心已接入独立页面，集中展示各 Bot 任务、最近状态、下次计划、失败重试、暂停原因、立即执行和编辑入口。
- 定时任务失败会向任务投递 chat 发送失败告警；告警发送失败时只写运行台日志，不改变运行记录。
- 定时任务的 `capability` 目标已支持 Skill、MCP、套件、套件派生 Workflow 和声明 `scheduledCallable` 的自定义应用，并补齐 `allowScheduledUse` 治理校验。
- Runtime Binding 已抽出统一 capability executor，Skill / 套件 / Workflow / 自定义应用的命令与定时任务执行分派不再散落在消息主流程。
- Runtime Binding 进一步拆分为 executable binding resolver 与 capability executor，命令和定时任务现在先解析 binding，再执行能力。
- MCP 已接入：支持全局 `stdio` 配置、能力目录展示、Bot 维度授权，并以严格 MCP 配置模式注入 Claude Agent SDK。
- MCP 配置诊断已接入能力页：静态检查启用状态、传输类型、命令解析或 URL 缺失、cwd 可读性、环境变量缺值和 Bot 授权情况，并展示 OK/WARN/ERROR；手动刷新会短暂启动 `stdio` MCP 执行协议握手和工具列表预览。
- MCP 协议诊断会把每次探测摘要追加到 `state/mcp-diagnostics.jsonl`，能力页会展示最近一次探测结果，便于应用重启后继续排查启动失败、工具列表和 stderr 尾部。
- MCP HTTP / SSE 传输已支持配置保存和占位诊断，但运行时注入、命令目标、定时任务目标和协议探测仍只开放给 `stdio` MCP。
- 受控飞书文件缓存 helper 已接入：Agent 可通过 `LARK_CACHED_FILE` 请求主进程下载云盘文件或导出云文档，优先命中应用级文件缓存，再把当前会话本地路径回灌给 Agent 继续分析。
- Runtime 会检测并拦截 Agent 通过 Bash 裸调 `lark-cli drive +download` 或 `drive +export`，引导走受控文件缓存 helper。
- 存储管理定时任务运行历史支持按 Bot 和状态筛选；能力页 MCP 静态诊断支持手动刷新。
- 存储管理已展示文件缓存索引，支持按 Bot 和来源类型筛选、单条删除缓存索引、90 天自动失效、新鲜度状态和索引校验修复；共享内容 hash 会保留到最后一个索引引用删除。
- 应用内使用手册已补充场景化教程，覆盖飞书问答、企业微信暂时封闭说明、命令、定时任务、套件/Workflow、MCP 和升级恢复；配置页 MCP 相关 `?` 说明已扩展。
- 预留能力已有友好 UI 响应：钉钉在消息平台中标记建设中且不能启动；HTTP/SSE MCP 可保存 URL 但不会注入运行时；webview、mcp-adapter 和 workflow 自定义应用入口会显示建设中，不会出现在命令或定时任务目标中。
- 能力页已改为多层级导航：治理总览、诊断排障、MCP 服务、套件/Workflow、自定义应用和使用审计分开展示，避免所有能力和诊断堆叠在同一长页面。
- arm64 安装包构建为当前发布目标。

## 已知限制与风险

- macOS 安装包尚未签名和公证。
- Skill 市场只支持 HTTPS Git，不支持 SSH。
- 会话固定以 24 小时无活动为过期标准，暂不能在 UI 中调整。
- Agent 使用 `bypassPermissions`，安全主要依赖 Claude sandbox、目录隔离和 Skill 授权边界。
- PowerPoint 视觉预览依赖 macOS 自带 Quick Look；预览质量受系统支持影响。
- 自动化测试目前集中在配置迁移、飞书事件解析、Office 提取和会话键，端到端飞书与 UI 覆盖仍有限。
- 延后下载任务目前支持用户确认后立即进入队列，不支持 cron 或任意指定时间调度。
- 2.2.0 已完成 arm64 打包验证并归档。能力治理、命令、套件、Workflow、定时任务、MCP、主题、升级备份、缓存拆分、使用手册、建设中能力反馈、浅色主题统一、MCP 新增草稿、应用图标恢复、内置模板、Bot Provider 动态配置、自定义应用/套件 Manifest 编辑器和能力页多层级导航均已有代码落地；企业微信 Provider 入口已暂时封闭，权威矩阵见 `docs/2.0-design.md` 的“当前完成度矩阵”。
- 自定义应用本地首版已覆盖导入、预览、Bot 授权、`node` 入口、命令调用、定时调用、manifest 诊断、升级和卸载生命周期；`webview/ui`、`mcp-adapter`、应用市场和签名校验仍属于高级扩展。
- MCP 当前支持 `stdio` 运行时、Claude Agent SDK 严格注入、静态配置诊断、手动协议探测、持久化探测日志，以及作为命令/定时任务目标聚焦调用；探测失败会展示退出码、signal 和 stderr 尾部。HTTP / SSE 只支持保存 URL 和占位诊断，运行时注入、协议探测和真实服务端到端专项验证未完成。
- Workflow 首版已覆盖 prompt workflow、顺序 steps、步骤级输入模板、步骤输出变量、条件跳过、循环、失败恢复、超时和重试；单步重跑、专门运行历史页和真实 IM 端到端专项验证未完成。
- 定时任务当前是本机应用运行期间触发；应用启动后会按持久化 `nextRunAt` 尽快追赶已到期任务，但不提供系统级后台常驻调度。复杂日历定义为 5 段 cron 基础表达式，不支持秒级、`L/W/#` 等高级 cron 扩展。
- 飞书消息附件、受控云盘下载和受控云文档导出已支持下载前缓存命中；裸调 `lark-cli drive +download/+export` 已有运行时拦截。缓存索引已支持单条删除、90 天自动失效、新鲜度状态、缺失文件命中保护和索引校验修复；其他未来下载入口仍需按同一治理模型接入。
- 旧 `qah` 应用数据迁移前会备份到 `quarkfantools/backups/legacy-qah-<timestamp>/`，再迁移 `config/`、`workspace/` 和 `state/`；不兼容升级必须先留本地备份。
- 企业微信 Provider 代码仍保留官方 `wecom-cli <category> <method> <json_args>` 调用模型首版适配，包括配置、初始化、轮询桥、事件归一化、回复、资源下载和投递路由代码路径；但考虑到官方 wecom-cli 不提供事件长连接且轮询指定会话体验受限，当前 UI 与运行时入口已暂时封闭。钉钉只完成结构预留，尚未实现 Provider。
- 官方 `WecomTeam/wecom-cli` 源码已克隆到本地 `github/wecom-cli/` 作为参考缓存，当前 commit 为 `72e14f7695f34d28f1ff23ea504ddd2210a87c13`；该目录已加入 `.gitignore`，不纳入 QuarkfanTools 提交。
- 飞书知识连接器和投递路由已有能力页诊断；企业微信诊断当前明确提示 Provider 暂时封闭。诊断只检查本机配置完整性，不能替代真实 IM 端到端验证。

## 后续优先事项

1. 按 `docs/2.0-e2e-checklist.md` 补真实 IM、命令/Workflow/定时任务、MCP 和会话清理端到端验证。
2. 增加真实飞书事件、机器人隔离、命令/Workflow/定时任务和会话清理的集成测试。
3. 补充签名、公证和发布自动化。
4. 评估会话过期时间和磁盘配额的用户配置能力。
5. 增强 Skill 市场来源校验、版本展示和更新可见性。
6. 根据分段耗时和排队日志持续评估模型服务延迟、并发数和 Agent turns 上限。

## 最近验证

- 2026-06-28：`v2.2.2` 已完成 arm64 打包验证：微信桌面辅助模板改为截取当前微信窗口，并通过本地初筛和主进程受控多模态模型识别可见未读；API Key 只留在主进程配置，不传给自定义应用脚本。当前本机已验证 WeChat 可以置前并截取窗口区域，macOS Accessibility 只暴露窗口外壳，窗口截图路径能看到“微信游戏”等可见列表项，因此后续真实未读抽取应依赖多模态模型。`git diff --check` 通过；`npm test` 通过，124 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.2.2/`，包含 `QuarkfanTools-2.2.2-arm64.dmg`、`QuarkfanTools-2.2.2-arm64.zip`、`QuarkfanTools-2.2.2-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.2.2/build-arm64/`；核对 app 版本 `2.2.2`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime / Vision OCR helper 均为 arm64；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.2.1/` 和 `release/v2.2.2/`，已清理 `release/v2.2.0/` 以及 `release/arm64/` 下 2.2.0 旧分发文件。安装包仍未签名和公证。
- 2026-06-28：`v2.2.1` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`docs/PRD.md`、`docs/PRODUCT_HANDOFF.md`、`STATUS.md` 和产物名称已同步 2.2.1；微信草稿助手内置模板已可通过命令调用尝试激活 WeChat 并把草稿写入系统剪贴板，仍不搜索联系人、不自动粘贴、不自动发送、不读取微信数据库/协议/进程内存；`git diff --check` 通过；`npm test` 通过，122 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.2.1/`，包含 `QuarkfanTools-2.2.1-arm64.dmg`、`QuarkfanTools-2.2.1-arm64.zip`、`QuarkfanTools-2.2.1-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.2.1/build-arm64/`；核对 app 版本 `2.2.1`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.2.0/` 和 `release/v2.2.1/`，已清理 `release/v2.1.7/` 以及 `release/arm64/` 下 2.1.7 旧分发文件。安装包仍未签名和公证。
- 2026-06-28：在独立 worktree `/Users/edy/BlackLakeWork/QuarkfanTools-wechat-desktop-agent-poc` 验证微信桌面辅助 Agent PoC：新增 `electron/desktop-agent.ts` 动作计划与安全校验、`builtin-apps/wechat-draft-assistant/` 内置模板、自定义应用 `permissions.desktopAutomation` 权限诊断和 `docs/wechat-desktop-agent-poc.md`。`git diff --check` 通过；`npm test` 通过，121 项测试全部通过。该 PoC 未执行真实微信 UI 操作，未读取微信数据库、协议或进程内存，未开放自动发送。
- 2026-06-28：在 `docs/PRODUCT_HANDOFF.md` 和 `docs/operations.md` 补齐协作与发版隐性规范：未打包变更保留 `Unreleased`，形成正式版本号后必须同轮测试和打包，发版包含归档与 DMG 挂载检查，2.x 本地归档和 `release/arm64/` 只保留最近两个版本相关产物。本轮仅文档整理，未重新打包。
- 2026-06-28：新增 `docs/PRODUCT_HANDOFF.md`，整理产品接手阅读顺序、当前功能边界、1.8.3 客户 Skill 数据目录、企业微信封闭结论、下一阶段产品决策问题和新会话启动指令；README、`docs/AI.md`、`docs/PRD.md` 和 `CHANGELOG.md` 已同步入口。本轮仅文档整理，未重新打包。
- 2026-06-27：新增面向产品经理接手的 `docs/PRD.md`，补齐产品定位、版本演进历史、功能全景、权限边界、验收标准、限制和后续路线；README 与 `docs/AI.md` 已加入 PRD 入口；`git diff --check` 通过。本轮仅文档整理，未重新打包。
- 2026-06-27：飞书 CLI 选择顺序改为“Bot 显式路径 > 本机已安装 `lark-cli` > 内嵌 runtime”，并补充本机升级、回退和可信来源说明；`npm test` 通过，116 项测试全部通过。
- 2026-06-27：`v2.2.0` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.2.0；`npm test` 通过，114 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.2.0/`，包含 `QuarkfanTools-2.2.0-arm64.dmg`、`QuarkfanTools-2.2.0-arm64.zip`、`QuarkfanTools-2.2.0-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.2.0/build-arm64/`；核对 app 版本 `2.2.0`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 为 `icon.icns` 且 SHA-256 为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.1.7/` 和 `release/v2.2.0/`，已清理 `release/v2.1.6/` 以及 `release/arm64/` 下 2.1.6 旧分发文件。安装包仍未签名和公证。
- 2026-06-27：`v2.1.7` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.1.7；`npm test` 通过，114 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.7/`，包含 `QuarkfanTools-2.1.7-arm64.dmg`、`QuarkfanTools-2.1.7-arm64.zip`、`QuarkfanTools-2.1.7-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.7/build-arm64/`；核对 app 版本 `2.1.7`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 为 `icon.icns` 且 SHA-256 为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.1.6/` 和 `release/v2.1.7/`，已清理 `release/v2.1.5/` 以及 `release/arm64/` 下 2.1.4/2.1.5 旧分发文件。安装包仍未签名和公证。
- 2026-06-27：`v2.1.6` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.1.6；`npm test` 通过，112 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.6/`，包含 `QuarkfanTools-2.1.6-arm64.dmg`、`QuarkfanTools-2.1.6-arm64.zip`、`QuarkfanTools-2.1.6-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.6/build-arm64/`；核对 app 版本 `2.1.6`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 为 `icon.icns` 且 SHA-256 为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.1.5/` 和 `release/v2.1.6/`，已清理 `release/v2.1.4/`。安装包仍未签名和公证。
- 2026-06-27：`v2.1.5` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.1.5；`npm test` 通过，110 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.5/`，包含 `QuarkfanTools-2.1.5-arm64.dmg`、`QuarkfanTools-2.1.5-arm64.zip`、`QuarkfanTools-2.1.5-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.5/build-arm64/`；核对 app 版本 `2.1.5`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 为 `icon.icns` 且 SHA-256 为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.1.4/` 和 `release/v2.1.5/`，已清理 `release/v2.1.3/`。安装包仍未签名和公证。
- 2026-06-27：`v2.1.4` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.1.4；`npm test` 通过，110 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.4/`，包含 `QuarkfanTools-2.1.4-arm64.dmg`、`QuarkfanTools-2.1.4-arm64.zip`、`QuarkfanTools-2.1.4-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.4/build-arm64/`；核对 app 版本 `2.1.4`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 为 `icon.icns` 且 SHA-256 为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.1.3/` 和 `release/v2.1.4/`，已清理 `release/v2.1.2/`。安装包仍未签名和公证。
- 2026-06-27：企业微信官方 CLI 缓存初始化流程接入应用内操作：Bot 编辑弹窗新增“初始化/刷新企业微信 CLI 缓存”按钮，主进程使用当前 Bot 配置中的企业微信 Bot ID / Secret 写入隔离 `WECOM_CLI_CONFIG_DIR` 下的 `bot.enc`，并调用官方 MCP 配置接口写入 `mcp_config.enc`；默认轮询桥启动前检查 `bot.enc` 和 `mcp_config.enc`，缺失时给出应用内初始化提示；应用内手册、`?` 说明、需求、架构、运维和安全文档已同步。真实企业微信环境端到端仍需验证。
- 2026-06-27：`v2.1.3` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.1.3；`npm test` 通过，109 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.3/`，包含 `QuarkfanTools-2.1.3-arm64.dmg`、`QuarkfanTools-2.1.3-arm64.zip`、`QuarkfanTools-2.1.3-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.3/build-arm64/`；核对 app 版本 `2.1.3`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 为 `icon.icns` 且 SHA-256 为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式；当前 2.x 本地归档只保留 `release/v2.1.2/` 和 `release/v2.1.3/`，已清理 `release/v2.1.0/` 与 `release/v2.1.1/`，本地此前无 `v2.0.x` 归档目录。安装包仍未签名和公证。
- 2026-06-27：能力页完成多层级信息架构调整：默认进入治理总览，左侧分层导航切换诊断排障、MCP 服务、套件/Workflow、自定义应用和使用审计；MCP、套件、自定义应用详情仍通过原弹窗和 Manifest 编辑器进入；`npm test` 通过，108 项测试全部通过。
- 2026-06-27：企业微信新增内置默认轮询桥：未配置自定义“企业微信事件桥命令”时，WeCom Provider 会通过 `wecom-cli msg get_message` 定期拉取消息并归一化为事件；已有回调或轮询脚本时仍可填写自定义命令输出 NDJSON 覆盖默认行为；`npm test` 通过，109 项测试全部通过。
- 2026-06-27：按用户要求克隆官方 `WecomTeam/wecom-cli` 到 `github/wecom-cli/` 作为本地参考源码缓存，并在运维文档、AI 接续入口和状态文档记录 clone URL、当前 commit 与刷新方式；`github/` 已加入 `.gitignore`。
- 2026-06-25：`v2.1.2` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`README.md`、`docs/AI.md`、`STATUS.md` 和产物名称已同步 2.1.2；`npm test` 通过，108 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.2/`，包含 `QuarkfanTools-2.1.2-arm64.dmg`、`QuarkfanTools-2.1.2-arm64.zip`、`QuarkfanTools-2.1.2-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.2/build-arm64/`；核对 app 版本 `2.1.2`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 与 `assets/app-icon.icns` 哈希一致；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和 `/Applications` 快捷方式。安装包仍未签名和公证。
- 2026-06-23：能力页新增自定义应用和套件说明式 Manifest 编辑器：本地 `app.json` / `suite.json` 可在 UI 中编辑保存，保存失败会回滚；内置模板可复制为本地副本后再编辑。应用内手册补充模板起步、常用字段、Workflow steps 和保存校验说明；`npm test` 通过，108 项测试全部通过。
- 2026-06-23：`v2.1.1` 已完成 arm64 打包验证：版本号、根 `CHANGELOG.md`、应用内更新记录、`STATUS.md` 和产物名称已同步 2.1.1；`npm test` 通过，106 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.1/`，包含 `QuarkfanTools-2.1.1-arm64.dmg`、`QuarkfanTools-2.1.1-arm64.zip`、`QuarkfanTools-2.1.1-arm64.zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.1/build-arm64/`；核对 app 版本 `2.1.1`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；macOS app icon 与 `assets/app-icon.icns` 哈希一致；DMG 已通过 `hdiutil verify`，挂载后确认包含 `QuarkfanTools.app` 和 `/Applications` 快捷方式。安装包仍未签名和公证。
- 2026-06-23：`npm test` 通过，106 项测试全部通过；新增内置自定义应用和套件模板发现覆盖；恢复 macOS app icon 规范资源并验证 `scripts/prepare-app-icon.sh` 会复制 `assets/app-icon.icns` 到 `build/icon.icns`，两者 SHA-256 均为 `5a9a78d54c157f55672afea37037464858a87fd5f276fc8206787f366ed684cf`。本轮按用户要求未打包、未发布新版本。
- 2026-06-23：修复 UI 主题割裂和 MCP 新增无反馈问题：浅色主题补齐面板、表单、弹窗、列表、日志和详情视图覆盖层；配置页新增 MCP 会保留草稿并交由诊断提示缺命令，未配置启动命令的 stdio MCP 不进入 Agent、命令或定时任务执行目标；`npm test` 通过，104 项测试全部通过；本地构建窗口截图确认运行台浅色主题已统一。系统辅助访问权限未开放，未能用自动点击脚本完成 MCP 按钮端到端点击，但配置归一化和 resolver 已有测试覆盖。
- 2026-06-23：`v2.1.0` 已完成 arm64 打包验证：发布前确认已有 UI 功能均有闭环或明确建设中反馈；钉钉、HTTP/SSE MCP、webview/mcp-adapter/workflow 自定义应用入口不会被误列为可执行目标，旧配置命中不可执行入口时会得到明确错误；应用内手册、`?` 提示、根文档、变更记录和应用内更新记录已同步 2.1.0；`npm test` 通过，102 项测试全部通过；`npm run pack:mac` 通过，最终归档到 `release/v2.1.0/`，包含 `QuarkfanTools-2.1.0-arm64.dmg`、`QuarkfanTools-2.1.0-arm64.zip`、`zip.blockmap` 和 `latest-mac.yml`，构建中间 app 收入 `release/v2.1.0/build-arm64/`；核对 app 版本 `2.1.0`、主程序 arm64、内置 `lark-cli` / `wecom-cli` / Claude runtime 均为 arm64；`hdiutil verify` 校验 DMG 有效；`git diff --check` 通过。安装包仍未签名和公证。
- 2026-06-23：重建 `v2.1.0` arm64 DMG，镜像内已包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式，支持用户打开 DMG 后拖动安装；挂载检查确认 app 版本为 `2.1.0`，`hdiutil verify` 通过。
- 2026-06-23：使用手册和配置说明完成场景化收口：左上角手册新增飞书问答、企业微信接入、命令、定时任务、套件/Workflow、MCP 和升级恢复教程；MCP 新增 HTTP/SSE 占位配置与运行时隔离；能力页新增 IM / CONNECTORS 诊断；旧 `qah` 迁移备份新增覆盖测试；`npm test` 通过，101 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：确认后续聚焦 2.0 需求完成，1.x 系列分支已封版，后续仅作为历史兼容样本，不再作为同步目标。
- 2026-06-22：发布和升级策略收口：后续发布默认只考虑 arm64 / Apple Silicon；`npm run pack:mac` 改为 arm64 构建；旧 `qah` 数据迁移前新增本地备份目录；升级兼容与备份规则已写入需求、架构、运维、安全、决策和 2.0 矩阵。
- 2026-06-22：Workflow 和套件完成首版收口：Workflow steps 新增步骤输出变量、条件跳过、循环、失败恢复和 skipped 事件；套件新增版本/发布者/可信来源/标签、manifest 诊断、安装/升级/卸载生命周期和引用保护；能力页支持套件升级/卸载和诊断展示；`npm test` 通过，95 项测试全部通过。
- 2026-06-22：命令机制和定时任务完成收口：命令支持配置/新增 Skill、MCP、套件、Workflow 和 App 目标，能力 policy 可在 Bot 编辑器配置，命令冲突强提示已接入；定时任务支持 MCP capability、失败告警和独立定时任务中心；`npm test` 通过，87 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：缓存治理和自定义应用生命周期完成收口：文件缓存新增新鲜度状态、缺失文件命中保护和索引校验修复；自定义应用新增安装/升级/卸载生命周期、manifest 阻断诊断和引用保护；`npm test` 通过，91 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：Bot 维度能力治理完成收口：新增 Bot 治理控制台、能力使用审计 JSONL、审计汇总 IPC 和 UI 报表；`npm test` 通过，86 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：UI 集中调整：左侧 Logo 文案换行，定时任务运行历史改为摘要列表加详情弹窗，会话详情新增事件类型筛选和 JSON 导出；`npm test` 通过，85 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：MCP 协议诊断新增持久化探测日志，刷新诊断会记录握手结果、工具名摘要、退出码、signal 和 stderr 尾部，能力页展示最近一次探测结果；`npm test` 通过，77 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：文件缓存索引新增 `cachedAt` 展示和 90 天自动失效，清理过期索引时保护仍被其他索引引用的共享内容 hash；`npm test` 通过，78 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：能力扩展性集中收口：Workflow steps 新增输入模板、单步超时和重试，能力执行链强制 Owner 审批策略；`npm test` 通过，85 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：能力页新增扩展治理诊断，覆盖自定义应用风险、套件缺失依赖和 Workflow 步骤引用缺失；`npm test` 通过，79 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：命令映射新增别名和 `/help` 自动帮助列表，用户可查看当前 Bot 已启用命令、别名和说明；`npm test` 通过，80 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：定时任务版本合并治理完成首轮收口，任务定义和运行态字段分离，新增历史 cron 任务、2.0 retry 任务、旧状态文件和回滚升级形态兼容测试；`npm test` 通过，77 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：定时任务新增失败重试和暂停原因治理；`npm test` 通过，74 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：远端分支已整理：删除旧 1.x 维护分支，仅保留 `codex/v1.8.3-cron-scheduled-tasks`；`codex/2.0.0-stabilize` 已推送并同步进入远端 `main`。
- 2026-06-22：存储管理文件缓存索引新增单条删除，删除时保护仍被其他索引引用的共享内容 hash；`npm test` 通过，73 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：定时任务 UI 优化进入 2.0，Bot 编辑弹窗中的任务区改为列表操作 + 编辑弹窗模式，列表提供“立即执行”“编辑”“删除”；`npm test` 通过，72 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：新增 Bot 定时任务 5 段 cron 表达式计划类型，并优化 Bot 编辑弹窗中的定时任务配置 UI；`npm test` 通过，72 项测试全部通过；`git diff --check` 通过。
- 2026-06-21：已将 `v1.6.17` 每 Bot 隔离飞书事件订阅修复同步到 2.0 未发布变更；`npm test` 通过，70 项测试全部通过。
- 2026-06-20：`v2.0.3` 已同步 `v1.6.16` 修复并完成封版验证：`npm test` 通过，70 项测试全部通过；`npm run pack:mac` 已生成 arm64 与 x64 双平台安装包。产物版本均为 `2.0.3`，arm64/x64 主程序架构正确，内置 lark-cli 与 wecom-cli 为 universal binary，Claude runtime 分别为 arm64/x86_64。归档产物位于 `release/v2.0.3/`。
- 2026-06-19：`npm run pack:mac` 通过，`v2.0.2` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `2.0.2`，主程序架构分别为 arm64 与 x86_64，内置 lark-cli/wecom-cli 均为 universal。
- 2026-06-19：`npm test` 通过，67 个测试全部通过；新增飞书用户态 OAuth 摘要日志和 Bot 可用范围排障提示。
- 2026-06-19：`npm run pack:mac` 通过，`v2.0.1` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `2.0.1`，主程序架构分别为 arm64 与 x86_64，内置 lark-cli/wecom-cli 均为 universal。
- 2026-06-19：`npm test` 通过，67 个测试全部通过；新增真实现场形态覆盖：mention 名称命中但 mention open_id 不同于 bot info open_id 时仍路由到正确 Bot，且有 mention 时不使用事件头 App ID 判定目标。
- 2026-06-19：`npm test` 通过，65 个测试全部通过；`npm run pack:mac` 通过，重新生成 `release/arm64/QuarkfanTools-2.0.0-arm64.dmg`、`release/arm64/QuarkfanTools-2.0.0-arm64.zip`、`release/x64/QuarkfanTools-2.0.0-x64.dmg`、`release/x64/QuarkfanTools-2.0.0-x64.zip`；核对两个 app 版本均为 `2.0.0`、主程序架构分别为 arm64 与 x86_64、内置 lark-cli/wecom-cli 均为 universal。已将 `v1.6.9` 多飞书 Bot open_id 精确路由修复移植到 2.0，并补充 `aid` 连接层参数调查文档。
- 2026-06-19：从线上 `v1.6.6` 标签单独 worktree 重新打包封板版本，生成 `release/restored-v1.6.6/QuarkfanTools-1.6.6-arm64.dmg`、`release/restored-v1.6.6/QuarkfanTools-1.6.6-arm64.zip`、`release/restored-v1.6.6/QuarkfanTools-1.6.6-x64.dmg`、`release/restored-v1.6.6/QuarkfanTools-1.6.6-x64.zip`；标签测试 27 个全部通过，核对版本号和架构。
- 2026-06-19：`npm test` 通过，61 个测试全部通过；`npm run pack:mac` 通过，生成 `release/arm64/QuarkfanTools-2.0.0-arm64.dmg`、`release/arm64/QuarkfanTools-2.0.0-arm64.zip`、`release/x64/QuarkfanTools-2.0.0-x64.dmg`、`release/x64/QuarkfanTools-2.0.0-x64.zip`；核对 arm64/x64 主程序架构、两套 app 内 universal `wecom-cli`、Info.plist app icon；`git diff --check` 通过。安装包仍未签名和公证。
- 2026-06-19：`npm test` 通过，61 个测试全部通过；`git diff --check` 通过；新增 Agent runtime workspace 通道测试，覆盖企业微信主通道、飞书知识连接器、`CLAUDE.md`/`.quarkfan/cli-channels.json` 生成，以及 `qft-cli` wrapper 路由和凭据命令拦截。
- 2026-06-19：`npm test` 通过，59 个测试全部通过；`git diff --check` 通过；补齐企业微信事件桥命令的 Bot 编辑器配置入口、应用内手册说明和配置归一化覆盖。
- 2026-06-18：`npm test` 通过，59 个测试全部通过；`git diff --check` 通过；新增多 IM Provider 底座、企业微信官方 wecom-cli 调用模型首版适配、飞书知识连接器、结果投递路由配置模型，以及 Agent workspace 的 `CLAUDE.md`、`.quarkfan/cli-channels.json` 和 `qft-cli` wrapper。
- 2026-06-18：`npm test` 通过，55 个测试全部通过；`git diff --check` 通过；新增会话明细结构化时间线，按接收消息、Agent 可观察工作过程、长任务自动提示、最终回复和 workspace 文件清单组织存储管理详情。
- 2026-06-16：`npm test` 通过，30 个测试全部通过；新增 Bot 能力治理底座、自定义应用导入/预览/Bot 授权、存储缓存分离清理和应用内手册说明，版本仍保留在 `Unreleased`。
- 2026-06-16：`npm test` 通过，35 个测试全部通过；新增套件导入/预览/Bot 挂载授权，并同步能力治理文档入口、架构、运维与安全说明。
- 2026-06-16：`npm test` 通过，38 个测试全部通过；新增 Bot 定时任务模型、时间计算、运行记录、本机调度、Bot 编辑器配置和手册/运维/安全文档同步。
- 2026-06-17：`npm test` 通过，45 个测试全部通过；新增 Workflow 声明式步骤编排和步骤运行记录，支持 prompt step 与 capability step 顺序执行，并同步 2.0 设计、架构、运维、安全和状态文档。
- 2026-06-17：完成 2.0 原始范围质量扫描；在 `docs/2.0-design.md` 增加完成度矩阵，并修正架构文档中自定义应用定时任务调用状态的过期描述。
- 2026-06-17：`npm test` 通过，45 个测试全部通过；`git diff --check` 通过，完成度矩阵文档变更未引入构建或空白问题。
- 2026-06-17：`npm test` 通过，45 个测试全部通过；`git diff --check` 通过，新增存储管理中的定时任务最近运行历史，只读展示 `scheduled-runs.jsonl` 汇总和 Workflow 步骤摘要。
- 2026-06-17：`npm test` 通过，46 个测试全部通过；`git diff --check` 通过，新增 MCP 静态诊断和能力页 OK/WARN/ERROR 展示。
- 2026-06-17：`npm test` 通过，49 个测试全部通过；`git diff --check` 通过，新增 `LARK_CACHED_FILE` 受控飞书文件缓存协议，覆盖云盘下载和云文档导出首版。
- 2026-06-17：`npm test` 通过，51 个测试全部通过；`git diff --check` 通过，新增裸 `lark-cli drive +download/+export` Bash 拦截、运行历史筛选和 MCP 诊断刷新。
- 2026-06-18：`npm test` 通过，52 个测试全部通过；`git diff --check` 通过，新增存储管理文件缓存索引只读展示和 Bot/来源筛选。
- 2026-06-18：`npm test` 通过，52 个测试全部通过；`git diff --check` 通过，新增 Bot 定时任务手动立即运行，并保持手动运行不扰动原自动计划时间。
- 2026-06-18：`npm test` 通过，53 个测试全部通过；`git diff --check` 通过，新增 MCP stdio 协议握手和 `tools/list` 工具列表预览诊断。
- 2026-06-18：`npm test` 通过，54 个测试全部通过；`git diff --check` 通过，MCP 协议诊断失败时新增退出码、signal 和 stderr 尾部展示。
- 2026-06-18：`npm test` 通过，54 个测试全部通过；`git diff --check` 通过，新增 Skill、自定义应用和套件卡片打开资源所在目录，并把会话明细视图、长任务自动提示补入 2.0 需求。
- 2026-06-16：`npm test` 通过，35 个测试全部通过；新增 Bot 级 `/xxx` 命令映射、命令模板、自定义应用命令执行链路与手册/运维/安全文档同步。
- 2026-06-16：`npm test` 通过，31 个测试全部通过；新增应用级主题切换（系统/浅色/深色）和 logo 品牌区接入，并同步应用内手册说明。
- 2026-06-16：`npm test` 通过，30 个测试全部通过；飞书消息附件下载前缓存命中已接入，同一 Bot 跨会话引用同一消息资源 key 时可复用缓存；Agent 直接调用 lark-cli 下载/导出的路径仍待受控 helper 接入。
- 2026-06-16：新增 2.0.0 设计草案，明确 Bot 定时任务、MCP、自定义应用、套件、命令机制和主题切换的模型与实施顺序。
- 2026-06-16：检查 2.0.0 接续文档；补齐会话正文存储、魔介问答参考 Skill 拆分和应用内手册存储管理说明。
- 2026-06-16：`npm test` 通过，27 个测试全部通过；`v1.6.6` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `1.6.6`，主程序架构分别为 arm64 与 x86_64。
- 2026-06-16：`npm test` 通过，27 个测试全部通过；新增会话对话记录展示、存储行布局修复和默认 Agent 工作过程日志。
- 2026-06-16：`npm test` 通过，27 个测试全部通过；左下角多 Bot 聚合状态文案构建通过。
- 2026-06-16：`npm test` 通过，27 个测试全部通过；新增左上角 Logo 应用内使用手册入口和手册弹窗构建通过。
- 2026-06-16：`npm test` 通过，27 个测试全部通过；`v1.6.5` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `1.6.5`，主程序架构分别为 arm64 与 x86_64。
- 2026-06-16：`npm test` 通过，27 个测试全部通过；新增 Bot 用户态 OAuth 额外 scope 配置、合并与去重覆盖，并验证配置页 Bot 列表、编辑弹窗和配置说明弹窗构建通过。
- 2026-06-16：`npm test` 通过，25 个测试全部通过；`v1.6.4` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `1.6.4`，主程序架构分别为 arm64 与 x86_64。
- 2026-06-16：`v1.6.3` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `1.6.3`，主程序架构分别为 arm64 与 x86_64。
- 2026-06-15：`v1.6.0` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `1.6.0`，主程序架构分别为 arm64 与 x86_64。
- 2026-06-15：`npm test` 通过，23 个测试全部通过；新增延后下载协议和工作进度配置迁移覆盖。
- 2026-06-15：`npm test` 通过，19 个测试全部通过；覆盖 Owner 升级协议、跨会话并发限流、用户态文档搜索授权参数和无害 reaction 事件日志过滤。
- 2026-06-15：确认 Agent 实际通过 lark-cli 用户态读取飞书文档；定位 sandbox 代理 TLS 校验和缺少 `search:docs:read` 权限问题，并验证 sandbox 外用户态文档读取成功。
- 2026-06-15：普通浏览器 Vite 预览无法完成 UI 交互验收，因为渲染层依赖 Electron preload 注入；构建和类型检查通过。
- 2026-06-15：`npm test` 通过，13 个测试全部通过；新增本地技能市场管理、大量 Skill 授权交互和消息分段耗时后构建通过。
- 2026-06-15：`v1.5.1` 已生成并核对 arm64 与 x64 的 DMG 和 ZIP；两个应用包版本均为 `1.5.1`，主程序架构分别为 arm64 与 x86_64。

执行新验证后，应更新本节日期、命令和结果。
