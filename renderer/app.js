/* local-note — アプリシェル（サイドバー・ページ管理・検索） */
'use strict';

const $ = (s) => document.querySelector(s);
let store;  // contextBridge で渡された保存API（boot で入れる）

/* ============================ 小さなUI部品 ============================ */
window.UI = (() => {
  let openPopup = null;
  let toastTimer = null;

  function closePopup() { if (openPopup) { openPopup.remove(); openPopup = null; } }

  function popup(anchor, items, opts = {}) {
    closePopup();
    const el = document.createElement('div');
    el.className = 'popup';
    items.forEach((it) => {
      if (it.sep) { const s = document.createElement('div'); s.className = 'sep'; el.appendChild(s); return; }
      if (it.label === undefined) return;
      const b = document.createElement('button');
      if (it.danger) b.className = 'danger';
      b.textContent = it.label;
      b.onclick = () => { closePopup(); it.run && it.run(); };
      el.appendChild(b);
    });
    document.body.appendChild(el);
    place(el, anchor, opts);
    openPopup = el;
    return el;
  }

  function place(el, anchor, opts = {}) {
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = opts.align === 'right' ? r.right - w : r.left;
    let y = r.bottom + 4;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 4);
    el.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    el.style.top = y + 'px';
  }

  const EMOJIS = ('😀 😅 😍 🤔 😴 🤯 👋 👍 🙌 🙏 💪 🧠 👀 🔥 ✨ ⭐ 💡 📌 📍 🔖 📝 📄 📑 📚 📔 🗒️ 🗓️ ⏰ ⏳ ✅ ☑️ 🧩 🛠️ ⚙️ 🔧 🧪 🧭 🔑 🔒 📊 📈 📉 💰 💳 🧾 🏷️ 📣 ✉️ 📞 🤝 👤 👥 🏢 🏠 🏭 🌏 ✈️ 🚗 🚀 🍜 ☕ 🍰 🍋 🏃 🛌 🎧 🎬 🎨 🎸 🎯 🐱 🐶 🐣 🌱 🌸 🍀 🌙 ☀️ ⚡ ❄️ 🌊 💬 ❓ ❗ ♻️ 🧹 🗑️ 🧊 🪄 🧱 🪜 🗂️ 📁 📦 🔗 🏆 🎁 🧵 🕹️').split(' ');

  function emojiPicker(anchor, onPick) {
    closePopup();
    const el = document.createElement('div');
    el.className = 'popup';
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    EMOJIS.forEach((emoji) => {
      const b = document.createElement('button');
      b.textContent = emoji;
      b.onclick = () => { closePopup(); onPick(emoji); };
      grid.appendChild(b);
    });
    const clear = document.createElement('button');
    clear.textContent = 'アイコンを消す';
    clear.onclick = () => { closePopup(); onPick(''); };
    el.append(grid, Object.assign(document.createElement('div'), { className: 'sep' }), clear);
    document.body.appendChild(el);
    place(el, anchor);
    openPopup = el;
  }

  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2000);
  }

  document.addEventListener('mousedown', (e) => {
    if (openPopup && !e.target.closest('.popup')) closePopup();
  });

  return { popup, emojiPicker, toast, closePopup };
})();

/* ============================ 状態 ============================ */
const state = {
  pages: [],
  current: null,
  expanded: new Set(JSON.parse(localStorage.getItem('ln.expanded') || '[]')),
  dirty: false,
  timer: null,
  view: 'page',
  theme: 'system',
};

const saveExpanded = () => localStorage.setItem('ln.expanded', JSON.stringify([...state.expanded]));
const childrenOf = (parent) => state.pages.filter((p) => !p.trashed && (p.parent || '') === (parent || '')).sort((a, b) => (a.order || 0) - (b.order || 0));
const titleOf = (p) => (p && p.title) ? p.title : '無題';

function pageByIdMap() {
  const map = new Map();
  state.pages.forEach((p) => { if (!p.trashed) map.set(p.id, { id: p.id, title: p.title, icon: p.icon }); });
  return map;
}

function pageIndex() {
  const map = new Map();
  state.pages.forEach((p) => { if (!p.trashed && p.title) map.set(p.title.trim().toLowerCase(), p); });
  return map;
}

