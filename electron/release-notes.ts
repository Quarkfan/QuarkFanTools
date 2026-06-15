import type { AppInfo } from "./types.js";

const releases: AppInfo["releases"] = [
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
