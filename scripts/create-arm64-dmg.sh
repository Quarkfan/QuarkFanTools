#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
APP="${APP_DIR:-$ROOT/release/arm64/mac-arm64/QuarkfanTools.app}"
DMG="${DMG_PATH:-$ROOT/release/arm64/QuarkfanTools-${VERSION}-arm64.dmg}"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/quarkfantools-dmg.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT

if [[ ! -d "$APP" ]]; then
  echo "Missing packaged app: $APP" >&2
  exit 1
fi

mkdir -p "$(dirname "$DMG")"
ditto "$APP" "$STAGING/QuarkfanTools.app"
ln -s /Applications "$STAGING/Applications"

hdiutil create \
  -volname "QuarkfanTools ${VERSION}" \
  -srcfolder "$STAGING" \
  -ov \
  -fs HFS+ \
  -layout NONE \
  -format UDZO \
  "$DMG"

file "$DMG"