/* ============================ サイドバー ============================ */
function rowEl(page, inFav = false) {
  const li = document.createElement('li');
  const row = document.createElement('div');
  row.className = 'row' + (state.current && state.current.id === page.id && state.view === 'page' ? ' active' : '');
  row.dataset.id = page.id;
  row.draggable = true;

  const kids = childrenOf(page.id);
  const tw = document.createElement('button');
  tw.className = 'twisty' + (kids.length ? '' : ' empty') + (state.expanded.has(page.id) ? ' open' : '');
  tw.textContent = '▶';
  tw.onclick = (e) => {
    e.stopPropagation();
    if (state.expanded.has(page.id)) state.expanded.delete(page.id); else state.expanded.add(page.id);
    saveExpanded();
    renderSidebar();
  };

  const icon = document.createElement('span');
  icon.className = 'row-icon';
  icon.textContent = page.icon || '📄';

  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = titleOf(page);

  const actions = document.createElement('span');
  actions.className = 'row-actions';
  const more = document.createElement('button');
  more.textContent = '⋯';
  more.title = 'メニュー';
  more.onclick = (e) => { e.stopPropagation(); pageMenu(page, more); };
  const add = document.createElement('button');
  add.textContent = '＋';
  add.title = '子ページを追加';
  add.onclick = async (e) => {
    e.stopPropagation();
    state.expanded.add(page.id);
    saveExpanded();
    await newPage(page.id);
  };
  actions.append(more, add);

  row.append(tw, icon, title, actions);
  row.onclick = () => openPage(page.id);

  row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/ln-page', page.id); e.dataTransfer.effectAllowed = 'move'; });
  row.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/ln-page')) return;
    e.preventDefault();
    row.classList.add('drop-into');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-into'));
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.classList.remove('drop-into');
    const id = e.dataTransfer.getData('text/ln-page');
    if (!id || id === page.id) return;
    try {
      await store.updatePage(id, { parent: page.id });
      state.expanded.add(page.id);
      saveExpanded();
      await refresh();
    } catch (err) { UI.toast(err.message); }
  });

  li.appendChild(row);
  if (!inFav && kids.length && state.expanded.has(page.id)) {
    const ul = document.createElement('ul');
    kids.forEach((k) => ul.appendChild(rowEl(k)));
    li.appendChild(ul);
  }
  return li;
}

function renderSidebar() {
  const tree = $('#tree');
  tree.innerHTML = '';
  const ul = document.createElement('ul');
  childrenOf('').forEach((p) => ul.appendChild(rowEl(p)));
  tree.appendChild(ul);

  const favs = state.pages.filter((p) => p.favorite && !p.trashed);
  $('#fav-group').hidden = !favs.length;
  const favTree = $('#fav-tree');
  favTree.innerHTML = '';
  const ful = document.createElement('ul');
  favs.forEach((p) => ful.appendChild(rowEl(p, true)));
  favTree.appendChild(ful);

  const trashed = state.pages.filter((p) => p.trashed).length;
  $('#trash-count').textContent = trashed ? String(trashed) : '';
}

/* ============================ ページ表示 ============================ */
function setView(view) {
  state.view = view;
  $('#page-view').hidden = view !== 'page';
  $('#trash-view').hidden = view !== 'trash';
}

function renderCrumbs() {
  const el = $('#crumbs');
  el.innerHTML = '';
  if (state.view === 'trash') {
    const b = document.createElement('span');
    b.className = 'crumb cur';
    b.textContent = '🗑 ゴミ箱';
    el.appendChild(b);
    return;
  }
  if (!state.current) return;
  const byId = new Map(state.pages.map((p) => [p.id, p]));
  const path = [];
  let cur = state.current;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); path.unshift(cur); cur = cur.parent ? byId.get(cur.parent) : null; }
  path.forEach((p, i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'crumb-sep'; sep.textContent = '/'; el.appendChild(sep); }
    const b = document.createElement('button');
    b.className = 'crumb' + (i === path.length - 1 ? ' cur' : '');
    b.textContent = `${p.icon || ''} ${titleOf(p)}`.trim();
    b.onclick = () => openPage(p.id);
    el.appendChild(b);
  });
}

