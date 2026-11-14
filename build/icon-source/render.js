// HTMLを指定サイズでPNGに焼く小さなレンダラ
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const [htmlPath, outPath, sizeArg] = process.argv.slice(2);
const size = Number(sizeArg || 1024);

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: size, height: size, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadFile(htmlPath);
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPath, img.toPNG());
  console.log('saved', outPath, img.getSize());
  app.exit(0);
});
