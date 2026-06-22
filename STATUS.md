# 当前状态

最后更新：2026-06-22

## 当前基线

- 产品版本：`2.0.3`
- Git 分支：`codex/2.0.0-stabilize`
- 远端：`git@github.com:Quarkfan/QuarkFanTools.git`
- 运行平台：macOS Apple Silicon 与 Intel
- Agent 内核：`@anthropic-ai/claude-agent-sdk`
- 当前阶段：2.0.3 已同步 1.6.16 多飞书 Bot 修复；当前未发布变更已继续同步 1.6.17 每 Bot 隔离飞书事件订阅、Bot 专属 lark-cli HOME、启动可见日志和旧凭据 marker 迁移修复，并继续围绕真实 IM 端到端、诊断和发布签名收口

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
- 运行台日志默认记录 Agent 可观察工作过程，飞书进度消息仍由 Bot 配置控制。
- 运行台点击启动会立即记录本地启动日志；主进程记录启动请求和飞书身份确认阶段，lark-cli 配置校验、初始化和密钥降级短命令有 30 秒超时，避免启动卡住时无反馈。
- lark-cli 凭据 marker 加入 per-Bot HOME 版本，升级后会重新初始化 Bot 态配置，避免旧全局或旧 HOME 状态导致 `invalid_client`。
- Bot 支持长任务自动提示：超过配置秒数仍未完成时先回复一次配置文案，最终结果仍正常回复。
- 会话明细会按轮次记录接收消息、资源准备、Agent 可观察工作过程、长任务自动提示、最终回复和错误事件。
- 多 IM Provider 底座已接入：Bot 可选择飞书或企业微信作为消息平台；飞书知识连接器和结果投递路由与消息入口分离，支持企业微信接收、飞书资料检索、结果复制投递到飞书的结构。
- Agent 会话 workspace 会自动生成 `CLAUDE.md`、`.quarkfan/cli-channels.json` 和 `qft-cli` wrapper，让 Agent 通过统一 CLI 路由访问当前 Bot 已授权的平台通道。
- 打包链路已接入官方 `@wecom/cli` macOS universal runtime，arm64 与 x64 安装包都会携带企业微信 CLI；本地 `logo.png` 也会生成 macOS app icon。
- 2.0.0 能力治理底座初步实现：配置支持 Bot `capabilityRefs`，Runtime 输出统一能力目录，能力页支持导入和预览自定义应用，Bot 编辑器支持授权自定义应用。
- 应用级主题切换已实现，支持跟随系统、浅色和深色；左侧品牌区已接入本地 `logo.png`。
- Bot 级 `/xxx` 命令映射已接入，当前支持将命令配置到已授权 Skill、已授权套件、套件派生 Workflow 或已授权且声明 `commandCallable` 的自定义应用。
- 套件已接入能力治理目录，支持导入、预览、Bot 挂载授权，并可作为命令目标把套件说明、工作流和已授权子能力摘要注入 Agent 上下文。
- 套件下派生的 Workflow 已进入能力目录，可直接作为命令或定时任务 capability 目标执行，并复用父套件上下文。
- Workflow 已支持声明式步骤编排：当前支持 `prompt` 步骤和 `capability` 步骤，按顺序执行并把上一步输出传给下一步。
- Workflow 步骤执行已接入运行台日志；定时任务触发的 Workflow 会把步骤状态和短输出摘要写入 `scheduled-runs.jsonl`。
- Bot 级定时任务已接入：支持 `interval/daily/weekly/cron` 计划、`agent/command/capability` 目标、本机调度、chat 投递和运行记录。
- Bot 定时任务支持手动立即运行已保存且启用的任务，运行结果进入同一审计历史，且不扰动原本已计算的下一次计划时间。
- 存储管理已展示最近定时任务运行历史，可查看 Bot、任务、状态、耗时和详情；Workflow 定时任务会展示步骤摘要。
- 定时任务的 `capability` 目标已支持 Skill、套件和声明 `scheduledCallable` 的自定义应用，并补齐 `allowScheduledUse` 治理校验。
- Runtime Binding 已抽出统一 capability executor，Skill / 套件 / Workflow / 自定义应用的命令与定时任务执行分派不再散落在消息主流程。
- Runtime Binding 进一步拆分为 executable binding resolver 与 capability executor，命令和定时任务现在先解析 binding，再执行能力。
- MCP 已接入：支持全局 `stdio` 配置、能力目录展示、Bot 维度授权，并以严格 MCP 配置模式注入 Claude Agent SDK。
- MCP 配置诊断已接入能力页：静态检查启用状态、命令解析、cwd 可读性、环境变量缺值和 Bot 授权情况，并展示 OK/WARN/ERROR；手动刷新会短暂启动 `stdio` MCP 执行协议握手和工具列表预览。
- 受控飞书文件缓存 helper 已接入：Agent 可通过 `LARK_CACHED_FILE` 请求主进程下载云盘文件或导出云文档，优先命中应用级文件缓存，再把当前会话本地路径回灌给 Agent 继续分析。
- Runtime 会检测并拦截 Agent 通过 Bash 裸调 `lark-cli drive +download` 或 `drive +export`，引导走受控文件缓存 helper。
- 存储管理定时任务运行历史支持按 Bot 和状态筛选；能力页 MCP 静态诊断支持手动刷新。
- 存储管理已展示文件缓存索引，支持按 Bot 和来源类型筛选，并可单条删除缓存索引；共享内容 hash 会保留到最后一个索引引用删除。
- arm64 与 x64 独立安装包构建。

