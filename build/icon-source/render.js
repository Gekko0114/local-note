// HTML を指定サイズで PNG に焼く小さなレンダラ
//   electron render.js icon.html out.png 1024 [small|mark]
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [htmlPath, outPath, sizeArg, query] = process.argv.slice(2);
const size = Number(sizeArg || 1024);

app.disableHardwareAcceleration();
// 焼けないまま止まらないように、保険の時間切れを置く
const bail = setTimeout(() => { console.error('タイムアウト: 描画が終わりませんでした'); app.exit(1); }, 30000);

app.whenReady().then(async () => {
  // ウィンドウは画面より大きくできないので、縮小して描かせてから指定サイズへ戻す
  const dpr = screen.getPrimaryDisplay().scaleFactor || 1;
  const css = Math.min(size, Math.floor(Math.min(screen.getPrimaryDisplay().workAreaSize.width,
                                                 screen.getPrimaryDisplay().workAreaSize.height) * 0.8));
  const win = new BrowserWindow({
    width: css, height: css,
    x: -4000, y: 0,            // 画面の外に出して描かせる（offscreen は環境差が大きいので使わない）
    frame: false, transparent: true, hasShadow: false, skipTaskbar: true,
    useContentSize: true,
    webPreferences: { backgroundThrottling: false, zoomFactor: css / size },
  });
  win.setIgnoreMouseEvents(true);
  await win.loadFile(path.resolve(htmlPath), query ? { search: query } : undefined);
  await new Promise((r) => setTimeout(r, 800));   // フォント読み込みと描画を待つ
  const shot = await win.webContents.capturePage();
  const img = (shot.getSize().width === size && shot.getSize().height === size)
    ? shot
    : shot.resize({ width: size, height: size, quality: 'best' });
  fs.writeFileSync(outPath, img.toPNG());
  void dpr;
  clearTimeout(bail);
  console.log('saved', outPath, img.getSize());
  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