function renderTags() {
  const box = $('#tags');
  box.innerHTML = '';
  const page = state.current;
  if (!page) return;
  (page.tags || []).forEach((tag) => {
    const b = document.createElement('button');
    b.className = 'tag';
    b.textContent = tag;
    b.title = 'クリックで削除';
    b.onclick = async () => {
      const tags = (page.tags || []).filter((t) => t !== tag);
      await store.updatePage(page.id, { tags });
      page.tags = tags;
      renderTags();
      await refresh(false);
    };
    box.appendChild(b);
  });
  if ((page.tags || []).length) {
    const add = document.createElement('button');
    add.className = 'tag add';
    add.textContent = '＋';
    add.onclick = addTag;
    box.appendChild(add);
  }
}

async function addTag() {
  const page = state.current;
  if (!page) return;
  const tag = prompt('タグ名');
  if (!tag || !tag.trim()) return;
  const tags = [...new Set([...(page.tags || []), tag.trim()])];
  await store.updatePage(page.id, { tags });
  page.tags = tags;
  renderTags();
  await refresh(false);
}

async function openPage(id) {
  await flush();
  let page;
  try { page = await store.getPage(id); } catch { UI.toast('ページが見つかりません'); return; }
  state.current = page;
  localStorage.setItem('ln.last', id);
  setView('page');

  $('#title').textContent = page.title || '';
  const iconBtn = $('#page-icon');
  iconBtn.textContent = page.icon || '';
  iconBtn.hidden = !page.icon;
  $('#btn-add-icon').textContent = page.icon ? 'アイコンを変更' : '🙂 アイコンを追加';
  $('#star').classList.toggle('on', !!page.favorite);
  $('#star').textContent = page.favorite ? '★' : '☆';

  Editor.setPageIndex(pageIndex(), pageByIdMap());
  Editor.load(page.content || '');
  renderCrumbs();
  renderTags();
  renderSidebar();
  $('#scroller').scrollTop = 0;
  setSaved();
}

/* ============================ 保存 ============================ */
function setSaved() { state.dirty = false; $('#save-state').textContent = ''; }

function markDirty() {
  state.dirty = true;
  $('#save-state').textContent = '編集中…';
  clearTimeout(state.timer);
  state.timer = setTimeout(flush, 600);
}

async function flush() {
  if (!state.dirty || !state.current) return;
  clearTimeout(state.timer);
  const id = state.current.id;
  const title = $('#title').textContent.trim();
  const content = Editor.markdown();
  try {
    const saved = await store.updatePage(id, { title, content });
    if (state.current && state.current.id === id) state.current = saved;
    const meta = state.pages.find((p) => p.id === id);
    if (meta) { meta.title = saved.title; meta.updated = saved.updated; }
    setSaved();
    renderSidebar();
    renderCrumbs();
  } catch (err) {
    $('#save-state').textContent = '保存エラー: ' + err.message;
  }
}

async function refresh(keep = true) {
  state.pages = await store.listPages();
  Editor.setPageIndex(pageIndex(), pageByIdMap());
  renderSidebar();
  if (keep && state.current && !state.pages.find((p) => p.id === state.current.id && !p.trashed)) {
    const first = childrenOf('')[0];
    if (first) await openPage(first.id);
  }
}

async function newPage(parent = '') {
  await flush();
  const page = await store.createPage({ parent });
  await refresh(false);
  await openPage(page.id);
  $('#title').focus();
  return page;
}

/* ============================ メニュー ============================ */
function pageMenu(page, anchor) {
  UI.popup(anchor, [
    { label: page.favorite ? '★ お気に入りから外す' : '☆ お気に入りに追加', run: async () => { await store.updatePage(page.id, { favorite: !page.favorite }); await refresh(false); if (state.current && state.current.id === page.id) { state.current.favorite = !page.favorite; $('#star').classList.toggle('on', !page.favorite); $('#star').textContent = !page.favorite ? '★' : '☆'; } } },
    { label: '＋ 子ページを追加', run: () => { state.expanded.add(page.id); saveExpanded(); newPage(page.id); } },
    { label: '⧉ 複製', run: async () => { const copy = await store.duplicatePage(page.id); await refresh(false); openPage(copy.id); } },
    { label: '🔗 [[リンク]]をコピー', run: () => { navigator.clipboard.writeText(`[[${titleOf(page)}]]`); UI.toast('コピーしました'); } },
    { label: '⤓ Markdownで書き出し', run: async () => { await flush(); const p = await store.exportMarkdown(page.id); if (p) UI.toast('書き出しました'); } },
    { sep: true },
    { label: '🗑 ゴミ箱に入れる', danger: true, run: async () => {
      await store.deletePage(page.id, false);
      if (state.current && state.current.id === page.id) state.current = null;
      await refresh(false);
      if (!state.current) { const first = childrenOf('')[0]; if (first) await openPage(first.id); }
      UI.toast('ゴミ箱に入れました');
    } },
  ], { align: 'right' });
}

