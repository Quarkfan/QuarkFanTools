# 当前状态

最后更新：2026-08-16

## 父项目定位

当前仓库已清理为 QuarkfanTools 平台父项目，用于统一管理各独立模块。父项目不再直接承载 macOS 单机版应用源码。

路线边界：`QuarkfanTools-Single/` 是 2.x 单机版业务延续线。MG / CH / MH / CR / Runtime / Scheduler / Resource / Governance / Console 已形成可部署的 3.0 平台。迁移 2.x 时只迁移能力语义和验收标准，表现与实现必须服从新架构。

## 子模块

| 模块                 | 路径                    | 远端                                               | 状态                                                                                                                                                                                                                  |
| -------------------- | ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QuarkfanTools 单机版 | `QuarkfanTools-Single/` | `git@github.com:Quarkfan/QuarkfanTools-Single.git` | 2.x 单机版业务延续线；已从原仓库完整历史克隆并推送 `main` 与全部历史 tags，当前指向 `3e73523`，产品版本 `2.3.2`。                                                                                                     |
| Message Gateway      | `Message-Gateway/`      | `git@github.com:Quarkfan/Message-Gateway.git`      | 通道配置、可替换飞书后端与持久 Channel Provider 扩展控制面已完成，当前指向 `b65eae6`。                                                                                                                                |
| Context Hub          | `Context-Hub/`          | `git@github.com:Quarkfan/Context-Hub.git`          | 上下文、检索、记忆治理、projection 边界与持久 Source/Processor 扩展控制面已完成，当前指向 `c64a17a`。                                                                                                                 |
| Model Hub            | `Model-Hub/`            | `git@github.com:Quarkfan/Model-Hub.git`            | 多类型模型、路由、失败切换、用量与持久 Model Adapter 扩展控制面已完成，当前指向 `9aedad3`。                                                                                                                           |
| Capability Registry  | `Capability-Registry/`  | `git@github.com:Quarkfan/Capability-Registry.git`  | 能力注册、导入、绑定、隔离执行、内置能力与持久 Executor 扩展控制面已完成，当前指向 `d572af0`。                                                                                                                        |
| Platform Contracts   | `Platform-Contracts/`   | `git@github.com:Quarkfan/Platform-Contracts.git`   | 共享合同、Provider 生命周期/探针、Runtime Profile、不可变解析快照和 Session Event Envelope 已导出，当前指向 `60d036a`。                                                                                               |
| Runtime Center       | `Runtime-Center/`       | `git@github.com:Quarkfan/Runtime-Center.git`       | Cordis PluginKernel 已进入生产组合路径；Runtime Provider/Profile、不可变准入快照、统一 Capability Facade 与持久 Session Ledger 已完成，当前指向 `6e56c3c`。                                                           |
| Scheduler Center     | `Scheduler-Center/`     | `git@github.com:Quarkfan/Scheduler-Center.git`     | 调度、立即执行、重试、历史补处理与持久 Trigger/Queue/Dispatcher 扩展控制面已完成，当前指向 `79cd05e`。                                                                                                                |
| Resource Center      | `Resource-Center/`      | `git@github.com:Quarkfan/Resource-Center.git`      | 资源、诊断、清理、FFmpeg 与持久 Storage/Diagnostics/Media 扩展控制面已完成，当前指向 `99332da`。                                                                                                                      |
| Governance Center    | `Governance-Center/`    | `git@github.com:Quarkfan/Governance-Center.git`    | 策略、审批、凭据、脱敏、审计与持久 Policy/Vault/Redactor 扩展控制面已完成，当前指向 `c2c3526`。                                                                                                                       |
| Platform Console     | `Platform-Console/`     | `git@github.com:Quarkfan/Platform-Console.git`     | 二级导航、弹窗式逐页指引、独立底部提交区、健康标签与悬停检查详情、统一表单控件、模型高级配置说明、使用策略分组、操作反馈、插件控制面、HTTPS/回环双入口认证已完成；当前指向 `385b44b`，生产应用代码为 `f08e9db`。                  |
| Platform Deployment  | `Platform-Deployment/`  | `git@github.com:Quarkfan/Platform-Deployment.git`  | Compose、备份恢复、回环认证与扩展持久化 smoke、E2E、提交区/悬停健康详情/弹窗式逐页指引与结构 UI acceptance、release handoff 与公网 TLS 云边界排查记录已更新，当前指向 `e3449dc`。                                           |
| Reference Projects   | `Reference-Projects/`   | 父项目目录                                         | 用于管理 `docs/platform-reference-matrix.md` 中参考项目的本地源码阅读、综合评估和借鉴点抽取；已完成 MG / CH / MH / CR 及 Runtime 插件架构参考评估，本地 clone 的上游源码放在 `Reference-Projects/sources/` 且不提交。 |

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

