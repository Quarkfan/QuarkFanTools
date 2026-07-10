# 平台中心架构

本文记录 QuarkfanTools 后续平台化拆分的稳定共识。它不是要求一次性重构，而是约束后续新增能力、目录调整和 UI 信息架构，避免继续把能力堆在单一 Claude Agent 调用链里。

## 1. 总体目标

QuarkfanTools 从“飞书 Bot + Claude Code Skill Agent”演进为本机 Agent 平台。平台核心由八个中心组成：

1. Message Gateway（MG，消息网关）
2. Context Hub（CH，上下文中心）
3. 模型中心
4. 工具与能力中心
5. 运行时中心
6. 资源中心
7. 调度与系统基础中心
8. 治理与安全中心

每个中心都应有清晰输入、输出和责任边界。后续新增功能应先判断归属中心，再设计接口；跨中心行为通过显式协议连接，不直接互相读取内部状态。中心之间的请求、响应、错误、审计和典型组合链路见 [`platform-interface-protocols.md`](platform-interface-protocols.md)。

## 2. 八个中心

### 2.1 Message Gateway（MG，消息网关）

专门设计见 [`message-gateway.md`](message-gateway.md)。

职责：

- 接入不同消息源，包括飞书、未来企业微信、钉钉、Webhook 或其他 IM。
- 统一消息格式，稳定表达发送人、群、会话、账号、消息源、资源和上下文。
- 识别发送人、群、会话和账号，并在 Bot / 通道 / CLI / 身份边界内维护消息归属。
- 把消息送进正确的订阅路径，包括实时订阅、事件流订阅、定时/周期订阅和主动历史查询路径。
- 把要投递的输出重新格式化并发到指定通道，包括 reaction / 卡片 / 文本投递等通道原语。
- 支持被动获取和主动获取两类消息能力：被动获取包括实时订阅、事件流订阅和消息到达通知；主动获取包括按游标查询历史、按时间窗口拉取、定时或周期订阅触发的增量拉取。
- 保证接收侧和投递侧达到同等级隔离：Bot、通道、CLI、profile、HOME、身份、chat、游标、去重和消息列表都应按 Bot 维度隔离。
- 维护“消息基础服务”和“业务调度编排”的边界；补处理历史、处理中表情、长任务提示等是上层中心基于消息原语创建的策略，不是 MG 业务。

不负责：

- 不决定模型、知识召回和工具选择。
- 不直接执行 Skill、MCP、自定义应用或 Agent runtime。
- 不持有知识索引或模型调用策略。
- 不决定某条历史消息是否要补处理，不解释某个 reaction 策略的业务含义。

当前代码映射：

- `electron/runtime.ts`
- `electron/im-providers.ts`
- `electron/lark-cli.ts`
- `electron/lark-event.ts`
- `electron/message-target.ts`
- `electron/platform-connectors.ts`

### 2.2 Context Hub（CH，上下文中心）

专门设计见 [`../Context-Hub/docs/context-hub.md`](../Context-Hub/docs/context-hub.md)。

职责：

- 负责上下文托管、上下文源接入、知识目录、记忆域、索引、召回和权限范围。
- 对外提供上下文召回能力；内部可以逐步演进为 RAG、短期/中期/长期记忆、知识图谱、向量索引、文档快照、外部知识连接器等。
- 统一管理 Skill 自带 `knowledge/`、飞书文档/Wiki/云盘、未来本地知识库、客户知识库、会话摘要、用户偏好、项目状态和长期记忆。
- 提供记忆候选、确认、强化、过期、遗忘和冲突处理能力。

不负责：

- 不直接决定最终回复。
- 不执行工具或 Agent runtime。
- 不绕过治理中心读取未授权上下文或写入长期记忆。
- 不把短期 transcript、资源缓存、日志和知识索引混成一个存储池。

当前代码映射：

- 目前知识和记忆能力分散在 Skill、飞书连接器、受控文件缓存、会话摘要、prompt 约束和 runtime transcript 中。
- `electron/platform-connectors.ts`
- `electron/file-cache.ts`
- `electron/lark-cached-file-protocol.ts`
- `electron/claude.ts` 中与知识访问相关的 prompt 需要逐步外移。

后续目标：

- 新增 `ContextSourceAdapter` / `ContextRetriever` / `ContextMemoryWriter` 抽象。
- 把“召回什么上下文、写入什么记忆”和“运行时怎么使用这些上下文”分开。
- 将飞书文档、Skill knowledge、会话摘要、用户偏好、项目记忆和未来本地 RAG 统一成可审计召回结果。

