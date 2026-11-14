# Icon / アイコンの作り方

```bash
npm run icon
```

This re-bakes everything: `build/icon.icns`, `build/icon.png`, `renderer/mark.png` and
`renderer/app-icon.png`. macOS only — it uses `sips` and `iconutil`.

これだけで `build/icon.icns` / `build/icon.png` / `renderer/mark.png` / `renderer/app-icon.png`
が焼き直されます。`sips` と `iconutil` を使うので macOS 専用です。

## How it works / 仕組み

`icon.html` draws the 1024×1024 icon on a canvas and `render.js` (Electron) captures it as a PNG.
The letter is set in **UnifrakturCook Bold**, which is bundled here under the SIL Open Font License —
so the icon can be rebuilt on any machine, with no system font required.

`icon.html` が Canvas でアイコンを描き、`render.js`（Electron）が PNG に焼きます。
書体は同梱の **UnifrakturCook Bold**（SIL OFL 1.1）なので、どの環境でも同じものを焼き直せます。

```bash
# 単発で焼く場合 / to bake a single file
node_modules/.bin/electron build/icon-source/render.js build/icon-source/icon.html out.png 1024 [small|mark]
```

| Variant | Purpose / 用途 |
| --- | --- |
| (none) | 128px and up. White tile with a hairline border / 128px以上用。白タイル＋薄い縁 |
| `small` | For 16–32px. Bigger letter, no inner border / 16〜32px用。字を大きく、内側の縁なし |
| `mark` | No tile, transparent. The sidebar mark / タイル無し・透過。サイドバー用 |

To use a different letter, change `LETTER` in `icon.html`.
文字を変えるときは `icon.html` の `LETTER` を書き換えてください。

## Font license / フォントのライセンス

`fonts/UnifrakturCook-Bold.ttf` — UnifrakturCook by j. 'mach' wust, based on work by Peter Wiegel.
Licensed under the SIL Open Font License 1.1. The full text is in `fonts/OFL.txt`.
The font is used only to generate the icon; it is **not** bundled into the application.

アイコンの生成にだけ使っており、アプリ本体には同梱していません。
