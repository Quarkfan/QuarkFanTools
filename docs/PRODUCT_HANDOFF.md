# QuarkfanTools 产品交接说明

最后更新：2026-06-28

## 1. 交接目的

本文用于把 QuarkfanTools 从“开发推进阶段”交接到“产品决定下一阶段开发内容”的状态。新的产品经理、开发者或 AI 会话应先读本文，再进入 PRD、需求、架构和代码。

本文不替代详细需求文档：

- 产品全貌与历史：[`PRD.md`](PRD.md)
- 工程级需求：[`requirements.md`](requirements.md)
- 当前状态：[`../STATUS.md`](../STATUS.md)
- 端到端验证：[`2.0-e2e-checklist.md`](2.0-e2e-checklist.md)
- 发布与排障：[`operations.md`](operations.md)

## 2. 当前一句话状态

当前主线版本是 `2.2.3`。2.0 系列的主要能力已经完成代码落地和文档整理，企业微信 Provider 因官方能力限制暂时封闭；后续开发内容应由产品明确优先级后再推进。当前最明确的技术待办是：真实飞书端到端验证、真实 MCP 服务端到端验证、签名/公证/发布自动化，以及产品决定的高级扩展。

## 3. 新接手阅读顺序

建议新产品经理按以下顺序阅读：

1. [`PRD.md`](PRD.md)：先理解产品定位、用户、历史和功能全景。
2. [`../STATUS.md`](../STATUS.md)：确认当前版本、已完成、风险和最近验证。
3. [`2.0-e2e-checklist.md`](2.0-e2e-checklist.md)：理解还需要真实环境验证什么。
4. [`requirements.md`](requirements.md)：看工程验收口径和明确非目标。
5. [`2.0-design.md`](2.0-design.md)：看能力治理、命令、定时任务、MCP、自定义应用、套件和 Workflow 的设计初衷。
6. [`operations.md`](operations.md)：看客户安装、升级、排障和发布约束。
7. [`security.md`](security.md)：看权限、凭据、Bot 隔离和扩展能力风险。

开发者或 AI 会话还必须读 [`AI.md`](AI.md) 和仓库根目录 `AGENTS.md`。

## 4. 当前产品边界

### 4.1 已完成并可继续验证的能力

- 多飞书 Bot：独立配置、启停、日志、状态、会话和 Skill 授权。
- 飞书消息处理：私聊、群聊 @、处理中表情、最终回复、去重、断线重连。
- 飞书资料能力：用户态 OAuth、文档/Wiki/云盘/云 PPT 查找读取、受控文件缓存。
- Skill 市场：内置、用户导入、HTTPS Git 市场、预览、删除保护和 Bot 授权。
- Office 和多模态：图片、Word、Excel、PPT 预处理和 PPT 视觉预览。
- Owner 协作：Owner 私聊卡片、审批/协助回传。
- 能力治理：Bot capability refs、policy、审计、治理诊断。
- 命令机制：用户可配置和新增 `/xxx` 命令，支持别名、`/help`、保留命令保护和冲突提示。
- 定时任务：Bot 级任务、interval/daily/weekly/cron、立即运行、失败重试、失败告警、运行历史。
- MCP：stdio 配置、Bot 授权、Claude 注入、静态诊断、协议探测和工具列表预览。
- 自定义应用：导入、模板、manifest 编辑、命令调用、定时调用、升级、卸载和引用保护。
- 套件/Workflow：模板、导入、预览、授权、编辑、升级、卸载、Workflow steps、条件、循环、超时和重试。
- 存储管理：会话详情、事件筛选、JSON 导出、文件缓存索引、单条删除、90 天失效和索引修复。
- UI：浅色/深色主题、能力页多层级导航、应用内手册、配置项 `?` 提示、更新记录弹窗。

### 4.2 明确暂不继续推进的能力

