#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/logo.png"
ICONSET="$(mktemp -d "${TMPDIR:-/tmp}/quarkfantools-iconset.XXXXXX")/QuarkfanTools.iconset"
DEST="$ROOT/build/icon.icns"
trap 'rm -rf "$(dirname "$ICONSET")"' EXIT

mkdir -p "$ICONSET" "$(dirname "$DEST")"

make_icon() {
  local size="$1"
  local scale="$2"
  local pixels="$((size * scale))"
  local suffix
  if [[ "$scale" == "2" ]]; then
    suffix="@2x"
  else
    suffix=""
  fi
  sips -z "$pixels" "$pixels" "$SOURCE" --out "$ICONSET/icon_${size}x${size}${suffix}.png" >/dev/null
}

make_icon 16 1
make_icon 16 2
make_icon 32 1
make_icon 32 2
make_icon 128 1
make_icon 128 2
make_icon 256 1
make_icon 256 2
make_icon 512 1
make_icon 512 2

iconutil -c icns "$ICONSET" -o "$DEST"
file "$DEST"
