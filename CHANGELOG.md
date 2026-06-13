# Changelog

本文件记录 QuarkfanTools 应用变更。示例 Skill 的独立历史见
[`skills/moje-qa-assistant/CHANGELOG.md`](skills/moje-qa-assistant/CHANGELOG.md)。

## Unreleased

- 建立可独立接续工作的需求、架构、运维、安全、决策与状态文档。

## v1.3.0 - 2026-06-14

- 新增基于 HTTPS Git 仓库的 Skill 市场，应用内置 Git 客户端，无需系统 Git。
- 新增按会话选择性清理存储数据。
- Office 文档改由应用内置 ZIP/XML 能力预处理，不依赖 Office、Python、Node 或 LibreOffice。
- 增加 Office 压缩包条目数和解压体积限制。

## v1.2.0 - 2026-06-13

- 内置 Word、PowerPoint 和 Excel Skills。
- PowerPoint 解析结合多模态模型与 macOS Quick Look 预览。
- 每个连续会话使用独立 workspace。
- 新增会话存储统计、过期清理和全部清理。

## v1.1.0 - 2026-06-13

- 新增连续会话和 24 小时上下文保持。
- 新增图片消息多模态处理。
- Agent 默认可调用当前机器人身份下的飞书 CLI。

## v1.0.0 - 2026-06-13

- 建立多飞书机器人配置、监听和隔离能力。
- 支持按机器人授权 Skills。
- 收到消息后添加处理中表情，并在任务结束后移除。
