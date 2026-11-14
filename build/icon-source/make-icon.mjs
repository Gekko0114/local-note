#!/usr/bin/env node
// アイコン一式を焼き直す:  npm run icon
// build/icon.icns, build/icon.png, renderer/mark.png, renderer/app-icon.png を作る。
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const build = path.join(root, 'build');
const tmp = path.join(build, '.icon-tmp');
const iconset = path.join(build, 'icon.iconset');
const electron = path.join(root, 'node_modules', '.bin', 'electron');

if (process.platform !== 'darwin') {
  console.error('icns を作るのに sips と iconutil を使うので、macOS でだけ動きます。');
  process.exit(1);
}
if (!existsSync(electron)) { console.error('先に npm install してください。'); process.exit(1); }

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const render = (out, query) =>
  run(electron, [path.join(here, 'render.js'), path.join(here, 'icon.html'), out, '1024', ...(query ? [query] : [])]);
const resize = (src, size, out) => run('sips', ['-z', String(size), String(size), src, '--out', out]);

rmSync(tmp, { recursive: true, force: true });
rmSync(iconset, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(iconset, { recursive: true });

const big = path.join(tmp, 'big.png');
const small = path.join(tmp, 'small.png');
const mark = path.join(tmp, 'mark.png');
console.log('描画中…');
render(big);            // 128px以上用
render(small, 'small'); // 16〜32px用（字を大きく）
render(mark, 'mark');   // サイドバー用（透過）

// 小さいサイズは small から、大きいサイズは big から作る
const plan = [
  ['icon_16x16.png', 16, small], ['icon_16x16@2x.png', 32, small],
  ['icon_32x32.png', 32, small], ['icon_32x32@2x.png', 64, small],
  ['icon_128x128.png', 128, big], ['icon_128x128@2x.png', 256, big],
  ['icon_256x256.png', 256, big], ['icon_256x256@2x.png', 512, big],
  ['icon_512x512.png', 512, big], ['icon_512x512@2x.png', 1024, big],
];
for (const [name, size, src] of plan) resize(src, size, path.join(iconset, name));

console.log('icns を作成中…');
run('iconutil', ['-c', 'icns', iconset, '-o', path.join(build, 'icon.icns')]);
copyFileSync(big, path.join(build, 'icon.png'));
resize(mark, 256, path.join(root, 'renderer', 'mark.png'));
resize(big, 256, path.join(root, 'renderer', 'app-icon.png'));
rmSync(tmp, { recursive: true, force: true });
rmSync(iconset, { recursive: true, force: true });
console.log('できました: build/icon.icns, build/icon.png, renderer/mark.png, renderer/app-icon.png');