/* ============================ ゴミ箱 ============================ */
function showTrash() {
  setView('trash');
  renderCrumbs();
  renderSidebar();
  const list = $('#trash-list');
  list.innerHTML = '';
  const trashed = state.pages.filter((p) => p.trashed);
  if (!trashed.length) {
    list.innerHTML = '<div class="empty-note">ゴミ箱は空です。</div>';
    return;
  }
  trashed.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<span>${p.icon || '📄'}</span><div class="grow">${MD.escHtml(titleOf(p))}<div class="sub">更新 ${String(p.updated || '').slice(0, 10)}</div></div>`;
    const restore = document.createElement('button');
    restore.textContent = '復元';
    restore.onclick = async () => { await store.updatePage(p.id, { trashed: false }); await refresh(false); showTrash(); };
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '完全に削除';
    del.onclick = async () => {
      if (!confirm(`「${titleOf(p)}」と、その子ページをファイルごと削除します。取り消せません。`)) return;
      await store.deletePage(p.id, true);
      await refresh(false);
      showTrash();
    };
    row.append(restore, del);
    list.appendChild(row);
  });
}

/* ============================ 検索 ============================ */
const search = { items: [], sel: 0, timer: null };

function openSearch() {
  $('#search-modal').hidden = false;
  const input = $('#search-input');
  input.value = '';
  input.focus();
  runSearch('');
}
const closeSearch = () => { $('#search-modal').hidden = true; };

function renderSearch() {
  const list = $('#search-results');
  list.innerHTML = '';
  search.items.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'result' + (i === search.sel ? ' sel' : '');
    b.innerHTML = `<span>${item.icon || (item.create ? '✨' : '📄')}</span><div class="grow"><div class="r-title">${MD.escHtml(item.title || '無題')}</div>${item.snippet ? `<div class="r-sub">${MD.escHtml(item.snippet)}</div>` : ''}</div>`;
    b.onclick = () => pickSearch(item);
    list.appendChild(b);
  });
}

async function pickSearch(item) {
  closeSearch();
  if (item.create) { const p = await store.createPage({ title: item.title }); await refresh(false); openPage(p.id); }
  else openPage(item.id);
}

function runSearch(q) {
  clearTimeout(search.timer);
  search.timer = setTimeout(async () => {
    const query = q.trim();
    if (!query) {
      search.items = state.pages.filter((p) => !p.trashed)
        .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
        .slice(0, 10)
        .map((p) => ({ id: p.id, title: titleOf(p), icon: p.icon, snippet: '最近更新したページ' }));
    } else {
      let hits = [];
      try { hits = await store.search(query); } catch { hits = []; }
      search.items = hits.map((h) => ({ id: h.id, title: titleOf(h), icon: h.icon, snippet: h.snippet }));
      search.items.push({ create: true, title: query, snippet: 'このタイトルで新しいページを作る' });
    }
    search.sel = 0;
    renderSearch();
  }, 80);
}

/* ============================ テーマ ============================ */
function applyTheme(theme) {
  state.theme = theme;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* ============================ 初期化 ============================ */
function wire() {
  $('#title').addEventListener('input', markDirty);
  $('#title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); Editor.focusFirst(); }
    if (e.key === 'ArrowDown') { const sel = window.getSelection(); if (sel.isCollapsed) { e.preventDefault(); Editor.focusFirst(); } }
  });
  $('#title').addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\n/g, ' '));
  });

  $('#page-icon').onclick = (e) => UI.emojiPicker(e.currentTarget, setPageIcon);
  $('#btn-add-icon').onclick = (e) => UI.emojiPicker(e.currentTarget, setPageIcon);
  $('#btn-add-tag').onclick = addTag;

  $('#star').onclick = async () => {
    const page = state.current;
    if (!page) return;
    const fav = !page.favorite;
    await store.updatePage(page.id, { favorite: fav });
    page.favorite = fav;
    $('#star').classList.toggle('on', fav);
    $('#star').textContent = fav ? '★' : '☆';
    await refresh(false);
  };
  $('#more').onclick = (e) => { if (state.current) pageMenu(state.current, e.currentTarget); };

  $('#side-search').onclick = openSearch;
  $('#side-new').onclick = () => newPage('');
  $('#add-root').onclick = (e) => { e.stopPropagation(); newPage(''); };
  $('#side-trash').onclick = showTrash;
  $('#side-data').onclick = () => store.revealData();
  $('#toggle-sidebar').onclick = () => $('#app').classList.toggle('sidebar-hidden');

  $('#search-input').addEventListener('input', (e) => runSearch(e.target.value));
  $('#search-modal').addEventListener('mousedown', (e) => { if (e.target.id === 'search-modal') closeSearch(); });
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); search.sel = Math.min(search.sel + 1, search.items.length - 1); renderSearch(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); search.sel = Math.max(0, search.sel - 1); renderSearch(); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = search.items[search.sel]; if (item) pickSearch(item); }
    else if (e.key === 'Escape') closeSearch();
  });

  // サイドバー幅のドラッグ
  const resizer = $('.sidebar-resizer');
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = Math.max(180, Math.min(420, ev.clientX));
      document.documentElement.style.setProperty('--sidebar-w', w + 'px');
      localStorage.setItem('ln.sidebarW', String(w));
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // ルート（サイドバー余白）へのドロップでトップレベルへ
  $('.side-scroll').addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/ln-page')) e.preventDefault(); });
  $('.side-scroll').addEventListener('drop', async (e) => {
    if (e.target.closest('.row')) return;
    const id = e.dataTransfer.getData('text/ln-page');
    if (!id) return;
    e.preventDefault();
    await store.updatePage(id, { parent: '' });
    await refresh();
  });

  document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'p' && !e.shiftKey) { e.preventDefault(); openSearch(); }
    else if (meta && e.key.toLowerCase() === 'k' && !e.shiftKey) { e.preventDefault(); openSearch(); }
    else if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); UI.toast('保存しました'); }
    else if (e.key === 'Escape') { closeSearch(); UI.closePopup(); }
  });

  window.addEventListener('beforeunload', () => { if (state.dirty && state.current) store.updatePage(state.current.id, { title: $('#title').textContent.trim(), content: Editor.markdown() }); });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') applyTheme('system'); });

  if (store.onMenu) store.onMenu(async (action) => {
    if (action === 'undo' || action === 'redo') {
      const ae = document.activeElement;
      if (ae && (ae.id === 'title' || ae.tagName === 'INPUT')) document.execCommand(action);
      else if (action === 'undo') Editor.undo(); else Editor.redo();
    }
    else if (action === 'page:new') newPage('');
    else if (action === 'page:newChild') newPage(state.current ? state.current.id : '');
    else if (action === 'search') openSearch();
    else if (action === 'sidebar:toggle') $('#app').classList.toggle('sidebar-hidden');
    else if (action === 'page:export') { if (state.current) { await flush(); await store.exportMarkdown(state.current.id); } }
    else if (action === 'data:choose') { const dir = await store.chooseData(); if (dir) { $('#data-path').textContent = dir; await refresh(false); const first = childrenOf('')[0]; if (first) openPage(first.id); } }
    else if (action.startsWith('theme:')) { const t = action.split(':')[1]; applyTheme(t); store.setTheme(t); }
  });
}

async function setPageIcon(emoji) {
  const page = state.current;
  if (!page) return;
  await store.updatePage(page.id, { icon: emoji });
  page.icon = emoji;
  const iconBtn = $('#page-icon');
  iconBtn.textContent = emoji;
  iconBtn.hidden = !emoji;
  $('#btn-add-icon').textContent = emoji ? 'アイコンを変更' : '🙂 アイコンを追加';
  await refresh(false);
  renderCrumbs();
}

async function boot() {
  // ブラウザで開いたときだけ、見た目確認用のモックを読む。
  // 配布物に dev-mock.js は入らない（Electron では preload が window.api を用意する）。
  if (!window.api) await import('./dev-mock.js');
  store = window.api;

  const w = localStorage.getItem('ln.sidebarW');
  if (w) document.documentElement.style.setProperty('--sidebar-w', w + 'px');

  const settings = await store.getSettings();
  applyTheme(settings.theme || 'system');
  $('#data-path').textContent = settings.dataDir;
  $('#data-path').title = settings.dataDir;

  Editor.init({
    change: markDirty,
    openPage: (id) => openPage(id),
    focusTitle: () => { const t = $('#title'); t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); },
    searchPages: async (q) => {
      if (!q) {
        return state.pages.filter((p) => !p.trashed && (!state.current || p.id !== state.current.id))
          .sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 8)
          .map((p) => ({ id: p.id, title: titleOf(p), icon: p.icon }));
      }
      const needle = q.toLowerCase();
      const local = state.pages.filter((p) => !p.trashed && titleOf(p).toLowerCase().includes(needle))
        .map((p) => ({ id: p.id, title: titleOf(p), icon: p.icon }));
      if (local.length) return local;
      const hits = await store.search(q);
      return hits.map((h) => ({ id: h.id, title: titleOf(h), icon: h.icon }));
    },
    createChildPage: async (title) => {
      if (!state.current) return null;
      await flush();
      const page = await store.createPage({ title: title || '', parent: state.current.id });
      state.expanded.add(state.current.id);
      saveExpanded();
      await refresh(false);
      return { id: page.id, title: page.title, icon: page.icon };
    },
    renamePage: async (id, title) => {
      await store.updatePage(id, { title });
      await refresh(false);
      if (state.current && state.current.id === id) $('#title').textContent = title;
    },
    createPageNamed: async (title) => {
      const page = await store.createPage({ title, parent: state.current ? state.current.id : '' });
      await refresh(false);
      return { id: page.id, title: page.title, icon: page.icon };
    },
    createPage: async (title) => {
      const page = await store.createPage({ title, parent: state.current ? state.current.id : '' });
      await refresh(false);
      openPage(page.id);
    },
    saveImage: async (file) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      return store.saveFile(file.name || 'image.png', Array.from(buf));
    },
    pickImage: async () => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return resolve(null);
          const buf = new Uint8Array(await file.arrayBuffer());
          resolve(await store.saveFile(file.name, Array.from(buf)));
        };
        input.click();
      });
    },
  });

  wire();
  await refresh(false);
  const last = localStorage.getItem('ln.last');
  const target = state.pages.find((p) => p.id === last && !p.trashed) || childrenOf('')[0];
  if (target) await openPage(target.id);
  console.log(`local-note ready (${state.pages.length} pages)`);
}

boot().catch((err) => {
  const raw = String(err && err.message || err);
  const denied = /EPERM|EACCES|operation not permitted/i.test(raw);
  document.body.innerHTML = `
    <div style="max-width:620px;margin:14vh auto;padding:0 32px;font:14px/1.7 ui-sans-serif,-apple-system,sans-serif;color:#37352f">
      <div style="font-size:19px;font-weight:700;margin-bottom:10px">${denied ? 'メモのフォルダを開けませんでした' : '起動できませんでした'}</div>
      <p style="margin:0 0 14px;color:rgba(55,53,47,.72)">${denied
        ? 'macOS がこのフォルダへのアクセスを止めています。システム設定 › プライバシーとセキュリティ › ファイルとフォルダ で local-note に許可を与えてから、再読み込みしてください。書類・デスクトップ・ダウンロード以外の場所（例：ホーム直下）を保存先にすれば、この許可は要りません。'
        : 'メモの読み込み中にエラーが起きました。'}</p>
      <button id="ln-reload" style="font:inherit;padding:7px 16px;border:0;border-radius:5px;background:#2383e2;color:#fff;cursor:pointer">再読み込み</button>
      <pre style="margin-top:18px;padding:10px 12px;background:#f7f7f5;border-radius:6px;font-size:12px;white-space:pre-wrap;color:rgba(55,53,47,.6)">${raw}</pre>
    </div>`;
  document.getElementById('ln-reload').onclick = () => location.reload();
});
