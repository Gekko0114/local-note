# アイコンの作り方

`icon.html` が 1024×1024 のアイコンを Canvas で描き、`render.js`（Electron）が PNG に焼く。
字は macOS の iMovie に同梱されている Old English Text（Death Note の L と同じ系統の書体）を参照している。

```bash
electron render.js icon.html out.png 1024
```

`icon.html` の URL に付ける指定：

| 指定 | 用途 |
|---|---|
| なし | 128px以上用。白タイル＋薄い縁 |
| `?small` | 16〜32px用。字を大きく、内側の縁なし |
| `?mark` | タイル無し・透過。アプリ内のサイドバー用 |

焼いた PNG を `sips` で各サイズに落として `build/icon.iconset/` に並べ、
`iconutil -c icns build/icon.iconset -o build/icon.icns` で icns にする。
文字を変えるときは `icon.html` の `LETTER` を書き換える。