## 已知限制与风险

- macOS 安装包尚未签名和公证。
- Skill 市场只支持 HTTPS Git，不支持 SSH。
- 会话固定以 24 小时无活动为过期标准，暂不能在 UI 中调整。
- Agent 使用 `bypassPermissions`，安全主要依赖 Claude sandbox、目录隔离和 Skill 授权边界。
- PowerPoint 视觉预览依赖 macOS 自带 Quick Look；预览质量受系统支持影响。
- 自动化测试目前集中在配置迁移、飞书事件解析、Office 提取和会话键，端到端飞书与 UI 覆盖仍有限。
- 延后下载任务目前支持用户确认后立即进入队列，不支持 cron 或任意指定时间调度。
- 2.0.0 首版已从 `Unreleased` 固化并完成双架构打包验证。当前能力治理、命令、套件、Workflow、定时任务、MCP、主题和缓存拆分均已有代码落地，但完成度不同；权威矩阵见 `docs/2.0-design.md` 的“当前完成度矩阵”。
- 自定义应用首版仅覆盖导入、预览、Bot 授权、`node` 入口、命令调用和定时调用；`webview/ui`、`mcp-adapter`、市场、版本升级、签名校验和完整生命周期未完成。
- MCP 当前仅支持 `stdio` 配置、Claude Agent SDK 严格注入、静态配置诊断和手动协议探测；探测失败会展示退出码、signal 和 stderr 尾部。HTTP/SSE、持久化启动日志、直接命令绑定 MCP 和真实服务端到端专项验证未完成。
- Workflow 当前支持 prompt workflow 和顺序 steps；条件分支、循环、重试、超时、结构化变量、失败恢复、单步重跑和专门运行历史页未完成。
- 定时任务当前是本机应用运行期间触发；应用关闭期间不补偿执行，失败重试、告警和运行历史专页未完成。复杂日历已先通过 5 段 cron 表达式覆盖基础场景，但不支持秒级、`L/W/#` 等高级 cron 扩展。
- 飞书消息附件、受控云盘下载和受控云文档导出已支持下载前缓存命中；裸调 `lark-cli drive +download/+export` 已有运行时拦截，但其他未来下载入口仍需逐步纳入治理。缓存索引已支持单条删除，自动失效策略仍未完成。
- 企业微信 Provider 当前是官方 `wecom-cli <category> <method> <json_args>` 调用模型首版适配，已覆盖配置、事件归一化、回复、资源下载和投递路由代码路径；官方 wecom-cli 不提供事件长连接，监听当前需要配置 `providerOptions.eventCommand` 事件桥。尚未用真实企业微信 CLI 和企业微信环境做端到端验证。钉钉只完成结构预留，尚未实现 Provider。

## 后续优先事项

1. 按 `docs/2.0-design.md` 完成度矩阵继续收口 2.0，优先补端到端验证、MCP 协议级诊断、缓存 helper 和运行历史筛选。
2. 增加真实飞书事件、机器人隔离、命令/Workflow/定时任务和会话清理的集成测试。
3. 补充签名、公证和发布自动化。
4. 评估会话过期时间和磁盘配额的用户配置能力。
5. 增强 Skill 市场来源校验、版本展示和更新可见性。
6. 根据分段耗时和排队日志持续评估模型服务延迟、并发数和 Agent turns 上限。

## 最近验证

- 2026-06-22：存储管理文件缓存索引新增单条删除，删除时保护仍被其他索引引用的共享内容 hash；`npm test` 通过，73 项测试全部通过；`git diff --check` 通过。
- 2026-06-22：同步 1.8.x 的定时任务 UI 优化到 2.0，Bot 编辑弹窗中的任务区改为列表操作 + 编辑弹窗模式，列表提供“立即执行”“编辑”“删除”；`npm test` 通过，72 项测试全部通过；`git diff --check` 通过。
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
