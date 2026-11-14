# Icon / アイコンの作り方

`icon.html` draws the 1024×1024 icon on a canvas, and `render.js` (Electron) bakes it into a PNG.
The letterform comes from Old English Text, the font bundled with macOS's iMovie — the same style of
blackletter as the L in Death Note.

`icon.html` が 1024×1024 のアイコンを Canvas で描き、`render.js`（Electron）が PNG に焼く。
字は macOS の iMovie に同梱されている Old English Text（Death Note の L と同じ系統の書体）を参照している。

```bash
electron render.js icon.html out.png 1024
```

Add a query to `icon.html` to switch variants / `icon.html` の URL に付ける指定：

| Query | Purpose / 用途 |
| --- | --- |
| (none) | 128px and up. White tile with a hairline border / 128px以上用。白タイル＋薄い縁 |
| `?small` | For 16–32px. Bigger letter, no inner border / 16〜32px用。字を大きく、内側の縁なし |
| `?mark` | No tile, transparent. Used for the sidebar mark / タイル無し・透過。サイドバー用 |

Scale the PNGs with `sips` into `build/icon.iconset/`, then
`iconutil -c icns build/icon.iconset -o build/icon.icns`.
To use a different letter, change `LETTER` in `icon.html`.

焼いた PNG を `sips` で各サイズに落として `build/icon.iconset/` に並べ、
`iconutil -c icns build/icon.iconset -o build/icon.icns` で icns にする。
文字を変えるときは `icon.html` の `LETTER` を書き換える。
