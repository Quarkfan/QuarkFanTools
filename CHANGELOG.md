# Changelog

本文件记录 QuarkfanTools 应用变更。示例 Skill 的独立历史见
`skills/moje-qa-assistant-basic/CHANGELOG.md` 和
`skills/moje-qa-assistant-adv/CHANGELOG.md`。

## Unreleased

- 同步 `v1.6.17` 多飞书 Bot 监听修复：飞书 Provider 不再使用单共享事件入口，改为每个 Bot 使用独立 HOME/profile 维护自己的事件订阅，并继续在 Runtime 中按 mention 目标做跨 Bot 路由。此变更修复部分 Intel 客户环境下单共享入口只覆盖后启动 Bot 所属飞书应用的问题。
- 定时任务新增 5 段 cron 表达式计划类型，支持 `*`、列表、范围和步进；Bot 编辑弹窗中的定时任务配置改为计划、目标、投递分区展示，并按选择隐藏无关字段。
- Bot 编辑弹窗中的定时任务改为列表 + 编辑弹窗模式；列表直接提供“立即执行”“编辑”“删除”，详细计划、目标和投递参数进入弹窗配置。
- 定时任务新增失败重试治理：计划触发失败可按配置延迟重试，连续失败超过上限后自动停用并展示暂停原因。
- 存储管理的文件缓存索引支持单条删除；共享同一内容 hash 的缓存会保留到最后一个索引引用被删除。

## v2.0.3 - 2026-06-20

- 同步 `v1.6.16` 多飞书 Bot 修复：飞书事件监听改为同一应用进程内共享入口，收到事件后按 mention 目标路由到唯一目标 Bot，避免多个 `lark-cli event +subscribe` 长连接被飞书服务端分流。
- 飞书用户态 OAuth、lark-cli 降级密钥和加密凭据改为按 Bot 专属 `HOME` 隔离，Claude sandbox 不再放行真实用户全局 `~/Library/Application Support/lark-cli/`。
- 修复升级到 Bot 专属 HOME 后旧 lark-cli 凭据 marker 被继续信任，导致启动时报 `invalid_client / The auth method is not supported` 的问题。
- 运行台点击启动会立即写入本地日志；主进程记录启动请求和飞书身份确认阶段，lark-cli 配置校验、初始化和 keychain-downgrade 短命令增加 30 秒超时。
- 2.0 的企业微信 Provider 仍保持独立事件桥；本次共享入口只作用于飞书 Provider，不改变企业微信和后续钉钉的 Provider 边界。

## v2.0.2 - 2026-06-19

- 用户态 OAuth 完成日志改为摘要，避免运行台复制日志包含大段 scope 列表。
- OAuth 完成后新增飞书 Bot 可用范围提示：用户态 OAuth 只授权当前用户读取资料，不会把机器人开放给群内其他成员。
- 应用内手册和运维文档新增“群成员看到需要机器人主人允许”的排障说明，明确应检查飞书开放平台应用发布状态和可用范围。

## v2.0.1 - 2026-06-19

- 修正多飞书 Bot 群聊路由策略：现场事件确认 `mentions.id.open_id` 可能不同于 bot info 的 `open_id`，现在有 mention 时按 mention 名称、App ID、应用名和 open_id 等目标值匹配。
- 有 `mentions` 的群聊消息不再用事件头 `sourceAppId` 判定目标 Bot；`sourceAppId` 只在缺少 mention 元数据的旧事件中兜底，避免正确机器人被误忽略。
- 将同一修复同步到 1.6 维护线并发布 `v1.6.10`，避免 2.0 后续重复修复同类问题。

## v2.0.0 - 2026-06-19

