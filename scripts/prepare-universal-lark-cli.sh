#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_ROOT="$ROOT/node_modules/@larksuite/cli"
VERSION="$(node -p "require('$PACKAGE_ROOT/package.json').version")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/quarkfantools-lark-cli.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

download_arch() {
  local arch="$1"
  local archive="lark-cli-${VERSION}-darwin-${arch}.tar.gz"
  local url="https://registry.npmmirror.com/-/binary/lark-cli/v${VERSION}/${archive}"
  curl --fail --location --silent --show-error --connect-timeout 10 --max-time 180 --output "$WORK/$archive" "$url"
  tar -xzf "$WORK/$archive" -C "$WORK/$arch"
}

mkdir -p "$WORK/arm64" "$WORK/amd64" "$PACKAGE_ROOT/bin"
download_arch arm64
download_arch amd64

lipo -create \
  "$WORK/arm64/lark-cli" \
  "$WORK/amd64/lark-cli" \
  -output "$PACKAGE_ROOT/bin/lark-cli"
chmod 755 "$PACKAGE_ROOT/bin/lark-cli"
lipo -info "$PACKAGE_ROOT/bin/lark-cli"
