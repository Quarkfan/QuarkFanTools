# 3.0 Server Readiness Roadmap

本文记录 QuarkfanTools 3.0 服务器化准备路线。它替代此前“Linux 只是远期蓝图、先在 Single 里落 facade”的默认优先级，但不要求直接迁移 2.x Single。3.0 的正确方向是先建设可独立运行的 Headless Core、API Server、Worker 和 Web Console 基础，再逐步把 MG / CH / MH / CR 等中心做成可部署服务。

## 1. 当前判断

`QuarkfanTools-Single/` 继续作为 2.x 单机版业务线，不纳入本轮服务器化优先工作。3.0 需要从以下四个已经独立的中心开始：

- Message Gateway（MG）
- Context Hub（CH）
- Model Hub（MH）
- Capability Registry（CR）

当前四个中心都有设计文档、DTO、管理面 API 和验收口径，但仍缺少可运行实现、服务入口、持久化实现、集成测试和部署形态。因此 3.0 的第一目标不是继续扩文档，而是把中心合同变成可以启动、调用、检查和演进的 server P0。

## 2. Server P0 目标

Server P0 必须做到：

- 每个中心都有独立仓库内的最小服务骨架。
- 每个中心提供 HTTP API 或等价 RPC 边界，先不绑定 Electron IPC。
- 每个中心提供 `healthz`、`readyz`、`version`、`status` 和结构化日志。
- 每个中心有本地开发启动命令、配置样例、测试命令和 Docker 运行路径。
- 跨中心调用使用父项目 `docs/platform-interface-protocols.md` 中的 envelope / result / error 语义。
- 所有敏感字段只传 credentialRef、resourceRef、rawRef，不在普通日志和 diagnostics 中暴露原文。
- 所有可变状态先通过 repository 接口封装，P0 可用 SQLite 或文件存储，但不得把存储路径写死到业务逻辑。

Server P0 暂不承诺：

- 多租户 SaaS 级隔离。
- 任意客户上传 executable 并在服务器执行。
- 完整 RAG、知识图谱、长期记忆自动写入。
- 完整本地模型托管和大规模推理调度。
- 微信桌面辅助、macOS Vision OCR、Quick Look PPT 预览等本机桌面能力。

## 3. 优先级

### P0-A：共同基础

先在父项目冻结一组所有中心共用的基础约定：

- `PlatformEnvelope`
- `PlatformResult`
- `PlatformError`
- `PlatformEvent`
- `PlatformActor`
- `PlatformScope`
- `PlatformPolicyContext`
- `AppDataProvider`
- `ServiceHealth`
- `DiagnosticBundleScope`

这些约定可以先以文档和 JSON Schema / TypeScript 类型的形式存在，后续再抽为共享包。

### P0-B：Message Gateway

MG 是服务器化第一优先级，因为所有自动化都需要稳定消息入口和投递出口。

最小实现：

- Channel Registry
- Account Registry
- Lark OpenAPI / Webhook 优先适配，不把 `lark-cli` 作为服务端唯一入口
- InboundMessage normalizer
- Message Store
- Cursor
- Delivery log
- `channels list/status/capabilities/resolve/logs`
- `messages.query`
- `deliveries.query`
- `deliveries.retry`

验收标准：

- 一个飞书 Bot 可以以服务端方式接收消息、标准化、存储、查询、投递回复。
- 断线或重启后不会丢失 cursor 和 delivery 状态。
- 管理面可以看到 channel 是否可用、最近错误、下次重连、最近消息和投递结果。

### P0-C：Model Hub

MH 是第二优先级，因为服务器上模型 key、路由、失败切换和用量统计必须集中管理。

最小实现：

- Provider Registry
- CredentialRef 管理，不保存明文到普通配置
- OpenAI-compatible adapter
- Anthropic adapter
- routing policy：fixed / round-robin / random
- fallback policy
- health probe
- usage trace
- `mh.providers.*`
- `mh.models.*`
- `mh.selectModel`
- `mh.usage.summary`

验收标准：

