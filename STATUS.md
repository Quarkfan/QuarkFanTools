# 当前状态

最后更新：2026-07-05

## 父项目定位

当前仓库已清理为 QuarkfanTools 平台父项目，用于统一管理各独立模块。父项目不再直接承载 macOS 单机版应用源码。

## 子模块

| 模块 | 路径 | 远端 | 状态 |
| --- | --- | --- | --- |
| QuarkfanTools 单机版 | `QuarkfanTools-Single/` | `git@github.com:Quarkfan/QuarkfanTools-Single.git` | 已从原仓库完整历史克隆并推送 `main` 与全部历史 tags，当前指向 `9193f38`，保留 `v2.2.6` 发布标签。 |
| Message Gateway | `Message-Gateway/` | `git@github.com:Quarkfan/Message-Gateway.git` | 已迁入 MG 相关设计文档并推送 `main`，当前指向 `7e9e92c`。 |
| Reference Projects | `Reference-Projects/` | 父项目目录 | 用于管理 `docs/platform-reference-matrix.md` 中参考项目的本地源码阅读、综合评估和借鉴点抽取；本地 clone 的上游源码放在 `Reference-Projects/sources/` 且不提交。 |

## 操作约定

- 单机版开发、测试、打包和发版进入 `QuarkfanTools-Single/`。
- Message Gateway 设计和后续实现进入 `Message-Gateway/`。
- 父项目只提交 `.gitmodules`、子模块 gitlink、顶层导航文档和平台总设计文档。
- 平台总设计文档在 `docs/`；子模块专属设计文档放在对应子模块内。
- `docs/platform-reference-matrix.md` 是各中心建模参考矩阵，用于提供开源项目拆解、对照和反例检查，不作为任何中心的强制实现方案。
- `Reference-Projects/` 是参考项目源码级评估工作区，可以本地 clone 开源项目，但只提交我们的评估记录、抽取结论和管理说明。
- 子模块更新流程：先在子仓库提交并推送，再回到父项目更新 gitlink。

## 最近验证

- `QuarkfanTools-Single` 已推送 `main` 和全部历史 tags 到远端。
- `Message-Gateway` 已推送 `main` 到远端。
- 父项目 `git diff --check` 通过。
