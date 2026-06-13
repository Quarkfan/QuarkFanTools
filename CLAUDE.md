# QuarkfanTools 协作约定

本文件用于让任何后续 AI 或开发者不依赖聊天记录即可接续工作。

## 开始工作前

按顺序阅读：

1. `docs/AI.md`
2. `STATUS.md`
3. `docs/requirements.md`
4. 与任务相关的架构、运维、安全或决策文档
5. 实际代码与测试

文档是导航和当前共识，不替代代码证据。发现文档与代码不一致时，先核实代码和 Git 历史，再同步修正文档。

## 必须保持的边界

- 支持 Apple Silicon 和 Intel macOS。
- 交付物必须自包含，不能假定用户安装 Git、Node、Python、Office 或其他开发环境。
- 多机器人凭据、飞书状态、Claude 状态、会话 workspace 和 Skill 权限必须隔离。
- 一个机器人只能看到明确授权给它的 Skills。
- 私聊以 chat 为连续会话；群聊以 chat 和发送者组合为连续会话。
- 收到消息后添加原消息表情，任务结束后移除；不要先发送一条“正在查询”文本。
- 用户配置、飞书授权与用户 Skills 不得被会话清理误删。
- 不得把 API Key、App Secret、Token 或用户数据提交到 Git。

## 修改后的文档责任

任何改变需求、运行结构、配置、数据路径、用户行为或发布方式的修改，都必须在同一提交中更新对应文档：

- 用户可见能力或约束：`docs/requirements.md`
- 模块、数据流、隔离或会话规则：`docs/architecture.md`
- 配置、运行、排障、构建或发布：`docs/operations.md`
- 安全边界和风险：`docs/security.md`
- 重要技术取舍：`docs/decisions.md`
- 当前进度、已知问题和下一步：`STATUS.md`
- 已发布或待发布变更：`CHANGELOG.md`
- 文档入口变化：`docs/AI.md`

## 验证与发布

- 常规验证：`npm test`
- 打包验证：`npm run pack:mac`
- 发布前确认版本号、根 `CHANGELOG.md`、`STATUS.md` 与产物名称一致。
- `release/` 是本地产物目录，不提交到 Git。
- 当前安装包未签名；不要把“成功打包”等同于“可无提示安装”。
