# 安全说明

## 1. 保护目标

- 模型 API Key、飞书 App Secret、企业微信 Corp Secret、OAuth 状态、连接器凭据和 Skill 市场 Token。
- 不同机器人之间的身份、消息、会话和 Skill 数据。
- 用户导入的 Skills、知识文件和会话附件。
- 主机文件系统免受非授权 Agent 访问。

## 2. 当前控制

- 配置文件以本机权限 `0600` 保存。
- 凭据、状态、workspace 和发布产物均不应提交到 Git。
- 每个机器人使用独立 IM CLI 配置、连接器配置、Claude home、会话状态和 workspace。
- 每个机器人只映射明确授权的 Skills。
- 每个机器人只挂载明确授权的能力引用；自定义应用导入后默认不授权给任何 Bot。
- 套件挂载只表示该 Bot 可见该能力包，不自动继承底层 Skill、自定义应用或 MCP 的执行权限；套件进入 Agent 上下文前仍必须与 Bot 实际授权求交集。
- Bot 命令映射只能指向当前 Bot 已授权能力；系统保留命令 `/new`、`/continue`、`/owner` 不允许被覆盖。
- 定时任务只能在当前 Bot 已授权范围内调用目标能力，不允许通过任务定义绕过命令或能力授权边界。
- MCP 服务只能来自本地配置，不允许通过聊天即时创建并执行；未授权 MCP 不进入当前 Bot 的 Agent 上下文。
- 删除本地导入 Skill 时同步撤销所有机器人对该名称的授权，避免同名市场或内置 Skill 自动继承权限。
- GUI 打开资源所在目录只允许已发现的 Skill、自定义应用和套件。渲染层只传资源类型和 ID，主进程重新解析目录，不接受任意路径打开请求。
- Owner 人工请求只接受配置的 Owner open_id 发出的处理指令；待处理请求按机器人隔离保存。
- Claude sandbox 默认拒绝其他机器人和全局 Skill 路径，只放行当前执行所需目录。
- 当前 Bot 的 lark-cli 状态目录需要读写以保存锁文件、缓存和日志；sandbox 仅拒绝其他 Bot 的状态与 workspace。
- lark-cli 官方用户态 OAuth 加密材料和降级后的主密钥位于 `~/Library/Application Support/lark-cli/`；Agent sandbox 为飞书资料检索放行该全局目录。这是当前 CLI 存储模型下的例外，不代表 QuarkfanTools 放开其他 Bot 的状态或 workspace。
- 受控飞书文件 helper 只按当前 Bot 和当前会话物化缓存文件。全局 `state/file-cache` 仍由主进程管理，Agent 不获得直接读取全局缓存目录的权限。
- 企业微信 Bot 读取飞书资料时必须通过 `connectors.lark`，不得复用其他 Bot 的飞书主平台凭据。
- 结果投递路由会把最终回复复制到另一个平台 chat，属于显式跨平台数据流；错误配置可能把企业微信消息处理结果发到飞书群，或反向发送到错误会话。
- Agent workspace 中的 `qft-cli` wrapper 只按 `.quarkfan/cli-channels.json` 中的授权 channel 路由，并拒绝登录、初始化和 keychain 降级等凭据命令。企业微信 `providerOptions.eventCommand` 是本地管理员配置的事件桥命令，不允许由聊天消息动态创建。
- Runtime 会检测 Claude Bash tool use 中裸调 `lark-cli drive +download` 或 `drive +export` 的行为并中止，避免绕过受控 helper、Bot 缓存索引和下载前命中治理。
- macOS Claude sandbox 允许访问系统 trustd，使内置 Go CLI 能校验受控网络代理的 TLS 证书；仍禁止 Agent 执行 unsandboxed 命令。
- Skill 市场限制为 HTTPS，避免依赖系统 SSH/Git 配置。
- Office ZIP 预处理限制为最多 5,000 个条目和 200 MB 解压体积。
- 会话清理默认保留配置、飞书授权和用户 Skills。
- 全局文件缓存由主进程管理并记录获准 Bot；Agent sandbox 不直接开放全局缓存目录。
- 存储管理将会话数据和全局文件缓存分开清理，避免用户清理上下文时误删长期复用缓存，或清理缓存时误删会话记录。
- 用户可见工作进度只展示工具类别和状态，不输出模型私有推理、原始工具参数或凭据。

## 3. 重要风险

### Agent 工具权限

Claude Agent 允许 `Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Skill`，并采用 `bypassPermissions`。这意味着交互确认不是主要安全边界，必须持续依赖 sandbox、目录授权和机器人隔离。任何扩大允许路径的修改都需要安全审查。

