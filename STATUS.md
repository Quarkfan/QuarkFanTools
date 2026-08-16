# 当前状态

最后更新：2026-08-16

## 父项目定位

当前仓库已清理为 QuarkfanTools 平台父项目，用于统一管理各独立模块。父项目不再直接承载 macOS 单机版应用源码。

路线边界：`QuarkfanTools-Single/` 是 2.x 单机版业务延续线。MG / CH / MH / CR / Runtime / Scheduler / Resource / Governance / Console 已形成可部署的 3.0 平台。迁移 2.x 时只迁移能力语义和验收标准，表现与实现必须服从新架构。

## 子模块

| 模块 | 路径 | 远端 | 状态 |
| --- | --- | --- | --- |
| QuarkfanTools 单机版 | `QuarkfanTools-Single/` | `git@github.com:Quarkfan/QuarkfanTools-Single.git` | 2.x 单机版业务延续线；已从原仓库完整历史克隆并推送 `main` 与全部历史 tags，当前指向 `3e73523`，产品版本 `2.3.2`。 |
| Message Gateway | `Message-Gateway/` | `git@github.com:Quarkfan/Message-Gateway.git` | 可部署实现已完成并推送，当前本地指向 `409ea2c`。 |
| Context Hub | `Context-Hub/` | `git@github.com:Quarkfan/Context-Hub.git` | 可部署上下文、检索和记忆治理实现已完成并推送，当前本地指向 `a140169`。 |
| Model Hub | `Model-Hub/` | `git@github.com:Quarkfan/Model-Hub.git` | 可部署多模型 provider、路由、失败切换和用量实现已完成并推送，当前本地指向 `d14bb96`。 |
| Capability Registry | `Capability-Registry/` | `git@github.com:Quarkfan/Capability-Registry.git` | 可部署能力注册、导入、绑定、隔离执行与内置能力实现及安全硬化已推送，当前指向 `910ed4b`。 |
| Platform Contracts | `Platform-Contracts/` | `git@github.com:Quarkfan/Platform-Contracts.git` | 共享合同与 JSON Schema 已完成，当前本地指向 `0d56217`；远端仓库待创建。 |
| Runtime Center | `Runtime-Center/` | `git@github.com:Quarkfan/Runtime-Center.git` | Runtime、工作空间、会话、工作流与 Browser Worker 已部署，当前本地指向 `c7f1f0a`；远端仓库待创建。 |
| Scheduler Center | `Scheduler-Center/` | `git@github.com:Quarkfan/Scheduler-Center.git` | 调度、立即执行、重试、日志与历史补处理已部署，当前本地指向 `c9d5dd0`；远端仓库待创建。 |
| Resource Center | `Resource-Center/` | `git@github.com:Quarkfan/Resource-Center.git` | 资源、诊断、清理与 FFmpeg 已部署，当前本地指向 `4a568b6`；远端仓库待创建。 |
| Governance Center | `Governance-Center/` | `git@github.com:Quarkfan/Governance-Center.git` | 策略、审批、凭据、脱敏与审计已部署，当前本地指向 `00af054`；远端仓库待创建。 |
| Platform Console | `Platform-Console/` | `git@github.com:Quarkfan/Platform-Console.git` | 账号密码、RBAC、配置控制、状态与诊断 Dashboard 已部署，当前本地指向 `0866923`；远端仓库待创建。 |
| Platform Deployment | `Platform-Deployment/` | `git@github.com:Quarkfan/Platform-Deployment.git` | Compose、备份恢复、smoke、E2E 与 UI acceptance 已部署，当前本地指向 `a896c5f`；远端仓库待创建。 |
| Reference Projects | `Reference-Projects/` | 父项目目录 | 用于管理 `docs/platform-reference-matrix.md` 中参考项目的本地源码阅读、综合评估和借鉴点抽取；已完成 MG / CH / MH / CR 参考评估，本地 clone 的上游源码放在 `Reference-Projects/sources/` 且不提交。 |

## 操作约定

- 2.x 单机版开发、测试、打包、发版和客户问题处理进入 `QuarkfanTools-Single/`。
- MG / CH / MH / CR 等多模块工作默认视为 3.0/5.0 平台化蓝图或未来实现，不与 2.x Single 普通开发强绑定。
- Message Gateway 设计和后续实现进入 `Message-Gateway/`。
- Capability Registry 设计和后续实现进入 `Capability-Registry/`。
- 父项目只提交 `.gitmodules`、子模块 gitlink、顶层导航文档和平台总设计文档。
- 平台总设计文档在 `docs/`；子模块专属设计文档放在对应子模块内。
- `docs/platform-reference-matrix.md` 是各中心建模参考矩阵，用于提供开源项目拆解、对照和反例检查，不作为任何中心的强制实现方案。
- `Reference-Projects/` 是参考项目源码级评估工作区，可以本地 clone 开源项目，但只提交我们的评估记录、抽取结论和管理说明。
- 子模块更新流程：先在子仓库提交并推送，再回到父项目更新 gitlink。

## 最近验证

