#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/quarkfantools-claude.XXXXXX")"
DEST="$ROOT/runtime/claude"
trap 'rm -rf "$WORK"' EXIT

prepare_arch() {
  local npm_arch="$1"
  local dest_arch="$2"
  local tarball
  tarball="$(cd "$WORK" && npm pack "@anthropic-ai/claude-agent-sdk-darwin-${npm_arch}@${VERSION}" --silent)"
  mkdir -p "$WORK/$dest_arch"
  tar -xzf "$WORK/$tarball" -C "$WORK/$dest_arch"
  rm -rf "$DEST/$dest_arch"
  mkdir -p "$DEST/$dest_arch"
  cp "$WORK/$dest_arch/package/claude" "$DEST/$dest_arch/claude"
  chmod +x "$DEST/$dest_arch/claude"
}

mkdir -p "$DEST"
prepare_arch arm64 arm64
prepare_arch x64 x64

file "$DEST/arm64/claude"
file "$DEST/x64/claude"