macOS 上启用 `enableWeakerNetworkIsolation` 会开放对 `com.apple.trustd.agent` 的访问，以支持 lark-cli 等 Go CLI 在 sandbox 网络代理下验证 TLS。该能力比默认网络隔离更弱，存在额外数据外传面；不得同时允许 unsandboxed 命令，且应继续限制可访问目录和外部能力。

`~/Library/Application Support/lark-cli/` 是官方 lark-cli 的全局安全存储目录，可能包含多个 profile 的加密凭据和 `master.key.file`。当前版本为了让 Agent 在 sandbox 内使用已授权的用户态文档能力放行该目录；后续若 lark-cli 支持按 Bot 指定安全存储目录，应优先迁移到 per-bot 存储。

### Skill 供应链

用户导入 Skill 和 Skill 市场内容可能包含指令与脚本。应用当前不验证提交签名、来源信誉或内容安全。只应配置可信仓库，并在授予机器人访问前审查 Skill。

### 自定义应用供应链

自定义应用包含代码入口，风险高于纯 Skill 说明。当前版本已允许通过 Bot 命令映射执行自定义应用，因此必须继续保证：

- 只有已授权给当前 Bot、且 manifest 声明 `commandCallable=true` 的应用才能被 `/xxx` 调用。
- 自定义应用运行目录限定在当前 Bot 当前会话的 app workspace，下游不应默认获得其他 Bot 状态、其他会话 workspace 或全局缓存访问权。
- Manifest 中的入口路径必须是导入目录内可控文件；不得把命令映射扩展为任意 shell。

导入自定义应用不应自动扩大任何 Bot 能力。

### 定时任务投递与滥用面

定时任务可以主动向飞书 chat 投递结果，因此需要额外控制：

- 任务定义只能由本地配置/UI 创建和修改，聊天消息不能直接创建即时执行的任意调度任务。
- `chat_id` 应视为投递目标配置的一部分；错误配置可能导致消息发错会话。
- 定时任务与普通消息共享并发上限，避免本机被高频任务压满。

### 套件供应链

套件本身不直接执行代码，但会影响后续 Agent、命令和定时任务的可见能力组织方式。导入套件时仍应审查其引用的 Skill、自定义应用、MCP 和工作流说明，避免通过套件名称、说明或工作流提示误导管理员错误授权。运行时注入 Agent 的套件摘要只能来自当前 Bot 已实际授权的底层能力，不得把未授权能力通过套件文案间接暴露为可调用资源。

Workflow 的 `capability` 步骤只能调用当前 Bot 已授权且 policy 允许的 Skill、套件或自定义应用；当前不允许递归调用 Workflow。导入套件时应把 `workflows[].steps` 视为可执行编排配置审查，而不是普通说明文本。

### MCP 进程风险

MCP 服务等价于本机工具能力扩展。虽然当前版本只支持显式配置的 `stdio` 类型，并且只有授权后才注入 Claude Agent SDK，但仍需注意：

- MCP 命令和参数不应来自不可信输入。
- 敏感环境变量只应写入本机配置，不进入 Git。
- 未授权 Bot 不应因为全局配置存在而自动获得 MCP 能力。
- MCP 诊断只做静态配置检查，不应被视为服务安全审计或工具权限审计；诊断 OK 只表示命令、cwd、env 和授权关系基本可用。

### 本机明文凭据

配置以受限文件权限保存在本机，但尚未使用 macOS Keychain。拥有用户账户或磁盘读取能力的攻击者仍可能取得凭据。

### Owner 人工授权

当前 Owner 授权代表人工给出处理结论，不会自动扩大 Agent sandbox、Skill 权限或执行任意待授权命令。Owner 必须具有飞书应用使用权限；错误配置或权限不足会导致卡片发送失败并向原提问人明确报错。

### 第三方模型

消息、附件内容和 Agent 上下文会发送到用户配置的模型服务。使用方必须确认该服务的数据处理与合规要求。

### 未签名应用

当前安装包没有代码签名和公证，无法提供发布者身份和安装包完整性的系统级保证。

## 4. 变更审查清单

- 是否扩大了 Agent 可访问的路径或工具？
- 是否可能让机器人看到未授权 Skill 或其他机器人数据？
- 是否可能让机器人调用未授权自定义应用、MCP 或后续能力？
- 是否新增明文凭据、日志敏感信息或 Git 泄露风险？
- 是否改变了会话清理的保留边界？
- 是否引入新的外部下载、执行文件或供应链来源？
- 是否对压缩文件、附件大小和资源消耗设置上限？
