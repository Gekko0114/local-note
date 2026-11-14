// electron-builder の設定。
// 署名は環境変数で渡す。何も渡さなければ署名なしでビルドする（cloneした人がそのまま
// ビルドできるように）。自分の証明書で署名したいときは、こう実行する:
//   CSC_NAME="名前 (TEAMID)" npm run pack      ← "Developer ID Application:" は付けない
module.exports = {
  appId: 'net.trends-ai.local-note',
  productName: 'local-note',
  directories: { output: 'dist' },
  files: ['main.js', 'preload.js', 'renderer/**/*', 'package.json'],
  mac: {
    category: 'public.app-category.productivity',
    target: [{ target: 'dir', arch: ['arm64'] }],
    icon: 'build/icon.icns',
    identity: process.env.CSC_NAME || null,
    extendInfo: {
      NSDocumentsFolderUsageDescription: 'メモの保存先フォルダを読み書きするために使います。',
      NSDesktopFolderUsageDescription: 'メモの保存先にデスクトップ配下を選んだ場合に、その読み書きのために使います。',
      NSDownloadsFolderUsageDescription: 'メモの保存先にダウンロード配下を選んだ場合に、その読み書きのために使います。',
      NSRemovableVolumesUsageDescription: 'メモの保存先に外付けドライブを選んだ場合に、その読み書きのために使います。',
    },
  },
};