- 2026-08-16：Console 健康信息紧凑展示已从父项目源码 `d8020a9`、应用代码 `f08e9db` 部署到 `zwj-ubuntu`。发布前在线备份 `20260816T075300Z` 完整通过；模型 Provider、通道、Runtime Provider 与平台插件在行内只保留健康标签，最后检查时间、可用延迟和最近错误由鼠标悬停小浮窗显示并在移出后隐藏。Console 20 项测试、类型检查和生产构建通过；32 个桌面/移动页面状态、完整 E2E、回环登录及最终 12 服务 smoke 全部通过。
- 2026-08-16：Console 底部提交区与健康可见性已从父项目源码 `cff04f8`、应用代码 `19c75d2` 部署到 `zwj-ubuntu`。发布前在线备份 `20260816T073909Z` 完整通过；所有配置提交动作位于表单最后的纯按钮整行，模型 Provider、通道、Runtime Provider 与平台插件展示真实探针状态、最后检查时间、可用延迟和最近错误。Console 20 项测试、类型检查和生产构建通过；32 个桌面/移动页面状态、完整 E2E、回环登录及最终 12 服务 smoke 全部通过。
- 2026-08-16：Console 表单与帮助交互已从父项目 `6deaeaa`、应用代码 `2309841` 部署到 `zwj-ubuntu`。发布前在线备份 `20260816T065006Z` 完整通过；文本输入与选择框统一为 40px，逐页指引改为按需弹窗，模型高级配置补齐用途、自定义请求头示例和安全边界，使用策略完成分组。32 个桌面/移动页面状态的指引弹窗、详情和高级区全部通过，无全局溢出或控件裁切；完整 E2E、回环登录及最终 12 服务 smoke 通过。
- 2026-08-16：新增 `docs/session-handoff.md` 作为 3.0 新会话首要入口，集中记录路线边界、生产状态、模块基线、最近完成、验证证据、已知事项和下一轮发布顺序。
- 2026-08-16：Console 信息架构与交互整改已在备份 `20260816T055728Z` 验证后部署。生产运行 Console `c338794`；回环登录通过，12 个服务全部健康，16 个页面共 32 个桌面/移动状态均有逐页指引且无全局横向溢出、控件裁切或错位。模型、能力、插件、调度加入分层导航；通道只展示真实账号；列表单行滚动，多余操作收进更多菜单；过程操作统一显示进度与结果。
- 2026-08-16：Console 完成信息架构与交互整改。模型、能力、插件加入二级导航；每个业务页提供概念/配置/效果指引；通道页移除内部 Lark backend 注册信息；列表保持单行横向滚动，高密度操作进入更多菜单；操作统一提供进度和结果反馈。19 项测试、类型检查和生产构建通过。
- 2026-08-16：修复公网 HTTPS 启用后通过 `127.0.0.1:8080` SSH 隧道登录时 Secure Cookie 被浏览器拒绝、页面无提示闪回的问题。备份 `20260816T051437Z` 验证后部署父项目 `fd1b0de`；真实回环登录、Cookie、`/api/me`、中文错误提示和最终 12 服务 smoke 均通过。
- 2026-08-16：父项目应用源码 `7650ea8` 部署到 `zwj-ubuntu`。在线备份 `20260816T043509Z` 完整通过；七个 schema 共恢复 32 个 Provider。MH 非关键适配器经 `disabled -> 重启保持 -> verified -> active` 验收，事件日志保留且无 Provider 遗留停用；完整 E2E、16 页面桌面/移动 UI 和最终 12 服务 smoke 通过。
- 2026-08-16：MG / CH / MH / CR / Scheduler / Resource / Governance 的扩展生命周期从进程内状态升级为各中心 PostgreSQL schema 持久化；状态与事件原子提交，版本变化递增代次，初始化防并发且可在临时存储失败后重试。CR 管理面与执行器共享同一目录实例，七个中心均通过目录重建恢复合同。
- 2026-08-16：Dashboard 平台扩展详情新增持久化代次、安装时间、状态更新时间与最近探针。七中心 87 项、Console 16 项测试通过，八个项目均通过 TypeScript 检查和生产构建。
- 2026-08-16：完成“Everything extensible is a plugin”生产基线。Runtime 三个引擎通过 Cordis PluginKernel 和持久 Provider Registry 组合，新增 revisioned Runtime Profile、不可变准入快照、Session Event Ledger 与统一 Capability Facade；MG / CH / MH / CR / Scheduler / Resource / Governance 的关键业务路径加入中心内扩展准入及 list/detail/probe/lifecycle/logs 控制面。
- 2026-08-16：Dashboard 新增“扩展与插件”列表/详情工作区、Runtime Profile 完整 CRUD 与高级组合配置。跨中心目录支持单中心故障降级，生命周期操作由 BFF 强制限制为管理员。十个 Node 项目共 142 项测试通过，并全部通过 TypeScript 检查和生产构建。
- 2026-08-16：父项目 `a60037f` 已同步并重建部署到 `zwj-ubuntu`。部署前在线备份 `20260816T035511Z` 验证通过；12 服务 smoke、Runtime Profile 重启持久化、完整跨中心 E2E、16 页面桌面/移动 UI 验收全部通过。公网 443 仍被腾讯云上游边界在到达主机前重置，需完成云防火墙/ICP备案侧处理；未采用明文认证或异常端口绕过。
- 2026-08-16：完成 DeepSeek Harness 与上游 Cordis 的源码、npm 包和发布链路评估。确定 Definition / Provider / Binding / Consumer 跨中心扩展模型；Runtime exact-pin `@deepseek-ai/cordis 4.0.1`，通过自有 PluginKernel facade 管理 scope、依赖、生命周期、声明与逆序清理。Cordis 只承载受信任进程内组合，不作为安全沙箱。
- 2026-08-16：建立每轮交付门禁。Deployment 新增 source/Compose preflight、父项目交接快照、精确 child commit manifest 和 child-first 发布/回滚手册；服务器 source/Compose preflight 和 12 服务 smoke 通过，未重建镜像或切换容器。
- 2026-08-16：MG 抽取可注入的 `LarkChannelBackend` 与 `LarkConnectionBackendFactory`，并新增后端管理面、替换合同测试和 CLI 能力探测/升级/canary/回滚文档；当前生产仍使用 Node SDK/OpenAPI，CLI adapter 保持明确 external 状态。
- 2026-08-16：Console 左侧导航按工作台、配置中心、运行与运维、系统管理分组；机器人、通道、上下文、模型、能力和调度改为列表进入新增/编辑详情，高级配置只在详情显示。生产滚动更新后 12 个服务健康，15 个页面在桌面和手机视口均无横向溢出或控件裁切。
- 2026-08-16：补齐 Provider、模型部署、路由策略、通道、Context Source/Binding、Capability Binding、Bot 和调度任务的配置生命周期；复杂表单增加高级配置入口，使用手册移至左下辅助区。发布前在线备份验证通过，六个服务滚动更新后完整 E2E 与桌面/移动 Playwright 验收通过。
- 2026-08-16：Platform Contracts、Runtime、Scheduler、Resource、Governance、Console 和 Deployment 七个新远端仓库已首次推送 `main` 并建立本地 upstream；MG、CH、MH、CR 同步推送本轮实现。
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
