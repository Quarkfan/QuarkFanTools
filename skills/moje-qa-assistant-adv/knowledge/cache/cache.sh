#!/usr/bin/env bash
# 飞书大文件缓存管理脚本
# 用法:
#   ./cache.sh check <doc_id>          检查缓存是否命中（返回 0=命中 1=未命中）
#   ./cache.sh info <doc_id>           查看缓存信息（文件名、大小、缓存时间）
#   ./cache.sh register <doc_id> <file_type> <filename>  注册新缓存条目
#   ./cache.sh expire <doc_id>         标记缓存过期
#   ./cache.sh clean                   清理所有过期缓存
#   ./cache.sh list                    列出所有缓存条目

CACHE_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$CACHE_DIR/manifest.json"
TTL_DAYS=7

check_cache() {
  local doc_id="$1"
  local file="$(jq -r --arg id "$doc_id" '.files[] | select(.doc_id == $id) | .filename' "$MANIFEST" 2>/dev/null)"
  if [ -z "$file" ] || [ "$file" = "null" ]; then
    return 1  # 未命中
  fi
  local cached_at="$(jq -r --arg id "$doc_id" '.files[] | select(.doc_id == $id) | .cached_at' "$MANIFEST")"
  local cached_ts=$(date -j -f "%Y-%m-%d" "$cached_at" +%s 2>/dev/null || echo 0)
  local now_ts=$(date +%s)
  local age_days=$(( (now_ts - cached_ts) / 86400 ))
  if [ "$age_days" -ge "$TTL_DAYS" ]; then
    return 1  # 已过期
  fi
  local filepath="$CACHE_DIR/$file"
  if [ -f "$filepath" ]; then
    echo "$filepath"
    return 0  # 命中
  fi
  return 1  # 文件不存在
}

cache_info() {
  local doc_id="$1"
  jq --arg id "$doc_id" '.files[] | select(.doc_id == $id)' "$MANIFEST" 2>/dev/null
}

register_cache() {
  local doc_id="$1"
  local file_type="$2"
  local filename="$3"
  local today=$(date +%Y-%m-%d)
  local tmp=$(mktemp)
  jq --arg id "$doc_id" --arg ft "$file_type" --arg fn "$filename" --arg dt "$today" \
    '.files += [{"doc_id": $id, "file_type": $ft, "filename": $fn, "cached_at": $dt, "ttl_days": '"$TTL_DAYS"'}]' \
    "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
  echo "✅ 已注册缓存: $doc_id → $filename"
}

expire_cache() {
  local doc_id="$1"
  local tmp=$(mktemp)
  jq --arg id "$doc_id" '.files |= map(select(.doc_id != $id))' "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
  echo "🗑️ 已使缓存过期: $doc_id"
}

clean_cache() {
  local today=$(date +%s)
  local count=0
  for entry in $(jq -c '.files[]' "$MANIFEST" 2>/dev/null); do
    local cached_at=$(echo "$entry" | jq -r '.cached_at')
    local cached_ts=$(date -j -f "%Y-%m-%d" "$cached_at" +%s 2>/dev/null || echo 0)
    local age_days=$(( (today - cached_ts) / 86400 ))
    if [ "$age_days" -ge "$TTL_DAYS" ]; then
      local doc_id=$(echo "$entry" | jq -r '.doc_id')
      local filename=$(echo "$entry" | jq -r '.filename')
      rm -f "$CACHE_DIR/$filename"
      expire_cache "$doc_id"
      count=$((count + 1))
    fi
  done
  echo "🧹 已清理 $count 个过期缓存"
}

list_cache() {
  jq -r '.files[] | "\(.doc_id)  \(.file_type)  \(.filename)  \(.cached_at)"' "$MANIFEST" 2>/dev/null | column -t
}

case "$1" in
  check)    check_cache "$2" ;;
  info)     cache_info "$2" ;;
  register) register_cache "$2" "$3" "$4" ;;
  expire)   expire_cache "$2" ;;
  clean)    clean_cache ;;
  list)     list_cache ;;
  *)        echo "用法: $0 {check|info|register|expire|clean|list} [args...]" ;;
esac
