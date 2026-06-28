#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/tools/vision-ocr/main.swift"
DEST="$ROOT/runtime/vision-ocr/arm64"
BIN="$DEST/qft-vision-ocr"

mkdir -p "$DEST"
CLANG_MODULE_CACHE_PATH="${CLANG_MODULE_CACHE_PATH:-/private/tmp/qft-clang-cache}" \
SWIFT_MODULE_CACHE_PATH="${SWIFT_MODULE_CACHE_PATH:-/private/tmp/qft-swift-cache}" \
  swiftc -O -target arm64-apple-macos12 "$SRC" -o "$BIN"
chmod +x "$BIN"
file "$BIN"
