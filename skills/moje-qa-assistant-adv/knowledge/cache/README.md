# 飞书大文件缓存说明

## 目录结构

```
cache/
├── manifest.json          ← 缓存清单（记录 doc_id、文件名、缓存时间、过期时间）
├── cache.sh               ← 缓存管理脚本（check/register/expire/clean）
├── README.md              ← 本文件
├── ppt_{doc_id}.md        ← 缓存的 PPT 提取内容
├── doc_{doc_id}.md        ← 缓存的 Word/文档 提取内容
├── sheet_{doc_id}.md      ← 缓存的 Excel/表格 提取内容
└── ...
```

## 缓存策略

| 策略项 | 值 |
|--------|-----|
| 缓存位置 | `knowledge/cache/` |
| 过期时间 | 7 天 |
| 缓存键 | 飞书文档 ID（doc_id / file_token） |
| 缓存格式 | Markdown |
| 命名规则 | `{类型}_{doc_id}.md` |

## 类型前缀

| 文件类型 | 前缀 | 示例 |
|---------|------|------|
| PPT/幻灯片 | `ppt_` | `ppt_T1mxsNyRglGGfxdrSXocWjn0n9c.md` |
| Word/文档 | `doc_` | `doc_XGbUdyLusooyJyxRdJ3ci1BenXg.md` |
| Excel/表格 | `sheet_` | `sheet_abc123.md` |
| 图片 | `img_` | `img_xyz789.png` |

## 缓存命中流程

```
用户提问
  → 本地 knowledge/ 文件
    → 未命中？→ 检查 cache/ 缓存清单
      → 命中且未过期？→ 直接读取缓存文件
      → 未命中或已过期？→ 从飞书拉取 → 写入 cache/ → 更新 manifest.json → 读取
```

## 管理命令

```bash
cd knowledge/cache/

# 检查某个文档是否有缓存（返回 0=命中，1=未命中）
./cache.sh check T1mxsNyRglGGfxdrSXocWjn0n9c

# 查看缓存详情
./cache.sh info T1mxsNyRglGGfxdrSXocWjn0n9c

# 注册新缓存条目（拉取文件后调用）
./cache.sh register T1mxsNyRglGGfxdrSXocWjn0n9c ppt ppt_T1mxsNyRglGGfxdrSXocWjn0n9c.md

# 手动使某个缓存过期
./cache.sh expire T1mxsNyRglGGfxdrSXocWjn0n9c

# 清理所有过期缓存
./cache.sh clean

# 列出所有缓存条目
./cache.sh list
```
