# 当前状态

最后更新：2026-07-05

## 父项目定位

当前仓库已清理为 QuarkfanTools 平台父项目，用于统一管理各独立模块。父项目不再直接承载 macOS 单机版应用源码。

## 子模块

| 模块 | 路径 | 远端 | 状态 |
| --- | --- | --- | --- |
| QuarkfanTools 单机版 | `QuarkfanTools-Single/` | `git@github.com:Quarkfan/QuarkfanTools-Single.git` | 已从原仓库完整历史克隆并推送 `main` 与全部历史 tags，当前指向 `a5346e4` / `v2.2.6` 发布提交。 |
| Message Gateway | `Message-Gateway/` | `git@github.com:Quarkfan/Message-Gateway.git` | 已迁入 MG 相关设计文档并推送 `main`，当前指向 `276c3c4`。 |

## 操作约定

- 单机版开发、测试、打包和发版进入 `QuarkfanTools-Single/`。
- Message Gateway 设计和后续实现进入 `Message-Gateway/`。
- 父项目只提交 `.gitmodules`、子模块 gitlink、顶层导航文档和平台总设计文档。
- 平台总设计文档在 `docs/`；子模块专属设计文档放在对应子模块内。
- 子模块更新流程：先在子仓库提交并推送，再回到父项目更新 gitlink。

## 最近验证

- `QuarkfanTools-Single` 已推送 `main` 和全部历史 tags 到远端。
- `Message-Gateway` 已推送 `main` 到远端。
- 父项目 `git diff --check` 通过。