- 将 `v1.6.9` 多飞书 Bot 群聊艾特修复带入 2.0：飞书 Bot 启动时确认真实 `open_id` 和应用名，群聊消息先按 mention 目标过滤，避免多个飞书 Bot 同时回复。
- 记录 `aid=552564` 调查结论：该值是飞书事件 WebSocket endpoint 的连接层参数，不是开放平台 `cli_...` App ID，不能用于 Bot 身份判断。
- 新增 Bot 级 `/xxx` 命令映射，可将命令路由到已授权 Skill、已授权套件、套件派生 Workflow 或已授权自定义应用，并支持 `{{args}}` Prompt 模板。
- 新增套件能力：支持导入包含 `suite.json` 的目录、在能力页预览、在 Bot 编辑弹窗中挂载授权，并可作为命令目标注入套件上下文执行。
- 新增 Bot 级定时任务：支持 `interval/daily/weekly` 计划、`agent/command/capability` 目标、本机调度与运行记录，并可把结果投递到指定 `chat_id`。
- 定时任务的 `capability` 目标现已支持已授权套件；Skill/Suite/App 的 capability 执行链已统一，并补齐 `allowScheduledUse` 治理校验。
- Runtime Binding 新增统一 capability executor，为后续 workflow、mcp-adapter 等可执行能力扩展预留稳定入口。
- Runtime Binding 进一步拆分为 executable capability binding resolver 与 capability executor，命令和定时任务不再直接分支 Skill/Suite/App 细节。
- 新增 suite 派生 Workflow 能力：已授权套件下的 Workflow 可直接作为命令和定时任务的 capability 目标执行。
- Workflow 支持声明式步骤编排：当前可按顺序执行 prompt step 和 capability step，并把上一步输出传给下一步。
- Workflow 步骤执行现在进入运行台日志；定时任务触发的 Workflow 会把步骤状态和短输出摘要写入运行记录。
- 存储管理新增定时任务最近运行历史，可查看 Bot、任务、状态、耗时和详情；Workflow 定时任务会显示步骤摘要。
- Bot 定时任务支持手动立即运行已保存且启用的任务，结果进入同一运行历史，且不会扰动原本已计算的下一次计划时间。
- 新增 MCP 能力：支持全局 `stdio` 配置、Bot 维度授权，并以严格 MCP 配置模式注入 Claude Agent SDK。
- 能力页新增 MCP 静态诊断，展示命令解析、cwd、环境变量和 Bot 授权问题，并以 OK/WARN/ERROR 标记配置状态。
- MCP 诊断刷新会短暂启动 `stdio` 服务执行协议握手和 `tools/list`，在能力页预览工具名，并在失败时展示协议错误、退出码和 stderr 尾部。
- 新增多 IM Provider 底座，Bot 可选择飞书或企业微信作为消息平台，并通过飞书知识连接器和投递路由支持“企业微信接收、飞书查资料、结果转发飞书”的两端场景；钉钉 Provider 已预留结构。
- 打包链路新增官方 `@wecom/cli` macOS universal runtime，arm64 与 x64 安装包都会携带 `wecom-cli`。
- 打包链路会从本地 `logo.png` 生成 macOS app icon，安装包不再使用 Electron 默认图标。
- Skill、自定义应用和套件卡片支持打开资源所在目录，便于复制、检查或备份资源文件。
- Bot 支持配置长任务自动提示秒数和文案，单次消息处理超时仍未完成时会先回复一次提示，最终结果仍正常回复。
- 存储管理会话详情新增结构化消息明细时间线，区分接收消息、Agent 可观察工作过程、长任务自动提示和最终回复，并继续展示 workspace 文件清单。
- 补充 2.0.0 原始范围完成度矩阵，明确能力治理、自定义应用、套件、Workflow、命令、定时任务、MCP、缓存和发布的已完成与未完成边界。