### 2.3 模型中心

职责：

- 管理 MODEL PROVIDER 配置、完整性校验、轮流/随机策略、失败切换、多模态标记。
- 未来承载协议转换、计费统计、token/成本统计、模型健康检查、本地模型运行和额度控制。
- 对运行时中心提供可用模型候选，不直接等同于 Agent runtime。

不负责：

- 不决定工具权限。
- 不承担 session、workspace、sandbox 或 Agent 内核加载。
- 不把“Claude Messages API 兼容模型”误认为“Claude Code Runtime”。

当前代码映射：

- `electron/model-providers.ts`
- `electron/config-merge.ts`
- `src/main.ts` 中 MODEL PROVIDER UI

### 2.4 工具与能力中心

职责：

- 统一管理 Skill、MCP、套件、自定义应用、Workflow、命令映射和能力市场。
- 提供能力发现、展示、检索、诊断、导入、升级、卸载和能力声明。
- 输出能力定义和可执行绑定，供运行时中心或调度系统消费。

不负责：

- 不直接扩大 Bot 授权。
- 不决定能力能否在某个场景执行；这由治理与安全中心判定。
- 不直接持有 IM 消息生命周期。

当前代码映射：

- `electron/skills.ts`
- `electron/apps.ts`
- `electron/suites.ts`
- `electron/mcp-diagnostics.ts`
- `electron/executable-capability-bindings.ts`
- `electron/capability-executor.ts`
- `electron/workflow-steps.ts`

### 2.5 运行时中心

职责：

- 负责 Agent runtime 抽象、内核加载、工作空间构建、session 恢复、MCP 注入、工具注入、进程/线程/容器隔离和 runtime 生命周期。
- 当前实现是 Claude Code Runtime；后续应支持多个 runtime，例如 Claude Code、纯文本模型 runtime、OpenAI Responses runtime、Gemini runtime、本地模型 runtime 等。
- 把 runtime 专属事件转换为平台统一事件，例如进度、工具调用、最终回复、错误、session id。

不负责：

- 不直接管理模型池策略；只消费模型中心给出的候选。
- 不直接管理上下文库或记忆；只消费 CH 返回的召回结果或上下文记录。
- 不直接管理消息平台；只返回运行结果。

当前代码映射：

- `electron/claude.ts` 是当前最厚的 runtime 适配层。
- `electron/default-mcp.ts`
- `electron/sandbox-filesystem.ts`
- `electron/bot-runtime-context.ts`

后续目标：

- 新增 `AgentRuntime` 接口。
- 将 `runClaude` 收敛为 `ClaudeCodeRuntime`。
- 将 workspace、Skill 链接、prompt 构建、MCP 注入、sandbox policy 中 runtime 无关部分从 `electron/claude.ts` 拆出。

### 2.6 资源中心

职责：

- 管理存储空间、会话数据、文件缓存、日志、排障包、运行历史、CPU/内存/磁盘监控和清理策略。
- 提供只读统计、清理入口、导出排障包和保守自动清理。
- 未来承载资源配额、模型调用统计、成本统计和系统健康报告。

不负责：

- 不决定 Bot 权限。
- 不读取或执行工具。
- 不把清理会话扩大为删除配置、授权、用户 Skills 或知识源。

当前代码映射：

- `electron/storage.ts`
- `electron/file-cache.ts`
- `electron/diagnostics-export.ts`
- `electron/logger.ts`
- `electron/sessions.ts`
- `electron/scheduled-tasks.ts`

### 2.7 调度与系统基础中心

职责：

- 管理应用启动、单实例、配置加载与迁移、远端授权门禁、定时任务、后台队列、版本和发布基础能力。
- 承载平台级系统任务和业务编排策略，例如断网恢复后的历史消息补处理、处理中表情策略、长任务提示策略、任务重试和队列可见性。
- 维护启动、运行、停止、恢复和升级过程中的可观测性。

不负责：

- 不直接做知识召回。
- 不直接执行 Agent runtime。
- 不绕过治理中心触发能力。

当前代码映射：

- `electron/main.ts`
- `electron/config.ts`
- `electron/config-merge.ts`
- `electron/auth-gate.ts`
- `electron/scheduled-task-core.ts`
- `electron/scheduled-tasks.ts`
- `electron/task-limiter.ts`

### 2.8 治理与安全中心

职责：

- 管理权限、策略、审计、Owner 审批、Bot 隔离、Skill 授权、MCP 授权、文件访问策略、sandbox policy、日志脱敏和排障包脱敏。
- 作为横切中心为其他中心提供授权判定、策略解释和审计记录。
- 对“某 Bot 在某场景能不能用某能力、读某知识、访问某文件、调用某工具”给出统一判断。

