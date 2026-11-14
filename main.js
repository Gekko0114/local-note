// local-note — Electron メインプロセス（ファイル保存・メニュー・ウィンドウ）
'use strict';

const { app, BrowserWindow, ipcMain, Menu, dialog, shell, protocol, net, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const isMac = process.platform === 'darwin';
let win = null;
let setupWin = null;

/* ------------------------------------------------------------------ */
/* 設定 / データディレクトリ                                            */
/* ------------------------------------------------------------------ */
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  const next = Object.assign(readSettings(), patch);
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  return next;
}

function dataDir() {
  const s = readSettings();
  return s.dataDir || defaultDataDir();
}
const pagesDir = () => path.join(dataDir(), 'pages');
const filesDir = () => path.join(dataDir(), 'files');

// 書類・デスクトップ・ダウンロードは macOS の保護対象（許可がないと読めない）なので、
// 既定の保存先はホーム直下にする
const defaultDataDir = () => path.join(app.getPath('home'), 'local-note');
const legacyDataDirs = () => [
  path.join(app.getPath('documents'), 'local-note'),
  path.join(app.getPath('documents'), 'local-notion'),
  path.join(app.getPath('home'), 'local-notion'),
];

// そのフォルダに既にメモが何件あるか（pages/*.md の数）
function countPages(dir) {
  try { return fs.readdirSync(path.join(dir, 'pages')).filter((n) => n.endsWith('.md')).length; }
  catch { return 0; }
}

// 初回起動か（＝保存先をまだ一度も決めていないか）
function needsSetup() {
  if (readSettings().dataDir) return false;
  // 既定の場所に既にメモがある旧バージョンからの更新では、聞かずにそれを使う
  if (countPages(defaultDataDir()) > 0) {
    writeSettings({ dataDir: defaultDataDir() });
    return false;
  }
  return true;
}

// 旧い保存先（local-notion、書類フォルダの下）からの引き継ぎを一度だけ行う
function migrateFromOldName() {
  const supportDir = path.dirname(app.getPath('userData'));
  const oldSettings = path.join(supportDir, 'local-notion', 'settings.json');
  if (!fs.existsSync(settingsPath()) && fs.existsSync(oldSettings)) {
    try {
      fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
      fs.copyFileSync(oldSettings, settingsPath());
    } catch (err) { console.error('[main] 旧設定の引き継ぎに失敗:', err); }
  }
  if (readSettings().dataDir) return; // 保存先を自分で指定しているときは触らない
  const next = defaultDataDir();
  if (fs.existsSync(next)) return;
  for (const prev of legacyDataDirs()) {
    if (!fs.existsSync(prev)) continue;
    try {
      fs.renameSync(prev, next);
      console.log('[main] データフォルダを移しました:', prev, '->', next);
    } catch (err) {
      // 移せなかったら旧フォルダをそのまま使い続ける（データを失わないため）
      console.error('[main] データフォルダの移動に失敗、旧フォルダを使います:', err);
      try { writeSettings({ dataDir: prev }); } catch {}
    }
    return;
  }
}

// 保存先が読み書きできるか。できなければエラーを返す
function dataDirAccessError() {
  try {
    fs.mkdirSync(pagesDir(), { recursive: true });
    fs.mkdirSync(filesDir(), { recursive: true });
    fs.readdirSync(pagesDir());
    return null;
  } catch (err) {
    return err;
  }
}

const isPermissionError = (err) => err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EROFS');

// macOS の「ファイルとフォルダ」の許可で弾かれたときに、黙って落ちずに案内する
async function resolveAccessProblem(err) {
  const dir = dataDir();
  const permission = isPermissionError(err);
  const res = await dialog.showMessageBox({
    type: 'warning',
    title: 'メモのフォルダを開けません',
    message: permission ? 'macOS にフォルダへのアクセスを止められています' : 'メモのフォルダを読み取れませんでした',
    detail:
      `${dir}\n\n` +
      (permission
        ? 'システム設定 › プライバシーとセキュリティ › ファイルとフォルダ で local-note に許可を与えてから「再試行」を押してください。\n' +
          '許可の項目が出てこない場合は、ターミナルで次を実行してからアプリを開き直すと、許可を聞かれるようになります。\n' +
          '  tccutil reset SystemPolicyDocumentsFolder net.trends-ai.local-note\n\n' +
          '書類・デスクトップ・ダウンロード以外のフォルダ（例：ホーム直下）を選べば、この許可は不要になります。\n\n'
        : '') +
      `(${err.code || 'error'}: ${err.message})`,
    buttons: ['再試行', 'システム設定を開く', '別のフォルダを選ぶ…', '終了'],
    defaultId: 0,
    cancelId: 3,
  });

  if (res.response === 1) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders');
    return;
  }
  if (res.response === 2) {
    const picked = await dialog.showOpenDialog({
      title: 'メモの保存先を選ぶ',
      message: 'このフォルダの中に pages/ と files/ を作ります。',
      buttonLabel: 'このフォルダにする',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('home'),
    });
    if (!picked.canceled && picked.filePaths[0]) writeSettings({ dataDir: picked.filePaths[0] });
    return;
  }
  if (res.response === 3) app.exit(0);
}