- 2026-08-16：3.0 十一个生产应用服务已部署到 `zwj-ubuntu` 并全部健康；完整 Compose E2E 在全栈重启前后均通过，覆盖 Browser 审批续跑、Media、Resource、Context、Scheduler、MG/Runtime 及诊断包链路。
- 2026-08-16：在线与 quiesced 备份覆盖 PostgreSQL 和五个持久卷，自动完成 SHA-256、数据库目录和归档可读性校验；quiesced 路径只在所有服务恢复 healthy 后返回。
- 2026-08-16：Dashboard 15 个页面完成桌面和移动端 Playwright 布局验收，无横向溢出和控件裁切；新增可搜索的常驻“使用手册”，覆盖首次配置、日常操作、故障排查与安全维护。
- 2026-08-16：在完整备份验证后清除了所有可明确归属于 acceptance 租户的数据库、资源、工作空间和能力包数据；管理员、默认系统助手、默认上下文、内置能力及无法证明归属的治理决策均保留。后续完整验收退出时自动执行同范围清理。
- 2026-08-16：MG 新增飞书用户 OAuth、token 轮换和 Sheets/Base 受管数据 API；CR 注册对应读写能力，写操作为高风险审批能力。
- 2026-08-16：Browser Agent 通过 MH 规划与 Playwright 执行，默认阻断 localhost、私网 IP 和 DNS 解析到私网的请求；服务器生产环境已恢复该默认策略。
- 2026-08-16：生产 Dashboard 已通过部署仓库的 Caddy HTTPS profile 发布到 `https://tool.quarkfan.com`；Console 收回主机 loopback，HTTP/IP 入口统一跳转规范 HTTPS 域名，Secure Cookie、HSTS、证书链和 12 项服务健康检查均已验证。
- 3.0 当前完整事实、受控降级和验证记录见 `docs/3.0-current-release.md`。

- 2026-08-15：3.0 路线已从“只做远期 Linux 蓝图”调整为“server-ready 优先准备”。新增 `docs/server-readiness-roadmap.md`，明确 Single 不进入本轮服务器化优先工作，MG / CH / MH / CR 需要尽快从蓝图进入可启动服务骨架、HTTP/RPC 管理面、健康检查、存储抽象、Docker 路径和端到端 server smoke test。
- 2026-07-23：`QuarkfanTools-Single` 当前产品版本为 `2.2.15`，本轮 2.x 工作仍在子模块内接续。后续普通客户问题、功能修复、打包和验证应直接进入 `QuarkfanTools-Single/`，先读该子模块 `AGENTS.md`、`docs/AI.md`、`STATUS.md`；不要把 2.x Browser Agent、OMS、魔表、OAuth、运行台和打包问题强行切到 MG / CH / MH / CR 平台化中心。最新 2.2.15 arm64 本地产物和哈希已记录在 `QuarkfanTools-Single/STATUS.md` 与 `QuarkfanTools-Single/docs/operations.md`。
- 2026-08-15：`QuarkfanTools-Single` 当前产品版本为 `2.3.2`，本轮已提交并推送 2.x 当前代码状态；`npm test` 通过 257 项。`Context-Hub` 已提交并推送 memory binding / generation trace 蓝图更新，父项目同步更新子模块 gitlink。
- `QuarkfanTools-Single` 已完成 `v2.2.15` 版本提交，父项目 gitlink 已更新到该提交；推送和标签发布仍按子模块发布流程执行。
- `Message-Gateway` 已推送 `main` 到远端；新增 `docs/implementation-blueprint.md`，覆盖 MG P0 数据模型、管理面 API、存储布局、状态机、入站/出站流程、适配器合同、测试矩阵、迁移步骤和验收标准。
- `Context-Hub` 已建立独立模块目录，新增 `AGENTS.md`、`README.md`、`STATUS.md`、`docs/context-hub.md` 和 `docs/implementation-blueprint.md`。
- `Model-Hub` 已建立独立模块目录，新增 `AGENTS.md`、`README.md`、`STATUS.md`、`docs/model-hub.md` 和 `docs/implementation-blueprint.md`。
- `Capability-Registry` 已建立独立模块目录，新增 `AGENTS.md`、`README.md`、`STATUS.md`、`docs/capability-registry.md` 和 `docs/implementation-blueprint.md`。
- 父项目和 MG / CH / MH / CR / 单机版子项目均有独立接续入口：`AGENTS.md`、`README.md`、`STATUS.md` 或 `docs/AI.md`。
- Context Hub（CH）已正式命名；它替代原知识中心命名，覆盖知识、RAG、短期记忆、中期记忆、长期记忆、freshness 和上下文治理。
- CH 可执行设计蓝图已覆盖 P0 DTO、模块边界、存储布局、管理面 API、source 入库、上下文召回、记忆候选/确认/遗忘、适配器合同、UI 可见性、清理策略、迁移阶段、测试矩阵和验收标准。
- CH 第一轮参考项目已本地浅克隆到 `Reference-Projects/sources/`：AnythingLLM、Open WebUI、Dify、LlamaIndex；已新增源码级评估记录 `Reference-Projects/evaluations/context-hub/anythingllm-openwebui-dify-llamaindex-first-pass.md`。记忆方向建议后续补充 Mem0 / OpenMemory、Letta、Zep / Graphiti、LangGraph / LangMem。
- Model Hub 第一轮参考项目已本地浅克隆或复用到 `Reference-Projects/sources/`：LiteLLM、Ollama、vLLM、Open WebUI、Dify；已新增源码级评估记录 `Reference-Projects/evaluations/model-hub/litellm-ollama-vllm-openwebui-dify-first-pass.md`。后续建议补充 ComfyUI、AUTOMATIC1111 Stable Diffusion WebUI、InvokeAI、Diffusers。
- Capability Registry 第一轮参考项目已本地浅克隆或复用到 `Reference-Projects/sources/`：MCP TypeScript SDK、MCP Python SDK、MCP Servers、Dify、Open WebUI、LangChain；已新增源码级评估记录 `Reference-Projects/evaluations/capability-registry/mcp-dify-openwebui-langchain-first-pass.md`。Composio、n8n、Pipedream 因网络中断本轮只作为后续二级参考。
- 父项目 `git diff --check` 通过。
