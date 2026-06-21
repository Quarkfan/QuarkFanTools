# 安全说明

## 1. 保护目标

- 模型 API Key、飞书 App Secret、OAuth 状态和 Skill 市场 Token。
- 不同机器人之间的身份、消息、会话和 Skill 数据。
- 用户导入的 Skills、知识文件和会话附件。
- 主机文件系统免受非授权 Agent 访问。

## 2. 当前控制

- 配置文件以本机权限 `0600` 保存。
- 凭据、状态、workspace 和发布产物均不应提交到 Git。
- 每个机器人使用独立飞书 CLI 配置、Claude home、会话状态和 workspace。
- 每个运行中的机器人由独立 worker 进程承载；主进程只做 Supervisor、日志聚合和状态聚合。
- 每个机器人只映射明确授权的 Skills。
- 删除本地导入 Skill 时同步撤销所有机器人对该名称的授权，避免同名市场或内置 Skill 自动继承权限。
- Owner 人工请求只接受配置的 Owner open_id 发出的处理指令；待处理请求按机器人隔离保存。
- Claude sandbox 默认拒绝其他机器人和全局 Skill 路径，只放行当前执行所需目录。
- 当前 Bot 的 lark-cli 状态目录和 Bot 专属 HOME 需要读写以保存锁文件、缓存、日志、OAuth 加密材料和降级后的主密钥；sandbox 仅拒绝其他 Bot 的状态与 workspace。
- lark-cli 子进程统一设置 `HOME=state/bots/<bot-id>/lark-home`，官方用户态 OAuth 加密材料和 `master.key.file` 因此位于当前 Bot 状态目录下。Agent sandbox 不再放行真实 macOS 用户全局 `~/Library/Application Support/lark-cli/`。
- macOS Claude sandbox 允许访问系统 trustd，使内置 Go CLI 能校验受控网络代理的 TLS 证书；仍禁止 Agent 执行 unsandboxed 命令。
- Skill 市场限制为 HTTPS，避免依赖系统 SSH/Git 配置。
- Office ZIP 预处理限制为最多 5,000 个条目和 200 MB 解压体积。
- 会话清理默认保留配置、飞书授权和用户 Skills。
- 全局文件缓存由主进程管理并记录获准 Bot；Agent sandbox 不直接开放全局缓存目录。
- 用户可见工作进度只展示工具类别和状态，不输出模型私有推理、原始工具参数或凭据。

## 3. 重要风险

### Agent 工具权限

Claude Agent 允许 `Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Skill`，并采用 `bypassPermissions`。这意味着交互确认不是主要安全边界，必须持续依赖 sandbox、目录授权和机器人隔离。任何扩大允许路径的修改都需要安全审查。

macOS 上启用 `enableWeakerNetworkIsolation` 会开放对 `com.apple.trustd.agent` 的访问，以支持 lark-cli 等 Go CLI 在 sandbox 网络代理下验证 TLS。该能力比默认网络隔离更弱，存在额外数据外传面；不得同时允许 unsandboxed 命令，且应继续限制可访问目录和外部能力。

`state/bots/<bot-id>/lark-home/Library/Application Support/lark-cli/` 是当前 Bot 的 lark-cli 安全存储目录，包含该 Bot 的用户态 OAuth 加密凭据和 `master.key.file`。该目录随 Bot 状态隔离，不能授权给其他 Bot 或全局 workspace。

### Bot worker 隔离

`v1.7.0` 的默认隔离方式是进程级 worker。worker 仍运行在同一用户账户下，不等同于容器或系统用户级隔离；它的价值是隔离 lark-cli 长连接、Agent 会话、任务队列和崩溃影响面。Docker 容器隔离作为后续可选 driver，必须在不破坏默认自包含交付的前提下接入。

### Skill 供应链

用户导入 Skill 和 Skill 市场内容可能包含指令与脚本。应用当前不验证提交签名、来源信誉或内容安全。只应配置可信仓库，并在授予机器人访问前审查 Skill。

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
- 是否新增明文凭据、日志敏感信息或 Git 泄露风险？
- 是否改变了会话清理的保留边界？
- 是否引入新的外部下载、执行文件或供应链来源？
- 是否对压缩文件、附件大小和资源消耗设置上限？
