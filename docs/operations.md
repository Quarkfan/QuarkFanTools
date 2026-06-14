# 运行、排障与发布

## 1. 用户配置

首次使用需要：

1. 配置兼容 Claude Messages API 和工具调用的 Base URL、模型名和 API Key。
2. 新增飞书机器人，填写 App ID、App Secret 和收发身份。
3. 为机器人选择可访问的 Skills。
4. 用户态机器人完成 OAuth；Bot 态确认应用权限和事件订阅。
5. 启动监听。

多模态模型能力由模型配置中的开关控制。PowerPoint 视觉解析需要开启多模态。

## 2. Skill 来源

- **内置 Skills**：随安装包提供，无需导入。
- **用户 Skills**：在 GUI 选择文件夹后复制到 `workspace/skills/`。
- **Skill 市场**：配置 HTTPS Git URL、分支和可选 Token，应用启动时同步到 `workspace/market-skills/`。

Skill 市场使用应用内置纯 JavaScript Git 客户端，只支持 HTTPS。拉取暂时失败时保留现有市场副本；仓库或分支改变时重新克隆。

## 3. 本机数据与清理

打包应用数据位于：

```text
~/Library/Application Support/quarkfantools/
```

存储管理只面向会话相关数据。清理单个、过期或全部会话时，会删除对应 workspace、Claude 会话文件和跟踪的消息附件，但保留：

- 应用与机器人配置
- 飞书 OAuth 和 CLI 状态
- 用户导入 Skills
- Skill 市场配置

删除整个应用数据目录会同时删除上述保留信息，应只在明确需要完全重置时执行。

## 4. 常见排障

### 无法启动监听

- 检查机器人是否启用，以及 App ID、App Secret 是否完整。
- 检查日志中是否存在旧监听进程或飞书 CLI 错误。
- QuarkfanTools 只允许一个应用实例；重复打开时会聚焦已有窗口。
- 正常停止和退出应用都会等待监听进程结束；若应用或 CLI 异常退出，再次启动监听会验证并清理该机器人记录的旧订阅 PID。

### 用户态 OAuth 失败

- 应用应使用推荐权限发起 OAuth。
- 确认浏览器完成授权，并检查对应机器人的飞书 CLI 日志。

### 消息长时间没有反应

- 查看日志中的飞书事件投递延迟。若接收时已经延迟，问题发生在飞书事件投递或连接侧。
- 若接收及时但处理慢，检查附件预处理、模型响应和 Agent 工具调用日志。
- 检查机器人事件订阅、权限和监听连接是否稳定。

### 模型调用失败

- 确认服务兼容 Claude Messages API、工具调用和所配置模型名。
- 确认 Base URL 与 API Key 正确。
- 只有 OpenAI Responses 兼容并不足以运行当前 Claude Agent SDK 内核。

### Skill 未被使用

- 确认目录包含 `SKILL.md`。
- 确认 Skill 已被发现并授权给目标机器人。
- 同名 Skill 优先级为用户、市场、内置，检查是否被更高优先级版本覆盖。

## 5. 开发验证

```bash
npm install
npm test
npm run dev
```

`npm test` 会先构建，再运行编译后的 Node 测试。当前测试覆盖配置迁移、飞书事件文本/图片/文件解析、Office XML 提取、连续对话键和 workspace 哈希。

## 6. 打包发布

生成两个架构的 DMG 和 ZIP：

```bash
npm run pack:mac
```

单独构建：

```bash
npm run pack:mac:arm64
npm run pack:mac:x64
```

产物位于：

```text
release/arm64/
release/x64/
```

发布检查：

1. 更新 `package.json` 版本、`CHANGELOG.md` 和 `STATUS.md`。
2. 运行 `npm test`。
3. 运行 `npm run pack:mac`。
4. 在 arm64 与 x64 环境验证启动、配置、监听、消息、附件和清理流程。
5. 创建与版本一致的 Git tag。

当前没有配置代码签名和 Apple 公证，安装时可能出现系统安全提示。
