# QuarkfanTools Platform 协作约定

本仓库是父项目，只用于管理独立模块，不再直接承载单机版应用代码。

路线边界：`QuarkfanTools-Single/` 是 2.x 单机版业务延续线，用于继续承载当前 macOS 产品、客户问题、安装包发布和端到端验证；MG / CH / MH / CR 等多模块拆分是 3.0 甚至 5.0 的长期平台化规划，不应强行绑定普通 2.x Single 开发。

## 开始工作前

1. 先确认任务属于哪个模块。
2. 修改模块内代码或文档时，进入对应子仓库工作：
   - `QuarkfanTools-Single/`：macOS 单机版应用、打包、发布、历史 tags。
   - `Message-Gateway/`：Message Gateway 中心设计与后续实现。
   - `Context-Hub/`：Context Hub 上下文中心设计与后续实现。
   - `Model-Hub/`：Model Hub 模型枢纽设计与后续实现。
   - `Capability-Registry/`：Capability Registry 能力注册中心设计与后续实现。
   - `Platform-Contracts/`：跨中心版本化合同与服务工具包。
   - `Runtime-Center/`：运行时适配、执行、工作区和 Browser Worker。
   - `Scheduler-Center/`：定时任务、队列、续跑和历史补处理。
   - `Resource-Center/`：资源、缓存、媒体、诊断包和清理。
   - `Governance-Center/`：策略、审批、凭据和审计。
   - `Platform-Console/`：账号密码、RBAC、BFF 和 Dashboard。
   - `Platform-Deployment/`：Linux Compose 部署、备份、烟测和验收。
3. 父项目只更新 `.gitmodules`、子模块 gitlink、顶层 README / STATUS / CHANGELOG / AGENTS。

## 边界

- 不要把单机版应用源码重新提交到父项目根目录。
- 迁移 2.x 时迁移的是产品能力、行为语义和验收标准；实现和表现必须服从 3.x 中心边界，不复制 Electron IPC、主机路径、旧页面结构或跨层直连。
- 每个中心未来都应是独立仓库，并作为 submodule 纳入父项目。
- 子模块变更必须先在子仓库提交并推送，再更新父项目 gitlink。
- `Reference-Projects/` 只管理参考项目评估材料；本地 clone 的上游源码放入 `Reference-Projects/sources/`，默认不提交。
- 不得提交 API Key、App Secret、Token、用户数据或未脱敏日志。

## 每轮交付门禁

- 每次平台迭代都要同步更新受影响子仓库的 `README.md`、`STATUS.md`、设计/运维文档和测试证据；不能让代码、部署脚本和交接手册描述不同版本。
- 部署、回滚、环境变量、服务拓扑或验收方式发生变化时，必须同步 `Platform-Deployment/` 的脚本、`docs/operations.md` 和 `docs/release-handoff.md`。
- 父项目必须同步 `STATUS.md`、`docs/3.0-current-release.md`、`docs/3.0-completion-audit.md`、相关总设计和子模块 gitlink。
- 提交顺序固定为：子仓库验证、提交、推送；父项目更新 gitlink 与总文档、提交、推送；随后才从该干净父项目状态同步和部署。
- 完成前运行 `Platform-Deployment/scripts/release-preflight.sh`。若生产部署发生，再补备份、source manifest、smoke/E2E/UI 和回滚证据。

## 决策协作

- 顶级工程原则：如果某个部分已经有成熟、优秀、许可合适且可维护的开源实现，应先做认真评估，再决定复用、适配、借鉴或自研，不要默认自己造轮子。
- 复用开源不等于把开源项目完整抄进来；粒度可以很大，例如直接把整个开源项目作为依赖或子系统，也可以很小，例如只借鉴某个模块设计、接口模型、状态机、测试方法或少量许可允许的代码片段。选择粒度时必须同时考虑隔离、安全、交付、自包含、授权、性能、维护成本和产品边界。
- 最终产品和架构决策由 Dean 做出。
- 不涉及产品方向、仓库归属、发布范围、对外承诺或不可逆架构选择时，Codex 拥有独立判断和建议权。
- Codex 必须主动思考、主动发现问题、主动提出风险、取舍、替代方案和低风险改进建议；不能只被动执行明确指令。

## 验证

- 父项目没有独立构建命令。
- 单机版验证在 `QuarkfanTools-Single/` 中执行。
- Message Gateway 验证在 `Message-Gateway/` 中执行。
- Context Hub 验证在 `Context-Hub/` 中执行。
- Model Hub 验证在 `Model-Hub/` 中执行。
- Capability Registry 验证在 `Capability-Registry/` 中执行。
- 跨中心扩展架构先读 `docs/extensibility-architecture.md`；Runtime 插件内核还需读 `Runtime-Center/docs/cordis-adoption.md`。
- 父项目常规检查：

```bash
git submodule status
git diff --check
```
