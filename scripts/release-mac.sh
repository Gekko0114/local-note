#!/usr/bin/env bash
# release-mac.sh — 署名・公証済みの dmg を作る。
#
#   scripts/release-mac.sh
#
# 前提:
#   - キーチェーンに Developer ID Application 証明書がある
#       security find-identity -v -p codesigning
#   - Apple ID のアプリ用パスワードがキーチェーンにある
#       security add-generic-password -a <Apple ID> -s <KEYCHAIN_SERVICE> -w
#   - scripts/release.env に自分の値を書く（git には入らない。release.env.example を参照）
#
# 出力: dist/local-note-<版>-arm64.dmg
#       （中の .app も dmg も署名・公証・ステープル済み）
set -euo pipefail
cd "$(dirname "$0")/.."

# 秘密はリポジトリに置かない。環境変数か、git 管理外の scripts/release.env から読む。
if [ -f scripts/release.env ]; then
  # shellcheck disable=SC1091
  . scripts/release.env
fi

: "${CSC_NAME:?CSC_NAME を設定してください（例: 山田太郎 (TEAMID)。"Developer ID Application:" は付けない）}"
: "${APPLE_ID:?APPLE_ID を設定してください（Apple Developer の Apple ID）}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID を設定してください（10文字のチームID）}"

SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: ${CSC_NAME}}"
KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-local-note}"

if [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
  APPLE_APP_SPECIFIC_PASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$APPLE_ID" -w)"
fi

# electron-builder はこの3つが揃っていると .app を公証してステープルまで行う。
export CSC_NAME APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD

echo "==> build + sign + notarize .app, then dmg"
rm -f dist/*.dmg
./node_modules/.bin/electron-builder --mac --arm64

APP="dist/mac-arm64/local-note.app"
DMG="$(ls -t dist/*.dmg | head -1)"
[ -d "$APP" ] || { echo "missing $APP" >&2; exit 1; }
[ -f "$DMG" ] || { echo "dmg が作られていません" >&2; exit 1; }

echo "==> verify .app"
codesign --verify --deep --strict "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose "$APP"

# dmg 自体も署名・公証しておくと、開いた時点で Gatekeeper の確認が済む。
echo "==> sign + notarize dmg: $(basename "$DMG")"
codesign --force --timestamp --sign "$SIGNING_IDENTITY" "$DMG"
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait
xcrun stapler staple "$DMG"
spctl --assess --type open --context context:primary-signature --verbose "$DMG"

echo "==> done: $DMG"
