# アイコンの作り方

`icon.html` が 1024×1024 のアイコンを Canvas で描き、`render.js`（Electron）が PNG に焼く。
字は macOS の iMovie に同梱されている Old English Text を参照している。

```bash
# 大サイズ用 / 小サイズ用 / サイドバー用（透過）
electron render.js icon.html out.png 1024
```

`icon.html` の URL に `?small`（16〜32px用に字を大きく、装飾なし）、
`?mark`（タイル無しの字だけ、透過背景）を付けると描き分ける。

焼いた PNG を `sips` で各サイズに落とし、`iconutil -c icns build/icon.iconset` で `icon.icns` にする。
