import type { AppInfo } from "./types.js";

const releases: AppInfo["releases"] = [
  {
    version: "1.6.6",
    date: "2026-06-16",
    highlights: [
      "左上角 Logo 现在可打开应用内使用手册，集中查看配置、Bot、Skill、运行台、飞书权限和存储管理说明。",
      "左下角状态改为多 Bot 在线数量、监听数量和排队任务数，更适合多个机器人同时运行。",
      "存储管理的会话详情新增最近对话记录，并修复会话行查看按钮换行问题。",
      "运行台日志默认记录 Agent 可观察工作过程；是否把进度发给飞书用户仍由 Bot 开关控制。"
    ]
  },
  {
    version: "1.6.5",
    date: "2026-06-16",
    highlights: [
      "Bot 可配置用户态 OAuth 额外权限，便于申请飞书导出、预览等扩展 scope。",
      "配置页的机器人区域改为列表，点击后在弹窗中编辑和保存。",
      "配置项新增 ? 说明入口，方便理解每个开关和输入项。"
    ]
  },
  {
    version: "1.6.4",
    date: "2026-06-16",
    highlights: [
      "修复已完成飞书用户态授权后，Agent 仍因 lark-cli 全局安全存储目录被拦截而无法读取资料的问题。",
      "飞书用户态授权统一通过应用配置页完成，不再让聊天用户在 Agent 会话中扫码授权。"
    ]
  },
  {
    version: "1.6.3",
    date: "2026-06-16",
    highlights: [
      "修复飞书资料查询时 lark-cli 锁文件被 sandbox 拦截的问题。",
      "继续保持不同 Bot 的状态和会话目录隔离。"
    ]
  },
  {
    version: "1.6.2",
    date: "2026-06-16",
    highlights: [
      "新增单次 Agent 最大步数配置，默认提高到 60，减少复杂检索中断。",
      "Agent 达到最大步数时会向用户说明原因。"
    ]
  },
  {
    version: "1.6.1",
    date: "2026-06-16",
    highlights: [
      "修复导入同名 Skill 后在技能市场看不到的问题。",
      "正在被 Bot 使用的本地 Skill 现在不能直接删除，需先取消授权。"
    ]
  },
  {
    version: "1.6.0",
    date: "2026-06-15",
    highlights: [
      "找到高匹配飞书文件时可先回复基本答案，确认后继续等待下载和分析。",
      "Bot 可选择展示 Agent 工作进度，并保持模型私有推理不外露。",
      "Skill 市场和会话支持点击预览，导入、筛选和 Bot Skill 授权体验得到改进。"
    ]
  },
  {
    version: "1.5.1",
    date: "2026-06-15",
    highlights: [
      "修复 Agent 在 macOS 隔离环境中无法读取或导出飞书文档的问题。",
      "用户态授权新增飞书文档搜索权限，并优化云 PPT 的查找与导出流程。"
    ]
  },
  {
    version: "1.5.0",
    date: "2026-06-15",
    highlights: [
      "新增技能市场管理和授权概览，可按来源、未授权状态筛选并批量调整 Bot 授权。",
      "多人同时提问时，超出并发上限的任务会有序排队，并在运行台展示排队数量。",
      "Bot 可配置 Owner；Agent 需要人工协助或授权时，可通过飞书卡片请求 Owner 处理。",
      "优化消息处理耗时日志和 lark-cli 自动初始化，提升问题定位与首次使用体验。"
    ]
  },
  {
    version: "1.4.1",
    date: "2026-06-14",
    highlights: [
      "应用内新增版本号入口，点击即可查看更新记录。",
      "补充面向用户的版本说明，方便了解每次更新带来的变化。"
    ]
  },
  {
    version: "1.4.0",
    date: "2026-06-14",
    highlights: [
      "每个已注册机器人现在可以独立启动和停止监听。",
      "点击机器人即可查看它的详细日志，并可按日志等级筛选。",
      "导入或同步的 Skill 默认不会授权给任何机器人，需要在配置中主动勾选。",
      "启动机器人前会检查机器人凭据和模型连接是否配置完整。"
    ]
  },
  {
    version: "1.3.2",
    date: "2026-06-14",
    highlights: [
      "扩大窗口可拖动区域，让 macOS 上的窗口移动更顺手。"
    ]
  },
  {
    version: "1.3.0",
    date: "2026-06-14",
    highlights: [
      "新增 HTTPS Git Skill 市场，无需在电脑上安装 Git。",
      "新增按会话选择性清理，并增强 Office 文件处理能力。"
    ]
  },
  {
    version: "1.2.0",
    date: "2026-06-13",
    highlights: [
      "内置 Word、PowerPoint 和 Excel Skills。",
      "新增会话存储统计与清理能力。"
    ]
  },
  {
    version: "1.1.0",
    date: "2026-06-13",
    highlights: [
      "新增连续会话、图片消息处理和飞书 CLI 能力。"
    ]
  },
  {
    version: "1.0.0",
    date: "2026-06-13",
    highlights: [
      "首次发布，支持多机器人、Skill 授权和飞书消息处理。"
    ]
  }
];

export function appInfo(version: string): AppInfo {
  return { version, releases };
}