function ensureDirs() {
  fs.mkdirSync(pagesDir(), { recursive: true });
  fs.mkdirSync(filesDir(), { recursive: true });
}

/* ------------------------------------------------------------------ */
/* ページの読み書き（フロントマター付き Markdown）                       */
/* ------------------------------------------------------------------ */
const newId = () => 'p_' + crypto.randomBytes(6).toString('hex');
const safeId = (id) => { if (!/^p_[0-9a-f]{6,32}$/.test(String(id))) throw new Error('bad id'); return id; };
const pagePath = (id) => path.join(pagesDir(), safeId(id) + '.md');
const nowIso = () => new Date().toISOString();

function defaultMeta(id) {
  const ts = nowIso();
  return { id, title: '', parent: '', icon: '', tags: [], favorite: false, trashed: false, order: Date.now(), created: ts, updated: ts };
}

function serialize(meta, body) {
  const head = [
    '---',
    `id: ${meta.id}`,
    `title: ${meta.title || ''}`,
    `icon: ${meta.icon || ''}`,
    `parent: ${meta.parent || ''}`,
    `tags: ${(meta.tags || []).join(', ')}`,
    `favorite: ${meta.favorite ? 'true' : 'false'}`,
    `trashed: ${meta.trashed ? 'true' : 'false'}`,
    `order: ${Number(meta.order) || 0}`,
    `created: ${meta.created || nowIso()}`,
    `updated: ${meta.updated || nowIso()}`,
    '---',
    '',
  ].join('\n');
  return head + String(body || '').replace(/^\n+/, '');
}

function parse(text, id) {
  const meta = defaultMeta(id);
  let body = text;
  const lines = text.split('\n');
  if (lines[0] && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      for (const raw of lines.slice(1, end)) {
        const i = raw.indexOf(':');
        if (i < 0) continue;
        const key = raw.slice(0, i).trim();
        const value = raw.slice(i + 1).trim();
        if (key === 'tags') meta.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
        else if (key === 'favorite' || key === 'trashed') meta[key] = value === 'true';
        else if (key === 'order') meta.order = Number(value) || 0;
        else if (key in meta) meta[key] = value;
      }
      body = lines.slice(end + 1).join('\n').replace(/^\n/, '');
    }
  }
  meta.id = id;
  return { meta, body };
}

async function readPage(id) {
  const text = await fsp.readFile(pagePath(id), 'utf8');
  const { meta, body } = parse(text, id);
  return Object.assign(meta, { content: body });
}

async function writePage(meta, body) {
  ensureDirs();
  const file = pagePath(meta.id);
  await fsp.writeFile(file + '.tmp', serialize(meta, body), 'utf8');
  await fsp.rename(file + '.tmp', file);
  return Object.assign({}, meta, { content: body });
}

async function allPages(withContent = false) {
  ensureDirs();
  const names = (await fsp.readdir(pagesDir())).filter((n) => n.endsWith('.md'));
  const out = [];
  for (const name of names) {
    const id = name.slice(0, -3);
    if (!/^p_[0-9a-f]{6,32}$/.test(id)) continue;
    try {
      const page = await readPage(id);
      if (!withContent) delete page.content;
      out.push(page);
    } catch { /* 壊れたファイルは無視 */ }
  }
  out.sort((a, b) => (a.order || 0) - (b.order || 0));
  return out;
}

function descendants(id, pages) {
  const kids = new Map();
  pages.forEach((p) => {
    const key = p.parent || '';
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(p.id);
  });
  const out = [];
  const stack = [...(kids.get(id) || [])];
  while (stack.length) {
    const cur = stack.pop();
    out.push(cur);
    stack.push(...(kids.get(cur) || []));
  }
  return out;
}

