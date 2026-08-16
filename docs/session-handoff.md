# QuarkfanTools 3.0 新会话交接

最后更新：2026-08-16

## 阅读顺序

1. 先读父项目 `AGENTS.md`，确认仓库边界和提交顺序。
2. 再读父项目 `STATUS.md` 与本文件，了解当前实现和生产状态。
3. 需要完整能力清单时读 `docs/3.0-current-release.md`。
4. 进入实际负责变更的子仓库，继续读该仓库的 `AGENTS.md`、`README.md`、`STATUS.md` 和相关设计文档。
5. 涉及部署时读 `Platform-Deployment/docs/operations.md` 与 `Platform-Deployment/docs/release-handoff.md`。

## 路线边界

- `QuarkfanTools-Single/` 是 2.x macOS 单机版延续线，普通客户问题、安装包和 2.x 功能开发只在该仓库处理。
- 其余中心和 Platform Console/Deployment 是 3.0/5.0 服务器平台。可以迁移 2.x 的能力语义和验收标准，但实现必须服从中心边界，不能复制 Electron IPC 或本机目录耦合。
- 父项目只管理跨中心文档和子模块 gitlink。变更必须先在子仓库提交并推送，再更新父项目。
- 开源成熟实现优先评估。复用粒度可以是完整依赖、独立子系统、接口/状态机设计或许可允许的局部代码，不等于整库照搬。

## 当前生产状态

- 服务器别名：`zwj-ubuntu`；部署根目录：`/opt/quarkfantools`。
- Dashboard 配置域名：`https://tool.quarkfan.com`；Console 也保留受控的 SSH 回环访问面。不要在文档或 Git 中记录账号密码、密钥和 Cookie。
- PostgreSQL、十一项应用服务和 Caddy edge 共十二项健康检查全部通过。
- 最近一次 UI 发布前验证备份：`/opt/quarkfantools/Platform-Deployment/backups/20260816T065006Z`。
- 服务器 `DEPLOYED-SOURCE-MANIFEST.md` 是最近一次同步的精确源码证据；新的文档提交同步后应以该文件和父项目 `origin/main` 为准。
- 当前数据库迁移均为增量兼容。回滚前仍必须重新备份，并按 Deployment 交接门禁执行。

## 模块基线

| 模块 | 接续提交 |
| --- | --- |
| Message Gateway | `b65eae6` |
| Context Hub | `c64a17a` |
| Model Hub | `9aedad3` |
| Capability Registry | `d572af0` |
| Platform Contracts | `60d036a` |
| Runtime Center | `6e56c3c` |
| Scheduler Center | `79cd05e` |
| Resource Center | `99332da` |
| Governance Center | `c2c3526` |
| Platform Console | `19c75d2`（底部提交区/健康可见性候选；生产应用仍为 `2309841`） |
| Platform Deployment | `a826b2e` |

父项目提交不要在本文硬编码为自引用哈希；新会话用 `git rev-parse origin/main` 获取当前交接版本。

## 最近完成

Console 已完成一轮全局信息架构和交互整改：

- 所有配置提交动作统一位于表单最后的独立整行，行内只允许保存、取消、返回等同级按钮；能力授权已从配置中段移至高级配置之后。
- 模型 Provider、通道、Runtime Provider 和平台插件显示真实探针状态、最后检查时间、可用延迟与最近错误；未检测、停用、降级和异常不再伪装为健康。
- 文本输入与选择框显式使用统一 40px 高度；模型使用策略按基础设置、参与路由模型和行为开关分组。
- 每页“本页指引”改为紧凑入口和按需弹窗，支持关闭按钮、遮罩与 Escape；Deployment 验收会逐页打开并校验三段内容。
- 模型 Provider/部署高级配置逐项解释优先级、权重、能力、上下文、成本和元数据；自定义请求头说明适用场景、JSON 示例及不得重复存放密钥的边界。其他高级区也明确使用范围。
- 输入框、选择框和按钮使用稳定高度与统一基线；桌面和移动表单均已目检。
- 列表一条记录保持一行，宽内容在列表内部横向滚动，多余操作收入三点菜单。
- Mutation 统一显示顶部进度、成功/失败结果；禁用操作会解释不可执行原因。
- 通道页只展示实际可配置的通道账号，不再把 `lark-sdk-openapi` 或 `lark-cli-external` 内部注册状态伪装成用户对象。
- 模型、能力、插件采用二级导航；能力拆为目录、机器人授权、导入更新和创建能力。
- 插件控制面拆为运行时插件、运行方案和平台插件；插件模型见 `Platform-Console/docs/plugin-control-plane.md`。
- 内部 `draining` 在界面表达为“停止接收新任务”，不再使用含义不清的“排空”。
- 调度、浏览器和其他业务页均有概念、配置步骤、执行效果与使用方法指引。
- 登录失败会保留中文错误，不再输入密码后一闪返回。

## 验证证据

- Platform Console：19 项测试通过，TypeScript 检查和生产构建通过。
- 最新未部署候选：Platform Console 20 项测试、TypeScript 检查和生产构建通过；Deployment UI acceptance 语法检查通过，并新增提交区与健康摘要结构合同。
- Playwright 严格验收覆盖 16 个页面、桌面与移动共 32 个状态。
- 每个业务页面恰有一份页面指引；全局横向溢出为 0，裁切控件为 0。
- 真实回环登录、Session Cookie 和 `/api/me` 验收通过。
- 部署后 `Platform-Deployment/scripts/smoke.sh` 显示十二项服务全部 `healthy`。
- 验收截图只作临时目检，已经从本机和服务器删除。
- 父项目 `6deaeaa`、Console 应用 `2309841` 已部署；备份 `20260816T065006Z`、完整 E2E、回环认证、32 状态 UI 验收与最终 12 服务 smoke 全部通过。

常用检查：

```bash
cd Platform-Console
npm test
npm run typecheck
npm run build

cd ../Platform-Deployment
./scripts/release-preflight.sh
ssh zwj-ubuntu 'cd /opt/quarkfantools/Platform-Deployment && ./scripts/smoke.sh'
```

## 已知事项

- 公网 TLS 曾被腾讯云上游边界在到达主机前重置；用户随后报告域名可以访问。新会话在修改 TLS、Cookie 或 Caddy 前必须重新实测，不要沿用任一历史结论，也不要通过降低 Secure Cookie/HSTS 绕过问题。
- Lark 生产通道当前使用 Node SDK/OpenAPI backend。外部 CLI adapter 只有在探针与合同测试通过后才能启用；升级应通过 MG adapter 边界完成。
- WeCom 历史轮询、DingTalk 和外部 Claude Runtime 等受控降级必须继续在 UI/API 中如实展示，不得返回假成功。
- 父项目当前可见的 `QuarkfanTools-Single` 状态和 `.obsidian/` 是既有本地内容，本轮没有修改；新会话不得擅自清理或覆盖。

## 下一轮工作方式

1. 先执行 `git status --short` 和 `git submodule status`，不要覆盖用户已有修改。
2. 只进入任务所属子仓库开发，保持中心 API、租户/Bot 隔离、治理和审计边界。
3. 子仓库完成测试后先提交并推送，再更新父项目 gitlink、`STATUS.md` 和必要的发布文档。
4. 生产变更依次执行 preflight、备份、源码同步、部署、smoke、专项验收和必要的完整 E2E/UI 验收。
5. 每轮结束都更新本文件或对应模块交接入口，使下一会话不依赖聊天记录。