- 1.x 分支：已封版，只作为历史兼容样本，不再作为同步目标。
- Intel x64：只作为历史版本兼容样本，后续默认只交付 arm64 / Apple Silicon。
- 企业微信 Provider：当前封闭，不启动监听、轮询、聊天列表、CLI 缓存初始化或投递路由。
- 钉钉 Provider：仅建设中占位，不启动监听。

### 4.3 预留但尚未完成的高级扩展

- 安装包签名、公证和发布自动化。
- 真实飞书端到端专项验证。
- 真实 MCP 服务端到端专项验证。
- MCP HTTP / SSE 运行时接入。
- 自定义应用 webview、mcp-adapter、应用市场和签名校验。
- Workflow 专门历史页、单步重跑、可视化编辑。
- 会话过期时间、文件缓存保留期和磁盘配额的 UI 配置。
- Skill 市场来源校验、版本展示、更新提醒和回滚。
- 企业微信重新开放方案，但必须先解决官方 CLI 事件能力或可维护事件桥问题。

## 5. 重要历史结论

### 5.1 1.x 到 2.x 的方向变化

1.x 是“飞书多 Bot Skill Agent”的稳定基础线，重点是 Bot 隔离、连续会话、Office 处理、Skill 市场、Owner、缓存和现场排障。

2.x 的核心变化是“能力治理平台”：Skill、MCP、自定义应用、套件、Workflow、命令和定时任务统一进入 Bot 维度授权边界。后续新增能力应优先进入 Capability Registry/Resolver/Executor，不应继续把新能力散落在消息主流程里。

### 5.2 企业微信为什么封闭

官方 `wecom-cli` 是调用型工具，命令形态是 `wecom-cli <category> <method> <json_args>`，不是飞书 `event +subscribe` 这种事件长连接。之前尝试过默认轮询桥、聊天列表和多个轮询 Chat ID，但轮询需要用户指定会话，体验和稳定性都不足。为了避免客户误以为企业微信实时机器人已可用，`v2.2.0` 起暂时封闭 UI 与运行时入口。

官方源码缓存位于本机 `github/wecom-cli/`，只用于参考，不提交到 QuarkfanTools Git。

### 5.3 1.8.3 客户侧 Skill 目录

`v1.8.3` 客户端中，用户导入的 Skill 是复制，不是软链接。

打包应用数据根目录：

```text
~/Library/Application Support/quarkfantools/
```

用户导入 Skill：

```text
~/Library/Application Support/quarkfantools/workspace/skills/<导入文件夹名>/
```

Git Skill 市场：

```text
~/Library/Application Support/quarkfantools/workspace/market-skills/
```

Agent 运行时会再把当前 Bot 已授权 Skill 复制到隔离目录：

```text
~/Library/Application Support/quarkfantools/workspace/bots/<bot-id>/sessions/<conversation-hash>/skills/<skill-name>/
~/Library/Application Support/quarkfantools/state/bots/<bot-id>/claude-home/skills/<skill-name>/
```

因此客户原始导入来源目录删除后，不影响已导入 Skill；但如果要人工恢复或迁移客户本地导入能力，应优先检查 `workspace/skills/`。

如果客户从更老的 `qah` 应用数据升级，旧数据会迁移到 `quarkfantools/`。2.1 以后迁移前还会在 `quarkfantools/backups/legacy-qah-<timestamp>/` 留备份。

### 5.4 飞书 CLI 升级路径

当前未发布变更已将飞书 CLI 解析顺序改为：

1. Bot 显式配置的 `cliPath`
2. 本机已安装的可信 `lark-cli`
3. 安装包内嵌 `runtime/lark-cli`

这让现场可以升级飞书 CLI 而不必等待 QuarkfanTools 重打包。无论使用哪个二进制，Bot 的 HOME、profile、配置目录和 OAuth 状态仍按 Bot 隔离。

## 6. 下一阶段必须由产品先决定的问题

后续开发不要默认继续“看到能做就做”，应先由产品明确优先级。建议产品先回答：

