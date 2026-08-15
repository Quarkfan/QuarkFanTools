# 2.x to 3.x Capability Migration Matrix

基线：`QuarkfanTools-Single` 当前 `main`，应用版本 2.3.2，提交 `3e73523`。本表按产品能力迁移，不按 Electron 文件逐个搬运。

状态约定：`M0-M4` 对应 `3.0-implementation-program.md` 里程碑；“受控降级”表示服务器形态无法等价提供时，必须在 UI 和 API 明确展示原因和替代路径。

| 2.x 能力 | 3.x 归属 | 里程碑 | 迁移验收 |
| --- | --- | --- | --- |
| 多 Bot、启停、隔离状态 | MG + Runtime + Console | M1 | bot/account/workspace/message/execution 全链路隔离 |
| 飞书 Bot 事件、回复、reaction、图片/文件 | MG | M1 | OpenAPI/WebSocket/Webhook adapter 可收、存、回、查、重试 |
| 收/发身份区分、Bot open_id、用户 OAuth | MG + Governance | M1/M2 | identity 与 credentialRef 分离，状态和缺 scope 可见 |
| 企业微信 provider 与历史轮询 | MG | M4 | adapter 可配置、状态可见；不支持的平台能力显式降级 |
| 钉钉占位 | MG | M4 | registry 可声明 unsupported，不伪装可运行 |
| mention 路由、免 @、上下文自主回复 Beta | MG + Governance | M1/M2 | 策略独立于 channel adapter，可审计、可解释 |
| messageId 去重、同 Bot 串行队列、重复回复保护 | MG + Scheduler | M1 | 数据库唯一约束 + 幂等 key + delivery ledger |
| 历史消息查询、断线补处理、最大回溯 | MG + Scheduler | M3 | cursor 持久化、手动 backfill、上限和清理规则 |
| 结果投递路由 | MG | M1 | origin/explicit/policy route 均可查询 trace |
| 多 Model Provider | MH | M1 | 多 provider/model/type，可启停和健康探测 |
| Anthropic/OpenAI compatible | MH | M1 | 真实调用、流式输出、错误归一化、usage |
| round-robin/random/failover | MH | M1 | 并发安全游标、候选计划、失败切换记录 |
| 多模态模型标记 | MH | M1 | model capability 明确 text/image/audio/video/input/output |
| Claude Agent SDK runtime | Runtime | M1 | adapter 化，保持 session/tool/workspace/event 语义 |
| 多 Runtime | Runtime | M2 | Claude/OpenAI/model-tool-loop 可按 Bot/任务选择 |
| 并发限制、长任务提示、可观察过程 | Runtime + Scheduler | M1/M3 | admission、queue、progress event、ETA/timeout 可见 |
| 会话延续、per-Bot session | Runtime + CH | M1/M2 | session 隔离、摘要/记忆分层、重启恢复 |
| 本地直聊 | Console + Runtime | M1 | Dashboard Bot chat 复用同一治理和能力链 |
| Slash 命令、别名、help | MG + CR + Runtime | M2 | command manifest/binding/route，冲突阻断 |
| 高速工作流 | MG + CR + Runtime | M2 | 确定性 trigger/scope/priority/action |
| Skill 内置/本地/市场 | CR | M2 | package/source/version/install/update/remove |
| Skill 导入冲突 overwrite/keep/edit | CR + Console | M2 | 三种策略均有 diff、审计和原子提交 |
| Skill Review Rules | CR + Governance | M2 | 静态诊断、风险、规则版本和审批 |
| MCP stdio/http/sse、tools/list 诊断 | CR + Runtime | M2 | discovery、transport、probe、tool cache、错误可见 |
| Custom App node/executable | CR + Runtime + Governance | M2/M4 | manifest、权限、sandbox；服务器 executable 默认关闭 |
| Suite、Workflow steps | CR + Runtime | M2 | 模板、条件、repeat、retry、timeout、step events |
| Bot capabilityRefs/policy | CR + Governance | M2 | binding 与授权分离，agent/command/scheduled 权限独立 |
| Owner approval 和能力审计 | Governance | M2 | durable approval、过期、续跑、不可抵赖 audit |
| Capability Builder | Console + CR + Runtime | M4 | draft/validate/diff/publish，发布前人工确认 |
| Browser Workflow Kit Builder | Console + CR + Browser Worker | M3/M4 | workflow contract、认证探索、证据和发布 |
| 系统问答助手 | Console + Runtime | M4 | 配置问答、诊断、导航、受控草稿，不直接改配置 |
| interval/daily/weekly/cron | Scheduler | M3 | timezone、next run、misfire、retry、pause |
| 立即执行且不扰动自动计划 | Scheduler | M3 | manual run 独立 trigger，计划时间保持 |
| 任务上/下次时间、日志、详情 | Scheduler + Console | M3 | 列表可见，独立 run log/trace 页面 |
| Workflow 调度执行 | Scheduler + Runtime | M3 | step 状态、重试、输出、投递闭环 |
| 延后任务 `/continue` | Scheduler + Runtime | M3 | continuation token、原 session、过期与审计 |
| 文件缓存、SHA-256 去重、Bot ACL | Resource + Governance | M3 | content-addressed store、grant、freshness、repair |
| 飞书受控下载/导出缓存协议 | MG + Resource | M3 | raw direct download 被治理，cache hit 可追踪 |
| Session transcript、事件时间线 | CH + Resource | M2/M3 | message/execution/tool/result/artifact 关联查询 |
| Office/PDF/CSV/text 预处理 | CH + CR + Resource | M3 | parser capability、配额、炸弹防护、provenance |
| 存储统计、分项清理、TTL | Resource | M3 | dry-run、影响预览、引用保护、审计 |
| 一键排障 ZIP | Resource + Console | M3 | 固定收集范围、递归脱敏、correlation 切片 |
| 配置完整导入导出 | Console + Governance | M4 | 高风险确认、schema version、备份、secret handling |
| Browser isolated/managed/user-chrome | Browser Worker | M3 | Linux 默认 isolated；远端 CDP/人工桌面模式显式配置 |
| Browser 认证 flow、session 持久化 | Browser Worker | M3 | storage state 加密、keepalive、resume、TTL |
| Browser 敏感动作审批 | Governance + Browser Worker | M3 | checkpoint 前停止，批准后从原状态续跑 |
| Browser screenshot/trace/download/video | Browser Worker + Resource | M3 | 产物索引、权限、保留期、下载 |
| Playwright 默认工具 | CR + Browser Worker | M3 | 作为 builtin provider 注册，不绕过治理 |
| browser-use Agent | Runtime adapter + Browser Worker | M3 | 复用成熟实现或协议，限制并发、domain 和 workspace |
| ffmpeg/ffprobe 基础能力 | Media Worker + CR | M3 | info/trim/merge/resize/crop/rotate/color/audio/text/subtitle/speed/export/compress/thumbnail/normalize/fade/watermark/gif/blur |
| Browser 过程视频 | Browser Worker + Media Worker | M3 | 录屏或截图合成，失败不遮蔽任务最终结果 |
| 多主题、状态反馈、固定工作区 | Console | M0-M4 | system/light/dark、loading/empty/error/focus 完整 |
| Bot 运行台列表/动画 Beta | Console | M4 | 列表为生产默认；动画只消费状态，不改变运行逻辑 |
| 活动酒店签到等业务模板 | CR + Runtime | M4 | 作为 App/Workflow 包迁移，不写进平台核心 |
| Word/Excel/PPT/视频/浏览器内置 Skill | CR + CH/Runtime | M3/M4 | 包、依赖、平台限制和诊断均可见 |

## 迁移原则

- 2.x 是能力需求基线，不是 3.x 架构模板。能力必须存在，但只能通过所属中心的合同、凭据引用、治理、审计和运行时边界落地。
- 不为复刻旧 UI、Electron IPC、主机脚本或本地目录而破坏新架构；同一能力在 3.x 可以采用更适合服务器、Web Dashboard 和多租户隔离的交互形式。
- 先迁移领域能力和测试语义，再迁移 UI；Electron IPC 不作为服务器合同。
- macOS 专属能力采用 remote worker 或受控降级，不在 Linux 上伪造成功。
- 2.x 明文 secret 只允许在交互式导入时进入 Governance credential store，迁移报告不得回显。
- 业务模板和客户数据不进入核心仓库；模板升级与客户实例继续分离。
- 任何“已有按钮但没有执行链”的项目视为未迁移。