- 2.0.0 能力治理底座：新增 Bot `capabilityRefs` 配置、统一 Capability Registry/Resolver，并兼容旧版 `skillNames` 授权。
- 新增自定义应用能力：可导入包含 `app.json` 的本地应用目录，进入能力页预览，并在 Bot 编辑弹窗中显式授权。
- 存储管理拆分会话数据和文件缓存，可单独清理应用级内容哈希缓存。
- 下载前缓存命中开始落地：飞书消息附件下载会先按 Bot 和资源 key 查询文件缓存，命中时直接复用，避免同一 Bot 跨会话重复下载同一附件。
- 新增受控飞书文件缓存协议：Agent 可通过 `LARK_CACHED_FILE` 请求主进程下载云盘文件或导出云文档，优先复用应用级文件缓存，未命中再下载并回灌给同一会话继续分析。
- Runtime 会拦截 Agent 裸调 `lark-cli drive +download` 或 `drive +export` 的 Bash 操作，避免绕过受控文件缓存 helper。
- 存储管理中的定时任务运行历史支持按 Bot 和状态筛选；能力页 MCP 诊断支持手动刷新。
- 存储管理新增文件缓存索引只读视图，可按 Bot 和来源类型筛选消息附件、云盘下载和云文档导出缓存。
- 新增应用级主题切换，支持跟随系统、浅色和深色；左侧品牌区开始使用 `logo.png`。
- 左上角应用内使用手册新增“能力与自定义应用”、套件命令和主题说明。

## v1.6.6 - 2026-06-16

- 左上角 Logo 新增应用内使用手册入口，弹窗说明快速开始、模型配置、Bot、Skill 市场、运行台、飞书权限和存储管理。
- 左下角状态从全局 RUNNING/STOPPED 改为多 Bot 在线数量、监听数量和排队任务数。
- 存储管理会话详情新增最近对话记录展示，并修复会话行“查看”按钮换行问题。
- 运行台日志默认记录 Agent 可观察工作过程；飞书用户是否收到进度消息仍由 Bot 的工作过程开关控制。

## v1.6.5 - 2026-06-16

- Bot 配置新增用户态 OAuth 额外权限列表；发起授权时会与默认 `search:docs:read` 合并，便于按需申请 `drive:export:readonly`、`docs:document:export` 等飞书权限。
- 配置页的机器人区域改为列表展示；点击机器人后在弹窗中编辑和保存详细配置，并为配置项提供 `?` 说明弹窗。

## v1.6.4 - 2026-06-16

- 修复 Agent sandbox 拦截 `~/Library/Application Support/lark-cli/`，导致已完成用户态 OAuth 后仍无法读取全局加密凭据的问题。
- Agent 不再在飞书会话内引导用户执行 `lark-cli auth login` 或扫码授权；用户态 OAuth 统一通过应用配置页完成。

## v1.6.3 - 2026-06-16

- 修复 Agent sandbox 将当前 Bot 的 lark-cli 状态目录误拦截，导致飞书资料查询时无法创建 `locks/` 文件的问题。
- 保持多 Bot 隔离规则：仅拒绝其他 Bot 的状态与 workspace，允许当前 Bot 的飞书 CLI 状态目录读写。

## v1.6.2 - 2026-06-16

- 将单次 Agent 最大步数提升为可配置项，默认从 20 调整为 60，适配复杂 Skill 和飞书资料检索。
- Agent 达到最大步数时会向用户回复明确原因，不再只在运行台记录失败日志。

## v1.6.1 - 2026-06-16

- 修复本地导入多个同名 frontmatter Skill 时，后导入目录在技能市场不可见的问题；本地目录名会作为冲突时的显示名。
- 正在被任一 Bot 授权使用的本地 Skill 不允许删除，需先取消 Bot 授权。

## v1.6.0 - 2026-06-15