const WELCOME = `このアプリはローカルPCだけで動きます。クラウドには何も送信しません。

## 書き方

半角の **/** を押すとブロックメニューが開きます。見出し・リスト・ToDo・引用・コード・区切り線などを選べます。

- [ ] チェックボックスはクリックで完了にできる
- [ ] 行頭で Tab を押すと階層が下がる

## Markdown ショートカット

行頭で記号を打つとそのままブロックに変わります。

| 入力 | 変わるブロック |
| --- | --- |
| # + スペース | 見出し1 |
| ## + スペース | 見出し2 |
| - + スペース | 箇条書き |
| 1. + スペース | 番号付きリスト |
| [] + スペース | ToDo |
| > + スペース | 引用 |
| \`\`\` | コード |
| --- | 区切り線 |

> ⌘P でページ検索、⌘N で新規ページ。ページは Markdown ファイルとして保存されます。
`;

async function seedIfEmpty() {
  ensureDirs();
  const names = (await fsp.readdir(pagesDir())).filter((n) => n.endsWith('.md'));
  if (names.length) return;
  const home = defaultMeta(newId());
  Object.assign(home, { title: 'はじめに', icon: '👋', favorite: true });
  await writePage(home, WELCOME);
  const daily = defaultMeta(newId());
  Object.assign(daily, { title: 'デイリーメモ', icon: '🗒️', parent: home.id, order: home.order + 1 });
  await writePage(daily, '## やること\n\n- [ ] 最初のタスクを書く\n\n## メモ\n');
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */
function registerIpc() {
  ipcMain.handle('pages:list', () => allPages());

  ipcMain.handle('page:get', (_e, id) => readPage(id));

  ipcMain.handle('page:create', async (_e, data = {}) => {
    const meta = defaultMeta(newId());
    if (data.title) meta.title = String(data.title).slice(0, 200);
    if (data.parent) meta.parent = safeId(data.parent);
    if (data.icon) meta.icon = String(data.icon).slice(0, 8);
    return writePage(meta, data.content || '');
  });

  ipcMain.handle('page:update', async (_e, id, patch = {}) => {
    const page = await readPage(safeId(id));
    const body = 'content' in patch ? String(patch.content) : page.content;
    const meta = Object.assign({}, page);
    delete meta.content;
    for (const key of ['title', 'icon']) if (key in patch) meta[key] = String(patch[key] || '');
    if ('tags' in patch) meta.tags = (patch.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
    for (const key of ['favorite', 'trashed']) if (key in patch) meta[key] = !!patch[key];
    if ('order' in patch) meta.order = Number(patch.order) || 0;
    if ('parent' in patch) {
      const next = String(patch.parent || '');
      if (next) {
        safeId(next);
        const pages = await allPages();
        if (next === id || descendants(id, pages).includes(next)) throw new Error('自分自身や子ページの下には移動できません');
      }
      meta.parent = next;
    }
    meta.updated = nowIso();
    return writePage(meta, body);
  });

  ipcMain.handle('page:delete', async (_e, id, permanent = false) => {
    const pages = await allPages();
    const targets = [safeId(id), ...descendants(id, pages)];
    for (const tid of targets) {
      if (permanent) {
        await fsp.rm(pagePath(tid), { force: true });
      } else {
        const page = await readPage(tid);
        const meta = Object.assign({}, page);
        delete meta.content;
        meta.trashed = true;
        meta.updated = nowIso();
        await writePage(meta, page.content);
      }
    }
    return { ok: true, ids: targets };
  });

  ipcMain.handle('page:duplicate', async (_e, id) => {
    const src = await readPage(safeId(id));
    const meta = defaultMeta(newId());
    Object.assign(meta, { title: (src.title || '') + ' のコピー', parent: src.parent, icon: src.icon, tags: [...(src.tags || [])] });
    return writePage(meta, src.content);
  });

  ipcMain.handle('pages:search', async (_e, q) => {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return [];
    const pages = await allPages(true);
    const hits = [];
    for (const page of pages) {
      if (page.trashed) continue;
      const title = (page.title || '').toLowerCase();
      const body = (page.content || '').toLowerCase();
      const inTitle = title.includes(needle);
      if (!inTitle && !body.includes(needle)) continue;
      let snippet = '';
      const pos = body.indexOf(needle);
      if (pos >= 0) snippet = page.content.slice(Math.max(0, pos - 30), pos + needle.length + 60).replace(/[\n#>*`-]+/g, ' ').trim();
      hits.push({ id: page.id, title: page.title, icon: page.icon, snippet, score: inTitle ? 0 : 1, updated: page.updated });
    }
    hits.sort((a, b) => a.score - b.score || String(b.updated).localeCompare(String(a.updated)));
    return hits.slice(0, 50);
  });

  ipcMain.handle('file:save', async (_e, { name, data }) => {
    ensureDirs();
    const base = String(name || 'image.png').replace(/[^\w.\-]/g, '_').slice(-60);
    const fileName = `${Date.now()}_${base}`;
    await fsp.writeFile(path.join(filesDir(), fileName), Buffer.from(data));
    return { url: 'lnfile://files/' + encodeURIComponent(fileName), name: base };
  });

  ipcMain.handle('settings:get', () => ({ dataDir: dataDir(), theme: readSettings().theme || 'system' }));

  ipcMain.handle('settings:theme', (_e, theme) => {
    writeSettings({ theme });
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme;
    return theme;
  });

  ipcMain.handle('data:reveal', () => { ensureDirs(); shell.openPath(dataDir()); });

  /* --- 初回起動の保存先選択 --- */
  ipcMain.handle('setup:info', () => {
    const dir = defaultDataDir();
    return { path: dir, existing: countPages(dir), fresh: !fs.existsSync(dir), home: app.getPath('home') };
  });

  ipcMain.handle('setup:choose', async () => {
    const res = await dialog.showOpenDialog(setupWin || undefined, {
      title: 'メモの保存先を選ぶ',
      message: 'このフォルダの中に pages/ と files/ を作ります。既にメモがあるフォルダを選べば、それをそのまま開きます。',
      buttonLabel: 'このフォルダにする',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('documents'),
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const dir = res.filePaths[0];
    return { path: dir, existing: countPages(dir), fresh: false, home: app.getPath('home') };
  });

  ipcMain.handle('setup:start', async (_e, dir) => {
    try {
      if (!dir || !path.isAbsolute(dir)) return { error: 'フォルダの場所が正しくありません。' };
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      writeSettings({ dataDir: dir });
      ensureDirs();
      await seedIfEmpty();
    } catch (err) {
      return { error: 'このフォルダには保存できません（' + err.message + '）。別の場所を選んでください。' };
    }
    createWindow();
    if (setupWin && !setupWin.isDestroyed()) { const w = setupWin; setupWin = null; w.close(); }
    return { ok: true, dataDir: dataDir() };
  });

  ipcMain.handle('data:choose', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'データフォルダを選ぶ',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dataDir(),
    });
    if (res.canceled || !res.filePaths[0]) return null;
    writeSettings({ dataDir: res.filePaths[0] });
    ensureDirs();
    await seedIfEmpty();
    return dataDir();
  });

  ipcMain.handle('page:exportMarkdown', async (_e, id) => {
    const page = await readPage(safeId(id));
    const res = await dialog.showSaveDialog(win, {
      defaultPath: (page.title || 'page').replace(/[\/:]/g, '_') + '.md',
    });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, `# ${page.title || ''}\n\n${page.content}`, 'utf8');
    return res.filePath;
  });
}

/* ------------------------------------------------------------------ */
/* メニュー                                                            */
/* ------------------------------------------------------------------ */
const send = (channel, payload) => win && win.webContents.send(channel, payload);

function buildMenu() {
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: 'local-note について' },
        { type: 'separator' },
        { label: 'データフォルダを変更…', click: () => send('menu', 'data:choose') },
        { label: 'データフォルダを開く', click: () => { ensureDirs(); shell.openPath(dataDir()); } },
        { type: 'separator' },
        { role: 'hide', label: '隠す' },
        { role: 'hideOthers', label: 'ほかを隠す' },
        { role: 'unhide', label: 'すべてを表示' },
        { type: 'separator' },
        { role: 'quit', label: 'local-note を終了' },
      ],
    }] : []),
    {
      label: 'ファイル',
      submenu: [
        { label: '新規ページ', accelerator: 'CmdOrCtrl+N', click: () => send('menu', 'page:new') },
        { label: '子ページを追加', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('menu', 'page:newChild') },
        { type: 'separator' },
        { label: 'Markdownで書き出し…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('menu', 'page:export') },
        { type: 'separator' },
        { label: 'ページを検索…', accelerator: 'CmdOrCtrl+P', click: () => send('menu', 'search') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'ウィンドウを閉じる' } : { role: 'quit' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { label: '取り消す', accelerator: 'CmdOrCtrl+Z', click: () => send('menu', 'undo') },
        { label: 'やり直す', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('menu', 'redo') },
        { type: 'separator' },
        { role: 'cut', label: 'カット' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: 'ペースト' },
        { role: 'pasteAndMatchStyle', label: '書式なしでペースト' },
        { role: 'selectAll', label: 'すべてを選択' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { label: 'ライト', click: () => send('menu', 'theme:light') },
        { label: 'ダーク', click: () => send('menu', 'theme:dark') },
        { label: 'システムに合わせる', click: () => send('menu', 'theme:system') },
        { type: 'separator' },
        { label: 'サイドバーの表示/非表示', accelerator: 'CmdOrCtrl+\\', click: () => send('menu', 'sidebar:toggle') },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { role: 'togglefullscreen', label: 'フルスクリーン' },
      ],
    },
    { role: 'windowMenu', label: 'ウィンドウ' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* ウィンドウ                                                          */
/* ------------------------------------------------------------------ */
// このアプリ自身のページ以外へは絶対に遷移させない。
// （preload はそのウィンドウの全ページに効くので、メモに書かれた file:// リンクを
//   踏んだだけで、遷移先のHTMLに保存APIを渡してしまうのを防ぐ）
const OWN_PAGES = ['index.html', 'setup.html'].map((n) =>
  pathToFileURL(path.join(__dirname, 'renderer', n)).toString());

function hardenNavigation(wc) {
  // 新しいウィンドウは開かせず、http(s) だけ既定のブラウザへ逃がす
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const guard = (e, url) => {
    const base = String(url).split(/[?#]/)[0];
    if (OWN_PAGES.includes(base)) return;   // 自分のページの再読み込みだけ許可
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  wc.on('will-navigate', guard);
  wc.on('will-frame-navigate', (e) => guard(e, e.url));
  wc.on('will-redirect', guard);
  wc.on('will-attach-webview', (e) => e.preventDefault());
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 620,
    height: 440,
    resizable: false,
    fullscreenable: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  hardenNavigation(setupWin.webContents);
  setupWin.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.error(`[setup] ${message} (${String(source).split('/').pop()}:${line})`);
    else if (/ready/i.test(message)) console.log(`[setup] ${message}`);
  });
  // 保存先を決めずに閉じたら、何も作らずに終了する
  setupWin.on('closed', () => { setupWin = null; if (!win) app.quit(); });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // レンダラのログ・エラーをターミナルに出す（起動確認用）
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.error(`[renderer] ${message} (${String(source).split('/').pop()}:${line})`);
    else if (/ready/i.test(message)) console.log(`[renderer] ${message}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => console.error('[renderer] crashed:', details.reason));
  win.on('closed', () => { win = null; });

  hardenNavigation(win.webContents);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'lnfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// 同じデータフォルダを二重に開かないよう、起動は1つだけにする
// 同じデータフォルダを二重に開かないよう、起動は1つだけにする。
// ロックを取れなかったプロセスは「ウィンドウのない幽霊」にならないよう即終了する。
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  // 保存先の選択中なら、新しいウィンドウではなくその画面を前に出す
  const focusExisting = () => {
    const target = (setupWin && !setupWin.isDestroyed()) ? setupWin : win;
    if (target && !target.isDestroyed()) {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
      return true;
    }
    return false;
  };

  app.on('second-instance', () => { if (!focusExisting()) createWindow(); });

  // Dockアイコンのクリックでも必ずウィンドウが出るようにしておく
  app.on('activate', () => {
    if (!focusExisting() && BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.whenReady().then(async () => {
    try { migrateFromOldName(); } catch (err) { console.error('[main] 旧名からの引き継ぎに失敗:', err); }

    const theme = readSettings().theme || 'system';
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme;

    protocol.handle('lnfile', (req) => {
      const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
      const target = path.join(filesDir(), path.basename(name));
      return net.fetch(pathToFileURL(target).toString());
    });

    const firstRun = needsSetup();
    // 初期化に失敗してもウィンドウだけは必ず開く
    if (!firstRun) {
      // 読めるようになるまで案内する（許可を与える／別のフォルダを選ぶ）
      for (let i = 0; i < 20; i++) {
        const err = dataDirAccessError();
        if (!err) break;
        console.error('[main] データフォルダを読めません:', err.code, err.message);
        await resolveAccessProblem(err);
      }
      try {
        ensureDirs();
        await seedIfEmpty();
      } catch (err) {
        console.error('[main] データフォルダの初期化に失敗:', err);
      }
    }
    registerIpc();
    buildMenu();
    if (firstRun) createSetupWindow(); else createWindow();
  }).catch((err) => {
    console.error('[main] 起動処理に失敗:', err);
    if (!win) createWindow();
  });
}

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
