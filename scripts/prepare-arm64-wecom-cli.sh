#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/node_modules/@wecom/cli/package.json').version")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/quarkfantools-wecom-cli.XXXXXX")"
DEST="$ROOT/runtime/wecom-cli"
trap 'rm -rf "$WORK"' EXIT

prepare_arch() {
  local npm_arch="$1"
  local dest_arch="$2"
  local tarball
  tarball="$(cd "$WORK" && npm pack "@wecom/cli-darwin-${npm_arch}@${VERSION}" --silent)"
  mkdir -p "$WORK/$dest_arch"
  tar -xzf "$WORK/$tarball" -C "$WORK/$dest_arch"
}

prepare_arch arm64 arm64

rm -rf "$DEST"
mkdir -p "$DEST/bin"
cp "$WORK/arm64/package/bin/wecom-cli" "$DEST/bin/wecom-cli"
chmod 755 "$DEST/bin/wecom-cli"
file "$DEST/bin/wecom-cli"