1. 下一版本是继续做稳定性/验证，还是做新能力？
2. 企业微信是继续封闭，还是投入重新设计接入方案？
3. MCP HTTP / SSE 是否进入近期版本，还是继续占位？
4. 自定义应用下一步是应用市场、签名校验、webview，还是继续模板和编辑体验？
5. Workflow 下一步是可视化编辑、专门历史页、单步重跑，还是保持声明式配置？
6. 是否需要把会话过期时间、缓存保留期、磁盘配额做成 UI 配置？
7. 是否需要面向客户交付一个诊断包导出功能？
8. 下一版是否必须完成签名和公证？
9. 是否需要维护 `v1.8.3` 客户升级到 2.x 的专项迁移说明？
10. 产品验收优先级是飞书真实端到端、MCP 真实服务、UI 自动化，还是发布安装体验？

## 7. 下一轮开发建议分流

### 7.1 如果产品选择“稳定和验证”

优先做：

- 按 [`2.0-e2e-checklist.md`](2.0-e2e-checklist.md) 跑真实飞书端到端。
- 增加多 Bot、命令、定时任务、Workflow、会话清理的集成测试。
- 准备真实 MCP stdio 服务验证样例。
- 建立 UI 自动化验收脚本。

### 7.2 如果产品选择“发布可交付”

优先做：

- 签名、公证、安装体验和 Gatekeeper 验证。
- 发布产物自动归档和最近版本保留策略固化。
- 客户升级手册，包括 1.8.3 Skill 目录、旧 `qah` 迁移和本机备份。

### 7.3 如果产品选择“能力扩展”

优先做：

- MCP HTTP / SSE 真实运行时接入。
- 自定义应用市场和签名校验。
- Workflow 可视化编辑和运行历史页。
- 更多内置行业套件和应用模板。

### 7.4 如果产品选择“企业微信”

先做产品和技术评审，不要直接恢复旧轮询：

- 明确用户真实使用场景是机器人私聊、群聊、群机器人，还是只要结果投递。
- 确认企业微信官方能力是否能提供稳定事件入口。
- 如果只能轮询，明确轮询对象发现、授权、频率、去重、历史窗口和多会话体验。
- 若体验不成立，继续封闭，并把企业微信定位为后续研究项。

## 8. 新会话启动指令

新开 Codex 会话时，可以直接发送以下指令：

```text
这是 QuarkfanTools 项目，请先按顺序阅读 docs/AI.md、docs/PRODUCT_HANDOFF.md、docs/PRD.md、STATUS.md、docs/requirements.md、docs/2.0-e2e-checklist.md。当前 2.2.3 已完成主要 2.0 能力收口，企业微信 Provider 暂时封闭，1.x 系列封版，后续默认只考虑 arm64。接下来的开发内容由产品决定，请先基于 PRODUCT_HANDOFF 和 PRD 梳理“下一版可选方向、风险、验收口径和建议优先级”，不要直接写代码，等我确认方向后再进入实现。
```

如果产品已经给出明确方向，可以把最后一句替换为：

```text
产品已决定下一步做：<这里写方向>。请先基于 PRODUCT_HANDOFF 和 PRD 找出受影响模块、文档和测试，再给出执行计划；除非我明确要求，否则不要打包发版。
```

## 9. 隐性协作与发版规范

这些规则来自前期实际协作，后续不能只靠聊天记录记忆，必须作为交接默认约定执行。

### 9.1 开发协作默认规则

- 用户没有明确要求“只分析/只出方案”时，默认需要把可直接完成的实现、文档和验证一起推进到闭环。
- 但当前交接后，新增开发内容必须先等产品确定方向；没有产品方向时，只做梳理、评估和计划，不直接写功能代码。
- 每次修改需求、运行结构、配置、数据路径、用户行为或发布方式，都必须同步更新相关文档。
- 不要把聊天记录当成唯一需求来源，稳定结论必须落到仓库文档。
- 真实端到端验证、签名、公证和客户升级属于高优先级交付风险，不要在总结里说成已完成。
- 工作区可能有历史改动，不能回滚未确认属于自己的改动。

