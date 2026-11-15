// electron-builder の設定。ファイル名は electron-builder.js のままにすること
// （electron-builder が自動で読むのは electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts} だけ。
//  electron-builder.config.js のような名前は --config で渡さないと無視される）。
// 署名と公証は環境変数で渡す。何も渡さなければ署名なし・公証なしでビルドする
// （cloneした人がそのままビルドできるように）。
//
//   CSC_NAME="名前 (TEAMID)" npm run pack   ← "Developer ID Application:" は付けない
//   scripts/release-mac.sh                  ← 署名・公証済みの dmg を作る
//
// 公証は APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID が揃っているときだけ動く
// （release-mac.sh が渡す）。
const notarize = Boolean(
  process.env.APPLE_ID || process.env.APPLE_API_KEY || process.env.APPLE_KEYCHAIN_PROFILE
);

module.exports = {
  appId: 'net.trends-ai.local-note',
  productName: 'local-note',
  directories: { output: 'dist' },
  files: ['main.js', 'preload.js', 'renderer/**/*', 'package.json'],
  mac: {
    category: 'public.app-category.productivity',
    target: [{ target: 'dmg', arch: ['arm64'] }],
    icon: 'build/icon.icns',
    identity: process.env.CSC_NAME || null,
    hardenedRuntime: true,
    notarize,
    extendInfo: {
      NSDocumentsFolderUsageDescription: 'メモの保存先フォルダを読み書きするために使います。',
      NSDesktopFolderUsageDescription: 'メモの保存先にデスクトップ配下を選んだ場合に、その読み書きのために使います。',
      NSDownloadsFolderUsageDescription: 'メモの保存先にダウンロード配下を選んだ場合に、その読み書きのために使います。',
      NSRemovableVolumesUsageDescription: 'メモの保存先に外付けドライブを選んだ場合に、その読み書きのために使います。',
    },
  },
  // dmg 自体の署名と公証は release-mac.sh でやる（開いた時点で Gatekeeper の確認を済ませるため）。
  dmg: { sign: false },
};