不负责：

- 不自己执行业务能力。
- 不替代工具中心的能力发现。
- 不替代资源中心的存储统计。

当前代码映射：

- `electron/capability-audit.ts`
- `electron/lark-drive-guard.ts`
- `electron/sandbox-filesystem.ts`
- `electron/escalations.ts`
- `electron/escalation-protocol.ts`
- `electron/capability-resolver.ts`
- `electron/capability-governance.ts`
- `docs/security.md`

## 3. 关键边界

### 3.1 模型中心不等于运行时中心

MODEL PROVIDER 解决“用哪个模型服务、怎么失败切换、是否多模态、未来怎么计费统计”。运行时中心解决“由哪个 Agent 内核执行、怎么加载工具、怎么隔离、怎么恢复会话、怎么把工具事件转成平台事件”。

因此未来不应把“增加 OpenAI 模型 Provider”误认为“支持 OpenAI runtime”。前者只是模型服务，后者是运行内核。

### 3.2 工具中心不等于治理中心

工具中心负责“有什么能力”。治理中心负责“谁在什么场景能不能用”。能力导入、发现、展示和诊断不应自动扩大 Bot 授权；运行时执行前必须经过治理判定。

### 3.3 CH 不等于工具中心

Skill 可以带 `knowledge/`，飞书连接器可以读云文档，自定义应用也可能产出知识或记忆候选，但 CH 的对外职责是“召回上下文和治理记忆”。工具中心的职责是“管理可执行或可注入能力”。未来 RAG、知识图谱和记忆管理应优先归入 CH，而不是继续散在 prompt、Skill 目录约定或 runtime transcript 里。

### 3.4 MG 不等于运行时中心

MG 负责通道接入、入站标准化、订阅/查询、消息管理、路由归属、出站投递和 admin 管理面，但不执行 Agent。它不应该知道 Claude Code、OpenAI、Gemini 或本地 runtime 的细节。运行时中心只处理标准化任务上下文和返回标准运行结果。

### 3.5 资源中心不等于业务中心

资源中心负责存储、日志、缓存和监控，不应承载业务选择逻辑。清理策略必须保守，不能删除配置、授权、用户 Skills、知识源和 Bot 凭据。

## 4. 迁移路线

### 阶段一：文档和命名收敛

- 以本文作为平台中心架构入口。
- 以 [`platform-interface-protocols.md`](platform-interface-protocols.md) 作为跨中心调用协议入口。
- 后续需求、架构和 PRD 使用八个中心命名。
- UI 文案可以渐进调整，不要求立即改全。

### 阶段二：运行时接口抽象

- 新增 `AgentRuntime` 接口，包含 Agent 调用、文本调用、视觉调用、进度事件和 session 语义。
- 把当前 `runClaude` 包装为 `ClaudeCodeRuntime`。
- 业务层只依赖 `AgentRuntime`，不直接依赖 `@anthropic-ai/claude-agent-sdk` 类型。

### 阶段三：CH 接口抽象

- 新增 `ContextSourceAdapter` / `ContextRetriever` / `ContextMemoryWriter` 抽象。
- 让飞书文档、Skill knowledge、受控文件缓存、会话摘要、记忆候选和未来本地 RAG 都通过统一召回结果进入 Agent 上下文。
- 召回结果必须包含来源、Bot 授权、更新时间或 freshness key、记忆层级、置信度和可审计摘要。

### 阶段四：资源与治理下沉

- 将受控文件缓存、裸下载拦截、Owner 审批、MCP 授权、Skill 授权、sandbox policy 等收敛到治理与安全中心。
- 将日志、排障包、缓存、CPU/内存/磁盘监控和模型成本统计收敛到资源中心。

### 阶段五：多 runtime 扩展

- 先支持无工具纯文本 runtime，用于总结、后处理和简单问答。
- 再支持带受控 MCP 的 runtime。
- 最后再考虑具备完整工具、workspace、session resume 和隔离语义的 runtime。

## 5. 验收口径

新增平台中心或跨中心能力时，至少满足：

- 文档说明它属于哪个中心。
- 说明它消费哪些中心的接口、输出给哪些中心。
- 不直接绕过治理与安全中心。
- 不把 runtime 专属类型泄漏到消息、知识、模型或资源中心。
- 有升级兼容策略，不破坏现有 Bot 配置、会话、授权和用户 Skills。
- 有与风险匹配的测试或手工验证记录。