### 9.2 版本号和发版规则

- 尚未准备打包的变化一律留在 `CHANGELOG.md` 的 `Unreleased`。
- 一旦决定形成正式版本号，必须同步更新：
  - `package.json`
  - `package-lock.json`
  - `CHANGELOG.md`
  - `electron/release-notes.ts`
  - `README.md`
  - `docs/AI.md`
  - `STATUS.md`
- 形成具体版本号并写入版本记录后，必须在同一轮执行 `npm test` 和 `npm run pack:mac`。
- 未执行打包验证的变更不能声称“已发布”，只能说“未发布变更”或“待发版”。
- 当前默认只发 arm64 / Apple Silicon；Intel x64 只作为历史兼容样本，不作为当前发布目标。
- 当前安装包未签名、未公证。总结中必须明确“安装包仍未签名和公证”，不能把“成功打包”说成“可无提示安装”。

### 9.3 发版归档和保留规则

- `release/` 是本地产物目录，不提交 Git。
- 每个正式版本必须归档到独立目录，例如：

```text
release/v2.2.0/
```

- 版本归档目录根部保留面向客户的 DMG、ZIP、`zip.blockmap` 和 `latest-mac.yml`。
- 打包生成的中间 `.app` 放入版本目录下的 `build-arm64/`，不作为面向客户的安装包。
- 本地 2.x 发布归档默认只保留最近两个版本目录。新版本打包、校验、挂载检查和归档完成后，清理更早的 `release/v2.*` 目录。
- `release/arm64/` 只是 electron-builder 的临时输出目录。完成版本归档后，也应只保留最近两个版本相关分发文件，避免旧包误发给客户。
- 历史恢复包或 1.x 封板包如果需要保留，应单独说明用途，不纳入 2.x 最近两个版本规则。

### 9.4 发版验证口径

一次完整发版至少包含：

1. 版本号和文档同步。
2. `npm test` 通过。
3. `npm run pack:mac` 通过。
4. 核对 app 版本号、主程序架构、内置 `lark-cli`、`wecom-cli` 和 Claude runtime 架构。
5. `hdiutil verify` 校验 DMG。
6. 挂载 DMG，确认包含 `QuarkfanTools.app` 和指向 `/Applications` 的快捷方式。
7. 归档到 `release/vX.Y.Z/`。
8. 清理 2.x 旧归档，只保留最近两个版本。
9. 在 `STATUS.md` 记录命令、结果、归档路径、保留目录和未签名/未公证状态。

### 9.5 文档和应用内信息同步

- 用户可见能力或约束：更新 `docs/requirements.md`。
- 模块、数据流、隔离或会话规则：更新 `docs/architecture.md`。
- 配置、运行、排障、构建或发布：更新 `docs/operations.md`。
- 安全边界和风险：更新 `docs/security.md`。
- 重要技术取舍：更新 `docs/decisions.md`。
- 当前进度、已知问题和下一步：更新 `STATUS.md`。
- 已发布或待发布变更：更新 `CHANGELOG.md`。
- 应用内面向用户的更新记录：更新 `electron/release-notes.ts`。
- 文档入口变化：更新 `docs/AI.md` 和必要时更新 `README.md`。

## 10. 交接注意事项

- `release/` 是本地产物目录，不提交 Git。
- 客户环境问题优先确认版本号、安装包来源、应用数据目录和日志，再判断是否需要代码修改。
- 1.8.3 客户本地导入 Skill 是复制到 `workspace/skills/`，不是软链接；不要误导客户去找原导入目录。
- 企业微信当前封闭，除非产品明确决定重启，否则不要恢复旧轮询或半开放 UI。
- 如果产品要求“发一版”，按完整发版流程执行，而不是只改版本号或只打包。