- Runtime 或测试客户端只拿 attempt plan，不直接读 provider secret。
- 一个 provider 失败时可以按策略切到下一个。
- 管理面可见 provider status、model list、credential status、fallback attempts 和 usage summary。

### P0-D：Capability Registry

CR 是第三优先级，因为服务器环境必须先知道有哪些能力、哪些可以运行、哪些只可声明不可执行。

最小实现：

- CapabilityManifest
- CapabilityPackage
- CapabilityProvider
- CapabilityBinding
- CapabilityDiagnostic
- Skill adapter
- MCP manifest adapter
- executable adapter 只做登记和诊断，默认不允许在服务器执行
- import conflict rules
- diagnostics API

验收标准：

- Skill / MCP / executable 能被登记成统一能力清单。
- 同名能力导入时能选择新版本、旧版本或人工编辑。
- 服务器上不可执行的能力必须清楚显示原因，而不是静默失败。

### P0-E：Context Hub

CH 可以和 MG/MH/CR 并行启动，但完整 RAG 不应压在第一阶段。P0 先解决上下文入口、权限、freshness 和可见性。

最小实现：

- ContextSource
- ContextBinding / Bot Loadout
- ContextRecord
- keyword index
- retrieve API
- memory candidate
- confirmed memory
- generation trace
- forget / audit
- source freshness

验收标准：

- Skill knowledge、飞书文档缓存引用、会话摘要和确认记忆都能以统一结构召回。
- 召回结果必须带 source、scope、freshness、confidence 和 trace。
- 过期、未授权、已遗忘的上下文不会进入 runtime。

## 4. 推荐仓库建设顺序

1. 父项目：补齐共享协议文档、server P0 验收口径和中心间依赖图。
2. Message-Gateway：先落服务骨架和 Lark server adapter。
3. Model-Hub：落 provider / routing / fallback / usage 服务骨架。
4. Capability-Registry：落 capability manifest / package / diagnostics。
5. Context-Hub：落 source / retrieval / memory governance 最小闭环。
6. 新增 Runtime Center 仓库：在 MG、MH、CH、CR 有稳定 API 后再建设 runtime，否则容易继续耦合回单一内核。
7. 新增 Resource / Scheduler / Governance 仓库：先以共享协议和 adapter 形式服务前四个中心，再独立仓库化。

## 5. 服务器部署原则

- 优先 Docker 部署，避免直接依赖宿主机路径。
- 配置、状态、缓存、日志、workspace 必须分卷挂载。
- 默认单租户或单团队部署，多租户隔离后置。
- 服务端默认关闭任意 executable、自定义 app 自动执行和桌面自动化能力。
- 飞书能力优先走 OpenAPI / Webhook；`lark-cli` 可作为兼容 adapter，但不作为唯一服务端根基。
- Playwright 在服务器上必须走 Node + bundled Chromium 或容器内 Chromium，不依赖 Electron。
- 日志、排障包和 trace 必须按 Bot / tenant / center / correlationId 切片并脱敏。

## 6. 当前未实现清单

- 四个中心还没有服务入口、路由、控制器、repository、测试和 Dockerfile。
- 还没有共享协议包或 JSON Schema。
- 还没有 Runtime Center、Resource Center、Scheduler Center、Governance Center 独立仓库。
- MG 缺 Lark OpenAPI / Webhook server adapter 实现。
- MH 缺真实 provider 调用、健康检查、失败切换和用量统计实现。
- CR 缺 manifest registry、导入冲突处理、diagnostics 和 server 执行限制实现。
- CH 缺 source ingestion、keyword index、memory candidate、confirmed memory 和 forget/audit 实现。
- 还没有 Web Console。
- 还没有端到端 server smoke test。

## 7. 下一步动作

建议下一轮直接从 MG 开始建代码骨架，而不是继续扩设计。MG 的最小闭环完成后，再让 MH 提供模型选择，CR 提供能力清单，CH 提供上下文召回。这样 3.0 很快会从“蓝图”进入“可以跑起来”的阶段。