- 过滤飞书长连接中 reaction created/deleted 未注册处理器产生的无害 SDK 错误日志。
- 更新 moje-qa-assistant：本地知识不足时继续搜索飞书资料，并对 Office 文件优先预览、必要时下载后进行多模态分析。
- 新增飞书文件延后下载任务：先回复基本答案，用户确认后沿用原会话继续等待下载和分析。
- 新增应用控制的内容哈希文件缓存，并保持 Bot 隔离。
- Bot 可选择向用户展示限频的 Agent 工作进度，不输出模型私有推理。
- Skill 市场支持点击预览，导入同名 Skill 会明确报错；市场筛选和 Bot Skill 授权筛选体验优化。
- 存储管理支持点击查看会话详情和 workspace 文件清单。

## v1.5.1 - 2026-06-15

- 修复 macOS Agent sandbox 内 lark-cli 因无法访问 trustd 而不能读取或导出飞书文档的问题。
- 用户态授权新增飞书文档搜索权限，并明确云 PPT 使用用户态搜索和导出。

## v1.5.0 - 2026-06-15

- 新增本地技能市场管理页，展示 Skill 来源和描述，并支持删除用户导入的 Skill。
- Bot Skill 授权新增搜索，以及对当前筛选结果批量授权或取消。
- 添加处理中表情不再阻塞 Agent 启动，授权 Skill 链接改为并行同步。
- 新增资源处理、Agent、飞书回复和总耗时日志，便于定位回复慢的原因。
- 技能市场新增来源、未授权筛选和 Bot 授权概览。
- 修复跨会话并发上限未生效导致多人同时提问时资源争抢、部分消息长时间等待的问题，并展示排队任务。
- Bot 可配置 Owner；Agent 无法解决或需要人工授权时，会私聊 Owner 发送卡片并将 Owner 回复转回原提问人。
- lark-cli 在应用进程首次使用时校验实际配置，密钥链状态丢失后自动重新初始化，不再要求普通用户手工执行命令。

## v1.4.1 - 2026-06-14

- 应用侧栏新增可点击版本号，并提供面向用户的更新记录弹窗。
- 建立主版本、次版本和修订版本的更新规则，以及用户版更新记录维护要求。

## v1.4.0 - 2026-06-14

- 运行台改为每个注册机器人独立启动和停止监听。
- 点击机器人后查看其独立详细日志，并支持按日志等级筛选。
- 导入 Skill 只复制到本地 Skill 市场，默认不再授权给任何机器人。
- 单个机器人启动前同时校验机器人凭据与模型连接配置。
- 开发服务器未启动时自动回退到本地构建页面，避免 Electron 窗口黑屏。

## v1.3.2 - 2026-06-14

- 扩大 macOS 窗口可拖拽区域，增加顶部拖拽带，并保持按钮与表单正常交互。

## v1.3.1 - 2026-06-14

- 建立可独立接续工作的需求、架构、运维、安全、决策与状态文档。
- 修复残留或重复飞书事件订阅导致监听持续重连失败的问题。
- 应用限制为单实例，并避免旧事件流退出误删新重连流。

## v1.3.0 - 2026-06-14

- 新增基于 HTTPS Git 仓库的 Skill 市场，应用内置 Git 客户端，无需系统 Git。
- 新增按会话选择性清理存储数据。
- Office 文档改由应用内置 ZIP/XML 能力预处理，不依赖 Office、Python、Node 或 LibreOffice。
- 增加 Office 压缩包条目数和解压体积限制。

## v1.2.0 - 2026-06-13

- 内置 Word、PowerPoint 和 Excel Skills。
- PowerPoint 解析结合多模态模型与 macOS Quick Look 预览。
- 每个连续会话使用独立 workspace。
- 新增会话存储统计、过期清理和全部清理。

## v1.1.0 - 2026-06-13

- 新增连续会话和 24 小时上下文保持。
- 新增图片消息多模态处理。
- Agent 默认可调用当前机器人身份下的飞书 CLI。

## v1.0.0 - 2026-06-13

- 建立多飞书机器人配置、监听和隔离能力。
- 支持按机器人授权 Skills。
- 收到消息后添加处理中表情，并在任务结束后移除。
