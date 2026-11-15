/* ブロックエディタ本体 */
'use strict';

window.Editor = (() => {
  const CHECK_SVG = '<svg viewBox="0 0 14 14" fill="none"><path d="M2.5 7.2 5.5 10.2 11.5 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ZWSP = '​';

  const TYPES = [
    { type: 'page', label: 'ページ', desc: 'この中に新しいページを作る', icon: '📄', keys: 'page subpage ページ さぶぺーじ こページ 子ページ new' },
    { type: 'p', label: 'テキスト', desc: 'ふつうの文章', icon: '¶', keys: 'text plain てきすと ぶんしょう p' },
    { type: 'h1', label: '見出し1', desc: '大きい見出し', icon: 'H1', keys: 'h1 heading title midashi みだし おおみだし' },
    { type: 'h2', label: '見出し2', desc: '中くらいの見出し', icon: 'H2', keys: 'h2 heading subheading midashi みだし' },
    { type: 'h3', label: '見出し3', desc: '小さい見出し', icon: 'H3', keys: 'h3 heading subheading midashi みだし' },
    { type: 'bullet', label: '箇条書きリスト', desc: '・ではじまるリスト', icon: '•', keys: 'bullet bulleted list ul りすと かじょうがき' },
    { type: 'numbered', label: '番号付きリスト', desc: '1. ではじまるリスト', icon: '1.', keys: 'numbered number list ol りすと ばんごう' },
    { type: 'todo', label: 'ToDoリスト', desc: 'チェックボックス', icon: '☑', keys: 'todo to-do task check checkbox チェック たすく' },
    { type: 'toggle', label: 'トグルリスト', desc: '折りたためる見出し', icon: '▸', keys: 'toggle とぐる おりたたみ' },
    { type: 'quote', label: '引用', desc: '引用ブロック', icon: '❝', keys: 'quote blockquote いんよう' },
    { type: 'callout', label: 'コールアウト', desc: '目立たせる囲み', icon: '💡', keys: 'callout note info ちゅうい めだつ' },
    { type: 'code', label: 'コード', desc: 'コードブロック', icon: '</>', keys: 'code codeblock こーど' },
    { type: 'divider', label: '区切り線', desc: '横線で区切る', icon: '—', keys: 'divider hr line separator せん くぎり' },
    { type: 'table', label: 'テーブル', desc: '簡単な表', icon: '▦', keys: 'table grid ひょう てーぶる' },
    { type: 'image', label: '画像', desc: 'ファイルから選ぶ', icon: '🖼', keys: 'image picture photo がぞう' },
    { type: '__link', label: 'ページへのリンク', desc: '既にあるページを参照する', icon: '🔗', keys: 'link mention りんく さんしょう' },
  ];

  const ACTIONS = [
    { type: '__duplicate', label: '複製', desc: 'このブロックを複製する', icon: '⧉', keys: 'duplicate copy ふくせい' },
    { type: '__delete', label: '削除', desc: 'このブロックを削除する', icon: '🗑', keys: 'delete remove trash さくじょ' },
  ];

  const RECENT_KEY = 'ln.recentBlocks';
  const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
  const pushRecent = (type) => {
    if (String(type).startsWith('__')) return;
    const list = [type, ...readRecent().filter((t) => t !== type)].slice(0, 3);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* 無視 */ }
  };

  const PLACEHOLDER = {
    p: "入力するか、半角の / でコマンド",
    h1: '見出し1', h2: '見出し2', h3: '見出し3',
    bullet: 'リスト', numbered: 'リスト', todo: 'ToDo', toggle: 'トグル',
    quote: '引用', callout: 'コールアウト', code: 'コード',
  };

  const LIST_LIKE = ['bullet', 'numbered', 'todo', 'toggle'];
  const NO_TEXT = ['divider', 'image', 'table', 'page'];

  let blocks = [];
  let pageIndex = new Map();
  let pageById = new Map();
  let handlers = { change: () => {}, openPage: () => {}, createPage: () => {} };
  let quiet = false;

  const root = () => document.getElementById('blocks');

  // 空のページでは最初の行にプレースホルダを出す
  function updateEmptyState() {
    const r = root();
    if (!r || !blocks.length) return;
    const only = blocks.length === 1 && blocks[0].type === 'p' && blocks[0].el;
    const el = only ? blocks[0].el.querySelector('.text') : null;
    r.classList.toggle('empty-page', !!(el && !el.textContent.trim()));
  }

  const emit = () => { updateEmptyState(); if (!quiet) handlers.change(); };

  /* ======================= カーソル操作 ======================= */
  function textNodes(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }

  function caretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.endContainer)) return 0;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }

  function setCaret(el, offset) {
    el.focus({ preventScroll: true });
    const nodes = textNodes(el);
    const sel = window.getSelection();
    const r = document.createRange();
    if (!nodes.length) { r.selectNodeContents(el); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return; }
    let left = offset === 'end' ? Infinity : (offset || 0);
    for (const node of nodes) {
      if (left <= node.nodeValue.length) { r.setStart(node, Math.max(0, left)); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return; }
      left -= node.nodeValue.length;
    }
    const last = nodes[nodes.length - 1];
    r.setStart(last, last.nodeValue.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function rangeFor(el, start, end) {
    const nodes = textNodes(el);
    const r = document.createRange();
    r.selectNodeContents(el);
    let pos = 0, started = false;
    for (const node of nodes) {
      const len = node.nodeValue.length;
      if (!started && start <= pos + len) { r.setStart(node, start - pos); started = true; }
      if (started && end <= pos + len) { r.setEnd(node, end - pos); return r; }
      pos += len;
    }
    return r;
  }

  function splitHtml(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return [el.innerHTML, ''];
    const r = sel.getRangeAt(0);
    if (!r.collapsed) { r.deleteContents(); r.collapse(true); }   // 選択中の改行は選択を消してから分割
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(r.endContainer, r.endOffset);
    const after = document.createRange();
    after.selectNodeContents(el);
    after.setStart(r.endContainer, r.endOffset);
    const a = document.createElement('div'); a.appendChild(before.cloneContents());
    const b = document.createElement('div'); b.appendChild(after.cloneContents());
    return [a.innerHTML, b.innerHTML];
  }

  /* ======================= モデル ======================= */
  const indexOf = (b) => blocks.indexOf(b);
  const textEl = (b) => (b && b.el) ? b.el.querySelector('.text') : null;
  const prevOf = (b) => blocks[indexOf(b) - 1];
  const nextOf = (b) => blocks[indexOf(b) + 1];
  const focusedBlock = () => blocks.find((b) => b.el && b.el.contains(document.activeElement));

  function syncFromDom(b) {
    const el = textEl(b);
    if (b.type === 'table') { b.rows = readTable(b); return; }
    if (b.type === 'page') {
      const t = b.el && b.el.querySelector('.page-title');
      if (t) b.title = t.textContent.trim();
      return;
    }
    if (!el) return;
    b.text = b.type === 'code' ? el.textContent : MD.htmlToMd(el.innerHTML);
  }
  function syncAll() { blocks.forEach(syncFromDom); return blocks; }

  /* ======================= 取り消し履歴 ======================= */
  const hist = { past: [], future: [], at: 0, lastBlock: null };

  function captureCaret() {
    const b = focusedBlock();
    if (!b) {
      if (bsel.ids.length) {
        const first = blocks.findIndex((x) => bsel.ids.includes(x.id));
        if (first >= 0) return { index: first, offset: 0 };
      }
      return null;
    }
    const el = textEl(b);
    return { index: indexOf(b), offset: el ? caretOffset(el) : 0 };
  }

  function snapshot(opts = {}) {
    const now = Date.now();
    const b = focusedBlock();
    if (!opts.force && now - hist.at < 800 && hist.lastBlock === (b && b.id)) return;
    const md = MD.blocksToMd(syncAll());
    const top = hist.past[hist.past.length - 1];
    if (top && top.md === md) { hist.at = now; return; }
    hist.past.push({ md, caret: captureCaret() });
    if (hist.past.length > 120) hist.past.shift();
    hist.future.length = 0;
    hist.at = now;
    hist.lastBlock = b && b.id;
  }

  function restore(snap) {
    quiet = true;
    render(MD.mdToBlocks(snap.md));
    quiet = false;
    if (snap.caret && blocks[snap.caret.index]) focus(blocks[snap.caret.index], snap.caret.offset);
    emit();
  }

  let lastHistoryAt = 0;
  const historyBusy = () => {
    const now = Date.now();
    if (now - lastHistoryAt < 120) return true;   // メニューとキーの二重発火よけ
    lastHistoryAt = now;
    return false;
  };

  function undo() {
    if (historyBusy()) return;
    if (!hist.past.length) return;
    const cur = { md: MD.blocksToMd(syncAll()), caret: captureCaret() };
    const prev = hist.past.pop();
    hist.future.push(cur);
    hist.at = 0;
    restore(prev);
  }

  function redo() {
    if (historyBusy()) return;
    if (!hist.future.length) return;
    const cur = { md: MD.blocksToMd(syncAll()), caret: captureCaret() };
    const next = hist.future.pop();
    hist.past.push(cur);
    hist.at = 0;
    restore(next);
  }

  /* ======================= 描画 ======================= */
  function controls() {
    const ctl = document.createElement('div');
    ctl.className = 'ctl';
    ctl.innerHTML = '<button class="ctl-add" title="下にブロックを追加（クリックでメニュー）">＋</button><button class="ctl-handle" title="ドラッグで移動・クリックでメニュー" draggable="true">⠿</button>';
    return ctl;
  }

  function makeText(b) {
    const t = document.createElement('div');
    t.className = 'text';
    t.contentEditable = 'true';
    t.spellcheck = false;
    t.dataset.placeholder = PLACEHOLDER[b.type] || '';
    if (b.type === 'code') t.textContent = b.text || '';
    else t.innerHTML = MD.mdToHtml(b.text || '', pageIndex);
    return t;
  }

  function readTable(b) {
    const rows = [];
    if (!b.el) return b.rows || [];
    b.el.querySelectorAll('tr').forEach((tr) => {
      rows.push(Array.from(tr.children).map((td) => MD.htmlToMd(td.innerHTML).replace(/\|/g, '\\|').trim()));
    });
    return rows;
  }

  function tableEl(b) {
    const wrap = document.createElement('div');
    wrap.style.flex = '1';
    const table = document.createElement('table');
    table.className = 'nt';
    (b.rows && b.rows.length ? b.rows : [['', ''], ['', '']]).forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell) => {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.innerHTML = MD.mdToHtml(cell, pageIndex);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    const tools = document.createElement('div');
    tools.className = 'table-tools';
    const mk = (label, fn) => { const bt = document.createElement('button'); bt.textContent = label; bt.onclick = () => { snapshot({ force: true }); fn(); b.rows = readTable(b); emit(); }; return bt; };
    tools.append(
      mk('＋行', () => {
        const tr = document.createElement('tr');
        const n = table.rows[0] ? table.rows[0].cells.length : 2;
        for (let i = 0; i < n; i++) { const td = document.createElement('td'); td.contentEditable = 'true'; tr.appendChild(td); }
        table.appendChild(tr);
      }),
      mk('＋列', () => Array.from(table.rows).forEach((tr) => { const td = document.createElement('td'); td.contentEditable = 'true'; tr.appendChild(td); })),
      mk('−行', () => { if (table.rows.length > 1) table.deleteRow(-1); }),
      mk('−列', () => { if (table.rows[0] && table.rows[0].cells.length > 1) Array.from(table.rows).forEach((tr) => tr.deleteCell(-1)); }),
    );
    table.addEventListener('input', () => { b.rows = readTable(b); emit(); });
    wrap.append(table, tools);
    return wrap;
  }

  function commitPageTitle(b) {
    const t = b.el && b.el.querySelector('.page-title');
    if (!t) return;
    const title = t.textContent.trim();
    b.title = title;
    t.contentEditable = 'false';
    b.el.classList.remove('renaming');
    if (b.pageId && handlers.renamePage) handlers.renamePage(b.pageId, title);
    emit();
  }

  function startRename(b) {
    const t = b.el && b.el.querySelector('.page-title');
    if (!t) return;
    b.el.classList.add('renaming');
    t.contentEditable = 'true';
    t.focus();
    const r = document.createRange();
    r.selectNodeContents(t);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function pageEl(b) {
    const live = pageById.get(b.pageId);
    const row = document.createElement('div');
    row.className = 'page-block' + (live ? '' : ' missing');

    const icon = document.createElement('span');
    icon.className = 'page-block-icon';
    icon.textContent = (live && live.icon) || '📄';

    const title = document.createElement('span');
    title.className = 'page-title';
    title.contentEditable = 'false';
    title.spellcheck = false;
    title.dataset.placeholder = '無題';
    title.textContent = (live && live.title) || b.title || '';

    row.append(icon, title);

    row.addEventListener('click', (e) => {
      if (b.el.classList.contains('renaming')) return;
      e.preventDefault();
      if (b.pageId) handlers.openPage(b.pageId);
    });

    title.addEventListener('blur', () => { if (b.el.classList.contains('renaming')) commitPageTitle(b); });
    title.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        commitPageTitle(b);
        focus(insertAfter(b, {}), 'start');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitPageTitle(b);
      }
    });

    return row;
  }

  function blockEl(b) {
    const node = document.createElement('div');
    node.className = 'block';
    node.dataset.id = b.id;
    node.dataset.type = b.type;
    node.dataset.indent = b.indent || 0;
    if (b.type === 'todo') node.dataset.checked = String(!!b.checked);
    if (b.type === 'toggle') node.dataset.collapsed = String(!!b.collapsed);
    node.appendChild(controls());

    const inner = document.createElement('div');
    inner.className = 'block-inner';

    if (b.type === 'bullet' || b.type === 'numbered') {
      const m = document.createElement('div');
      m.className = 'marker';
      inner.append(m, makeText(b));
    } else if (b.type === 'todo') {
      const m = document.createElement('div');
      m.className = 'marker';
      const cb = document.createElement('button');
      cb.className = 'check';
      cb.innerHTML = CHECK_SVG;
      cb.onmousedown = (e) => e.preventDefault();
      cb.onclick = () => toggleCheck(b);
      m.appendChild(cb);
      inner.append(m, makeText(b));
    } else if (b.type === 'toggle') {
      const m = document.createElement('div');
      m.className = 'marker';
      const tw = document.createElement('button');
      tw.className = 'toggle-arrow';
      tw.innerHTML = '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3.6 1.8 L9 6 L3.6 10.2 Z" fill="currentColor"/></svg>';
      tw.onmousedown = (e) => e.preventDefault();
      tw.onclick = () => setCollapsed(b, !b.collapsed);
      m.appendChild(tw);
      inner.append(m, makeText(b));
    } else if (b.type === 'callout') {
      const icon = document.createElement('div');
      icon.className = 'callout-icon';
      icon.textContent = b.icon || '💡';
      icon.onclick = (e) => { e.stopPropagation(); UI.emojiPicker(icon, (emoji) => { snapshot({ force: true }); b.icon = emoji || '💡'; icon.textContent = b.icon; emit(); }); };
      inner.append(icon, makeText(b));
    } else if (b.type === 'code') {
      const wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      const lang = document.createElement('input');
      lang.className = 'code-lang';
      lang.value = b.lang || '';
      lang.placeholder = '言語';
      lang.oninput = () => { b.lang = lang.value.trim(); emit(); };
      const copy = document.createElement('button');
      copy.className = 'code-copy';
      copy.textContent = 'コピー';
      copy.onclick = () => { navigator.clipboard.writeText(b.text || ''); UI.toast('コピーしました'); };
      wrap.append(lang, copy, makeText(b));
      inner.appendChild(wrap);
    } else if (b.type === 'divider') {
      inner.appendChild(document.createElement('hr'));
    } else if (b.type === 'image') {
      const img = document.createElement('img');
      img.src = b.src || '';
      img.alt = b.alt || '';
      inner.appendChild(img);
    } else if (b.type === 'table') {
      inner.appendChild(tableEl(b));
    } else if (b.type === 'page') {
      inner.appendChild(pageEl(b));
    } else {
      inner.appendChild(makeText(b));
    }

    node.appendChild(inner);
    b.el = node;
    wireBlock(b);
    return node;
  }

  function renumber() {
    const counters = [];
    blocks.forEach((b) => {
      if (b.type !== 'numbered') { counters.length = 0; return; }
      const indent = b.indent || 0;
      counters[indent] = (counters[indent] || 0) + 1;
      counters.length = indent + 1;
      const m = b.el && b.el.querySelector('.marker');
      if (m) m.textContent = counters[indent] + '.';
    });
  }

  function applyCollapse() {
    let hideUntil = -1;
    let hideIndent = 0;
    blocks.forEach((b, i) => {
      if (hideUntil >= 0) {
        if ((b.indent || 0) > hideIndent) { b.el.classList.add('collapsed-hidden'); return; }
        hideUntil = -1;
      }
      b.el.classList.remove('collapsed-hidden');
      if (b.type === 'toggle' && b.collapsed) { hideUntil = i; hideIndent = b.indent || 0; }
    });
  }

  function render(list) {
    blocks = list.map((b) => Object.assign({ id: MD.uid(), type: 'p', text: '', indent: 0 }, b));
    const frag = document.createDocumentFragment();
    blocks.forEach((b) => frag.appendChild(blockEl(b)));
    const r = root();
    r.innerHTML = '';
    r.appendChild(frag);
    renumber();
    applyCollapse();
    updateEmptyState();
  }

  /* ======================= ブロック操作 ======================= */
  function insertAfter(ref, data = {}) {
    snapshot({ force: true });
    const b = Object.assign({ id: MD.uid(), type: 'p', text: '', indent: ref ? ref.indent || 0 : 0 }, data);
    const i = ref ? indexOf(ref) + 1 : blocks.length;
    blocks.splice(i, 0, b);
    const node = blockEl(b);
    if (ref) ref.el.after(node); else root().appendChild(node);
    renumber();
    applyCollapse();
    emit();
    return b;
  }

  function removeBlock(b, opts = {}) {
    if (!opts.silent) snapshot({ force: true });
    const i = indexOf(b);
    if (i < 0) return;
    blocks.splice(i, 1);
    b.el.remove();
    if (!blocks.length) {
      const nb = Object.assign({ id: MD.uid(), type: 'p', text: '', indent: 0 });
      blocks.push(nb);
      root().appendChild(blockEl(nb));
      focus(nb, 'start');
    }
    renumber();
    applyCollapse();
    emit();
  }

  function setType(b, type, extra = {}) {
    snapshot({ force: true });
    const keep = b.type === 'code' ? b.text : (textEl(b) ? MD.htmlToMd(textEl(b).innerHTML) : b.text);
    b.type = type;
    b.text = extra.text !== undefined ? extra.text : keep;
    Object.assign(b, extra);
    if (type === 'todo' && b.checked === undefined) b.checked = false;
    if (type === 'table' && !b.rows) b.rows = [['', ''], ['', '']];
    const old = b.el;
    old.replaceWith(blockEl(b));
    renumber();
    applyCollapse();
    emit();
    return b;
  }

  function toggleCheck(b) {
    snapshot({ force: true });
    b.checked = !b.checked;
    b.el.dataset.checked = String(b.checked);
    emit();
  }

  function setCollapsed(b, v) {
    b.collapsed = v;
    b.el.dataset.collapsed = String(v);
    applyCollapse();
    emit();
  }

  function setIndent(b, delta) {
    const next = Math.max(0, Math.min(5, (b.indent || 0) + delta));
    if (next === (b.indent || 0)) return;
    snapshot({ force: true });
    b.indent = next;
    b.el.dataset.indent = next;
    renumber();
    applyCollapse();
    emit();
  }

  function focus(b, pos = 'end') {
    if (!b) return;
    clearBlockSelection();
    const el = textEl(b);
    if (el) { setCaret(el, pos); return; }
    if (b.type === 'page') { startRename(b); return; }
    const cell = b.el.querySelector('td');
    if (cell) cell.focus();
  }

  function groupOf(b) {
    const out = [b];
    let i = indexOf(b) + 1;
    while (i < blocks.length && (blocks[i].indent || 0) > (b.indent || 0)) { out.push(blocks[i]); i++; }
    return out;
  }

  function moveGroup(group, targetIndex) {
    snapshot({ force: true });
    const ids = new Set(group.map((g) => g.id));
    const target = targetIndex >= 0 ? blocks[targetIndex] : null;   // null なら先頭へ
    blocks = blocks.filter((b) => !ids.has(b.id));
    const at = target ? blocks.indexOf(target) + 1 : 0;
    blocks.splice(at, 0, ...group);
    const r = root();
    let ref = target ? target.el : null;
    group.forEach((g) => { if (ref) ref.after(g.el); else r.prepend(g.el); ref = g.el; });
    renumber();
    applyCollapse();
    emit();
  }

  /* ======================= Markdown 入力ルール ======================= */
  const BLOCK_RULES = [
    [/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^###\s$/, 'h3'],
    [/^[-*+]\s$/, 'bullet'],
    [/^(1|a|i)[.)]\s$/, 'numbered'],
    [/^\[\]$/, 'todo'], [/^\[\s\]$/, 'todo'],              // [] だけでよく、スペースは不要
    [/^\[x\]$/i, 'todo', { checked: true }],
    [/^>\s$/, 'toggle'], [/^\|\s$/, 'quote'], [/^"\s$/, 'quote'],
    [/^```$/, 'code'], [/^---$/, 'divider'],
  ];

  function applyBlockRules(b) {
    if (b.type === 'code') return false;
    const el = textEl(b);
    if (!el) return false;
    const off = caretOffset(el);
    const head = el.textContent.slice(0, off);
    for (const [re, type, extra] of BLOCK_RULES) {
      if (!re.test(head)) continue;
      snapshot({ force: true });
      rangeFor(el, 0, off).deleteContents();
      if (type === 'divider') {
        setType(b, 'divider', { text: '' });
        focus(insertAfter(b, {}), 'start');
      } else {
        setType(b, type, extra || {});
        focus(b, 'start');
      }
      return true;
    }
    return false;
  }

  const INLINE_RULES = [
    [/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'strong', 0],
    [/__([^_\s](?:[^_]*[^_\s])?)__$/, 'strong', 0],
    [/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 'em', 1],
    [/~~([^~\s](?:[^~]*[^~\s])?)~~$/, 'del', 0],
    [/(^|[^~])~([^~\s](?:[^~]*[^~\s])?)~$/, 'del', 1],
    [/`([^`\s](?:[^`]*[^`\s])?)`$/, 'code', 0],
  ];

  function applyInlineRules(b) {
    if (b.type === 'code') return false;
    const el = textEl(b);
    if (!el) return false;
    const off = caretOffset(el);
    const head = el.textContent.slice(0, off);
    for (const [re, tag, group] of INLINE_RULES) {
      const m = head.match(re);
      if (!m) continue;
      const inner = m[group + 1];
      const matched = group ? m[0].slice(m[1].length) : m[0];
      const start = off - matched.length;
      snapshot({ force: true });
      const r = rangeFor(el, start, off);
      r.deleteContents();
      const node = document.createElement(tag);
      node.textContent = inner;
      r.insertNode(node);
      const tail = document.createTextNode(ZWSP);
      node.after(tail);
      const sel = window.getSelection();
      const rr = document.createRange();
      rr.setStart(tail, 1);
      rr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(rr);
      syncFromDom(b);
      emit();
      return true;
    }
    return false;
  }

  /* ======================= ポップアップメニュー ======================= */
  const menu = { kind: null, block: null, start: 0, items: [], sel: 0, el: null };

  function closeMenu() {
    menu.kind = null;
    if (menu.el) { menu.el.remove(); menu.el = null; }
  }

  function openMenu(kind, b, start) {
    closeMenu();
    menu.kind = kind;
    menu.block = b;
    menu.start = start;
    menu.sel = 0;
    menu.el = document.createElement('div');
    menu.el.className = 'popup menu-list';
    menu.el.style.width = kind === 'slash' ? '320px' : '300px';
    document.body.appendChild(menu.el);
    updateMenu('');
  }

  function positionMenu() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !menu.el) return;
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.height && menu.block) rect = menu.block.el.getBoundingClientRect();
    const h = menu.el.offsetHeight || 320;
    const w = menu.el.offsetWidth || 320;
    menu.el.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8)) + 'px';
    menu.el.style.top = (rect.bottom + h > window.innerHeight - 10 ? Math.max(8, rect.top - h - 6) : rect.bottom + 6) + 'px';
  }

  async function updateMenu(query) {
    if (!menu.el) return;
    const q = query.trim().toLowerCase();
    if (menu.kind === 'slash') {
      const match = (t) => !q || t.label.toLowerCase().includes(q) || t.keys.includes(q) || t.type.includes(q);
      const toItem = (t, group) => ({ icon: t.icon, title: t.label, desc: t.desc, type: t.type, group });
      const basics = TYPES.filter(match);
      const actions = ACTIONS.filter(match);
      let items = [];
      if (!q) {
        const recent = readRecent().map((type) => TYPES.find((t) => t.type === type)).filter(Boolean);
        items = recent.map((t) => toItem(t, '最近使用したブロック'));
      }
      const used = new Set(items.map((i) => i.type));
      items = items.concat(basics.filter((t) => !used.has(t.type)).map((t) => toItem(t, '基本ブロック')));
      items = items.concat(actions.map((t) => toItem(t, '操作')));
      menu.items = items;
      if (!menu.items.length) { closeMenu(); return; }
    } else {
      let pages = [];
      try { pages = handlers.searchPages ? await handlers.searchPages(q) : []; } catch { pages = []; }
      menu.items = pages.slice(0, 8).map((p) => ({ icon: p.icon || '📄', title: p.title || '無題', desc: 'ページを開くリンクを挿入', page: p }));
      if (q) menu.items.push({ icon: '✨', title: `「${query.trim()}」を新規ページとして作成`, desc: '', create: query.trim() });
      if (!menu.items.length) { closeMenu(); return; }
    }
    if (menu.sel >= menu.items.length) menu.sel = 0;
    menu.el.innerHTML = '';
    let group = null;
    if (menu.kind !== 'slash') {
      menu.el.innerHTML = '<div class="group-label">ページにリンク</div>';
    }
    menu.items.forEach((item, i) => {
      if (item.group && item.group !== group) {
        group = item.group;
        const lab = document.createElement('div');
        lab.className = 'group-label';
        lab.textContent = group;
        menu.el.appendChild(lab);
      }
      const row = document.createElement('div');
      row.className = 'item' + (i === menu.sel ? ' sel' : '');
      row.innerHTML = `<div class="slash-icon">${item.icon}</div><div class="slash-text"><b>${MD.escHtml(item.title)}</b>${item.desc ? `<span>${MD.escHtml(item.desc)}</span>` : ''}</div>`;
      row.onmouseenter = () => { menu.sel = i; [...menu.el.querySelectorAll('.item')].forEach((n, j) => n.classList.toggle('sel', j === i)); };
      row.onmousedown = (e) => { e.preventDefault(); menu.sel = i; applyMenu(); };
      menu.el.appendChild(row);
    });
    positionMenu();
  }

  async function applyMenu() {
    const item = menu.items[menu.sel];
    const b = menu.block;
    const kind = menu.kind;
    if (!item || !b) { closeMenu(); return; }
    const el = textEl(b);
    const off = caretOffset(el);
    snapshot({ force: true });
    rangeFor(el, menu.start, off).deleteContents();
    closeMenu();

    if (kind === 'mention') {
      let page = item.page;
      if (item.create && handlers.createPageNamed) page = await handlers.createPageNamed(item.create);
      if (!page) { focus(b, 'end'); return; }
      const a = document.createElement('a');
      a.className = 'wiki';
      a.dataset.page = page.id;
      a.dataset.title = page.title || '無題';
      a.textContent = `${page.icon || ''} ${page.title || '無題'}`.trim();
      const r = rangeFor(el, menu.start, menu.start);
      r.insertNode(a);
      const tail = document.createTextNode(' ');
      a.after(tail);
      const sel2 = window.getSelection();
      const rr = document.createRange();
      rr.setStart(tail, 1); rr.collapse(true);
      sel2.removeAllRanges(); sel2.addRange(rr);
      syncFromDom(b);
      emit();
      return;
    }

    if (item.type === '__delete') { removeBlock(b); return; }
    if (item.type === '__duplicate') {
      syncFromDom(b);
      focus(insertAfter(b, { type: b.type, text: b.text, indent: b.indent, checked: b.checked, lang: b.lang, icon: b.icon, src: b.src, alt: b.alt, rows: b.rows }), 'end');
      return;
    }
    pushRecent(item.type);
    if (item.type === 'page') { await makePageBlock(b, el.textContent.trim()); return; }
    if (item.type === '__link') { openMention(b, caretOffset(el)); return; }
    if (item.type === 'image') {
      const file = handlers.pickImage ? await handlers.pickImage() : null;
      if (file) setType(b, 'image', { src: file.url, alt: file.name });
      else focus(b, 'end');
      return;
    }
    if (item.type === 'divider') {
      setType(b, 'divider', { text: '' });
      focus(insertAfter(b, {}), 'start');
      return;
    }
    setType(b, item.type);
    focus(b, 'end');
  }

  async function makePageBlock(b, titleText) {
    if (!handlers.createChildPage) return;
    const page = await handlers.createChildPage(titleText || '');
    if (!page) { focus(b, 'end'); return; }
    pageById.set(page.id, page);
    setType(b, 'page', { pageId: page.id, title: page.title || titleText || '', text: '' });
    if (!titleText) startRename(b);
    return page;
  }

  function openMention(b, start) {
    openMenu('mention', b, start);
    updateMenu('');
  }

  /* ======================= ブロックメニュー ======================= */
  function blockMenu(b, anchor) {
    syncFromDom(b);
    if (b.type === 'page') {
      UI.popup(anchor, [
        { label: '↗  このページを開く', run: () => handlers.openPage(b.pageId) },
        { label: '✎  名前を変更', run: () => startRename(b) },
        { label: '🔗  リンクをコピー', run: () => { navigator.clipboard.writeText(`[[${b.title || '無題'}]]`); UI.toast('コピーしました'); } },
        { sep: true },
        { label: '🗑  このブロックを削除', desc: '', danger: true, run: () => removeBlock(b) },
      ]);
      return;
    }
    const items = [
      { label: '🗑  削除', danger: true, run: () => removeBlock(b) },
      { label: '⧉  複製', run: () => {
        const copy = { type: b.type, text: b.text, indent: b.indent, checked: b.checked, lang: b.lang, icon: b.icon, src: b.src, alt: b.alt, rows: b.rows && b.rows.map((r) => [...r]) };
        focus(insertAfter(b, copy), 'end');
      } },
      { label: '⌘  Markdownをコピー', run: () => { navigator.clipboard.writeText(MD.blocksToMd([b])); UI.toast('コピーしました'); } },
      { sep: true },
      { label: '📄  ページに変換', run: () => makePageBlock(b, (b.text || '').trim()) },
      ...TYPES.filter((t) => !['image', '__link', 'page'].includes(t.type)).map((t) => ({
        label: `${t.icon}  ${t.label}に変換`, run: () => { setType(b, t.type); focus(b, 'end'); },
      })),
    ];
    UI.popup(anchor, items);
  }

  /* ======================= ブロック選択 ======================= */
  const bsel = { ids: [], anchor: -1, head: -1 };

  function paintSelection() {
    blocks.forEach((b) => b.el.classList.toggle('selected', bsel.ids.includes(b.id)));
    FormatBar.hide();
  }

  function clearBlockSelection() {
    if (!bsel.ids.length) return;
    bsel.ids = [];
    bsel.anchor = bsel.head = -1;
    blocks.forEach((b) => b.el.classList.remove('selected'));
  }

  function selectRange(a, c) {
    const lo = Math.min(a, c), hi = Math.max(a, c);
    bsel.anchor = a; bsel.head = c;
    bsel.ids = blocks.slice(lo, hi + 1).map((b) => b.id);
    const sel = window.getSelection();
    if (sel.rangeCount) sel.removeAllRanges();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    paintSelection();
  }

  function selectedBlocks() { return blocks.filter((b) => bsel.ids.includes(b.id)); }

  function deleteSelection() {
    const list = selectedBlocks();
    if (!list.length) return;
    snapshot({ force: true });
    const firstIndex = indexOf(list[0]);
    quiet = true;
    list.forEach((b) => removeBlock(b, { silent: true }));
    quiet = false;
    clearBlockSelection();
    const target = blocks[Math.max(0, firstIndex - 1)];
    if (target) focus(target, 'end');
    emit();
  }

  /* ======================= 書式バー ======================= */
  const FormatBar = (() => {
    let bar = null;

    function build() {
      bar = document.createElement('div');
      bar.className = 'fmt-bar';
      bar.innerHTML = `
        <button data-act="turn" class="wide">変換 ⌄</button>
        <span class="fmt-sep"></span>
        <button data-act="bold"><b>B</b></button>
        <button data-act="italic"><i>I</i></button>
        <button data-act="underline"><u>U</u></button>
        <button data-act="strikeThrough"><s>S</s></button>
        <button data-act="code">&lt;/&gt;</button>
        <button data-act="link">🔗</button>`;
      bar.addEventListener('mousedown', (e) => e.preventDefault());
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.dataset.act;
        const b = focusedBlock() || menu.block;
        if (act === 'turn') { if (b) blockMenu(b, btn); return; }
        if (act === 'code') { wrapCode(); return; }
        if (act === 'link') { linkPrompt(btn); return; }
        snapshot({ force: true });
        document.execCommand(act);
        if (b) { syncFromDom(b); emit(); }
        update();
        return;
      });
      document.body.appendChild(bar);
    }

    function wrapCode() {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      snapshot({ force: true });
      const text = sel.toString();
      document.execCommand('insertHTML', false, `<code>${MD.escHtml(text)}</code>${ZWSP}`);
      const b = focusedBlock();
      if (b) { syncFromDom(b); emit(); }
      hide();
    }

    function linkPrompt(anchor) {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const saved = sel.getRangeAt(0).cloneRange();
      const box = document.createElement('div');
      box.className = 'popup link-box';
      box.innerHTML = '<input placeholder="https://… か ページ名" spellcheck="false">';
      document.body.appendChild(box);
      const r = anchor.getBoundingClientRect();
      box.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
      box.style.top = (r.bottom + 6) + 'px';
      const input = box.querySelector('input');
      input.focus();
      const close = () => box.remove();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key !== 'Enter') return;
        const url = input.value.trim();
        close();
        if (!url) return;
        const s2 = window.getSelection();
        s2.removeAllRanges();
        s2.addRange(saved);
        snapshot({ force: true });
        if (/^https?:\/\//.test(url)) document.execCommand('createLink', false, url);
        else document.execCommand('insertHTML', false, `<a class="wiki" data-title="${MD.escHtml(url)}">${MD.escHtml(s2.toString() || url)}</a>`);
        const b = focusedBlock();
        if (b) { syncFromDom(b); emit(); }
        hide();
      });
      input.addEventListener('blur', close);
    }

    function update() {
      const sel = window.getSelection();
      if (!bar) build();
      if (bsel.ids.length) { hide(); return; }
      if (!sel.rangeCount || sel.isCollapsed) { hide(); return; }
      const node = sel.getRangeAt(0).startContainer;
      const host = node.nodeType === 1 ? node : node.parentElement;
      const textHost = host && host.closest('.text');
      if (!textHost || textHost.closest('.block[data-type="code"]')) { hide(); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) { hide(); return; }
      bar.classList.add('show');
      const w = bar.offsetWidth || 300;
      bar.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8)) + 'px';
      bar.style.top = (rect.top - bar.offsetHeight - 8 < 8 ? rect.bottom + 8 : rect.top - bar.offsetHeight - 8) + 'px';
      ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
        const btn = bar.querySelector(`[data-act="${cmd}"]`);
        if (btn) btn.classList.toggle('on', document.queryCommandState(cmd));
      });
    }

    function hide() { if (bar) bar.classList.remove('show'); }

    return { update, hide };
  })();

  /* ======================= ブロックのイベント ======================= */
  function wireBlock(b) {
    const node = b.el;
    const add = node.querySelector('.ctl-add');
    const handle = node.querySelector('.ctl-handle');

    add.onclick = () => {
      syncFromDom(b);
      const nb = insertAfter(b, {});
      focus(nb, 'start');
      openMenu('slash', nb, 0);
    };
    handle.onclick = (e) => { e.stopPropagation(); blockMenu(b, handle); };

    handle.addEventListener('dragstart', (e) => {
      syncAll();
      e.dataTransfer.setData('text/ln-block', b.id);
      e.dataTransfer.effectAllowed = 'move';
      groupOf(b).forEach((g) => g.el.classList.add('dragging'));
    });
    handle.addEventListener('dragend', () => {
      blocks.forEach((g) => g.el.classList.remove('dragging'));
      clearDropMarks();
    });

    node.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input')) return;
      e.preventDefault();
      blockMenu(b, { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) });
    });

    const el = textEl(b);
    if (!el) return;

    el.addEventListener('focus', () => { node.classList.add('focus'); clearBlockSelection(); });
    el.addEventListener('blur', () => { node.classList.remove('focus'); syncFromDom(b); });

    el.addEventListener('beforeinput', (ev) => { if (!ev.isComposing) snapshot(); });
    el.addEventListener('compositionend', () => { syncFromDom(b); emit(); });

    el.addEventListener('input', (ev) => {
      if (ev && ev.isComposing) { syncFromDom(b); emit(); return; }   // IME変換中は何もしない
      if (b.type !== 'code' && applyBlockRules(b)) return;

      if (!menu.kind && b.type !== 'code') {
        const off = caretOffset(el);
        const txt = el.textContent;
        const two = txt.slice(Math.max(0, off - 2), off);
        const one = txt[off - 1];
        if (one === '/' && (off === 1 || /[\s　]/.test(txt[off - 2]))) { openMenu('slash', b, off - 1); syncFromDom(b); emit(); return; }
        if (two === '[[') { openMention(b, off - 2); syncFromDom(b); emit(); return; }
        if (one === '@' && (off === 1 || /[\s　]/.test(txt[off - 2]))) { openMention(b, off - 1); syncFromDom(b); emit(); return; }
      }

      if (menu.kind && menu.block === b) {
        const off = caretOffset(el);
        if (off <= menu.start) closeMenu();
        else {
          const raw = el.textContent.slice(menu.start, off).replace(/^(\/|@|\[\[)/, '');
          if (/\s{2,}/.test(raw) || raw.length > 20) closeMenu();
          else updateMenu(raw);
        }
      } else if (b.type !== 'code' && applyInlineRules(b)) {
        return;
      }

      syncFromDom(b);
      emit();
    });

    el.addEventListener('keydown', (e) => onKeyDown(e, b, el));

    el.addEventListener('paste', async (e) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const img = Array.from(dt.items || []).find((it) => it.kind === 'file' && /^image\//.test(it.type));
      if (img && handlers.saveImage) {
        e.preventDefault();
        const saved = await handlers.saveImage(img.getAsFile());
        if (!saved) return;
        snapshot({ force: true });
        if (!el.textContent.trim() && b.type === 'p') setType(b, 'image', { src: saved.url, alt: saved.name });
        else focus(insertAfter(b, { type: 'image', src: saved.url, alt: saved.name }), 'end');
        return;
      }
      const text = dt.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      snapshot({ force: true });
      if (b.type === 'code' || !/\n/.test(text.trim())) {
        document.execCommand('insertText', false, text);
        syncFromDom(b);
        emit();
        return;
      }
      const parsed = MD.mdToBlocks(text);
      let ref = b;
      if (!el.textContent.trim()) {
        const first = parsed.shift();
        setType(b, first.type, first);
      }
      quiet = true;
      parsed.forEach((pb) => { ref = insertAfter(ref, pb); });
      quiet = false;
      focus(ref, 'end');
      emit();
    });

    el.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.page) handlers.openPage(a.dataset.page);
      else if (a.dataset.title) handlers.createPage(a.dataset.title, b);
      else if (a.getAttribute('href')) window.open(a.getAttribute('href'), '_blank');
    });
  }

  function onKeyDown(e, b, el) {
    if (e.isComposing || e.keyCode === 229) return;   // IMEの変換確定を邪魔しない
    const meta = e.metaKey || e.ctrlKey;

    if (menu.kind) {
      if (e.key === 'ArrowDown') { e.preventDefault(); menu.sel = (menu.sel + 1) % menu.items.length; updateMenu(el.textContent.slice(menu.start, caretOffset(el)).replace(/^(\/|@|\[\[)/, '')); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); menu.sel = (menu.sel - 1 + menu.items.length) % menu.items.length; updateMenu(el.textContent.slice(menu.start, caretOffset(el)).replace(/^(\/|@|\[\[)/, '')); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMenu(); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    }

    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      syncFromDom(b);
      focus(insertAfter(b, { type: b.type, text: b.text, indent: b.indent, checked: b.checked, lang: b.lang, icon: b.icon, src: b.src, alt: b.alt, rows: b.rows }), 'end');
      return;
    }
    if (meta && e.key === 'Enter') {
      e.preventDefault();
      if (b.type === 'todo') toggleCheck(b);
      else if (b.type === 'toggle') setCollapsed(b, !b.collapsed);
      return;
    }
    if (meta && !e.shiftKey && ['b', 'i', 'u'].includes(e.key.toLowerCase()) && b.type !== 'code') {
      e.preventDefault();
      snapshot({ force: true });
      document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
      syncFromDom(b); emit(); FormatBar.update();
      return;
    }
    if (meta && e.shiftKey && e.key.toLowerCase() === 's' && b.type !== 'code') {
      e.preventDefault();
      snapshot({ force: true });
      document.execCommand('strikeThrough');
      syncFromDom(b); emit();
      return;
    }
    if (meta && e.key.toLowerCase() === 'e' && b.type !== 'code') {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel.isCollapsed) return;
      snapshot({ force: true });
      document.execCommand('insertHTML', false, `<code>${MD.escHtml(sel.toString())}</code>${ZWSP}`);
      syncFromDom(b); emit();
      return;
    }
    if (meta && e.key.toLowerCase() === 'a') {
      const sel = window.getSelection();
      const whole = sel.rangeCount && sel.toString().length >= el.textContent.length && el.textContent.length > 0;
      if (whole || !el.textContent.length) { e.preventDefault(); selectRange(0, blocks.length - 1); }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      selectRange(indexOf(b), indexOf(b));
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (b.type === 'code') { snapshot(); document.execCommand('insertText', false, '\n'); syncFromDom(b); emit(); return; }
      syncFromDom(b);
      const empty = !el.textContent.replace(/​/g, '').trim();
      if (LIST_LIKE.includes(b.type) && empty) {
        if ((b.indent || 0) > 0) setIndent(b, -1);
        else { setType(b, 'p'); focus(b, 'start'); }
        return;
      }
      if ((b.type === 'quote' || b.type === 'callout') && empty) { setType(b, 'p'); focus(b, 'start'); return; }
      const [before, after] = splitHtml(el);
      el.innerHTML = before;
      syncFromDom(b);
      const type = ['bullet', 'numbered', 'todo'].includes(b.type) ? b.type : 'p';
      const indent = b.type === 'toggle' ? (b.indent || 0) + 1 : b.indent;
      const nb = insertAfter(b, { type, indent, checked: false, text: MD.htmlToMd(after) });
      focus(nb, 'start');
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      setIndent(b, e.shiftKey ? -1 : 1);
      return;
    }

    if (e.key === 'Backspace') {
      const off = caretOffset(el);
      const sel = window.getSelection();
      if (off === 0 && sel.isCollapsed) {
        e.preventDefault();
        if ((b.indent || 0) > 0) { setIndent(b, -1); return; }
        if (b.type !== 'p') { syncFromDom(b); setType(b, 'p'); focus(b, 'start'); return; }
        const prev = prevOf(b);
        if (!prev) return;
        if (NO_TEXT.includes(prev.type)) { removeBlock(prev); return; }
        snapshot({ force: true });
        const prevText = textEl(prev);
        const at = prevText.textContent.length;
        prevText.innerHTML += el.innerHTML;
        quiet = true;
        removeBlock(b, { silent: true });
        quiet = false;
        syncFromDom(prev);
        focus(prev, at);
        emit();
        return;
      }
    }

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      const off = caretOffset(el);
      const sel = window.getSelection();
      if (!sel.isCollapsed) return;
      if (e.key === 'ArrowUp' && off === 0) {
        const prev = prevOf(b);
        if (prev) { e.preventDefault(); focus(prev, 'end'); }
        else if (handlers.focusTitle) { e.preventDefault(); handlers.focusTitle(); }
      } else if (e.key === 'ArrowDown' && off === el.textContent.length) {
        const next = nextOf(b);
        if (next) { e.preventDefault(); focus(next, 'start'); }
      }
    }
  }

  /* ======================= ルート（ドラッグ・範囲選択） ======================= */
  const clearDropMarks = () => root().querySelectorAll('.drop-above,.drop-below').forEach((n) => n.classList.remove('drop-above', 'drop-below'));

  function wireRoot() {
    const r = root();
    const scroller = document.getElementById('scroller');

    r.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/ln-block')) return;
      e.preventDefault();
      const target = e.target.closest('.block');
      clearDropMarks();
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-above' : 'drop-below');
    });

    r.addEventListener('drop', (e) => {
      const id = e.dataTransfer.getData('text/ln-block');
      if (!id) return;
      e.preventDefault();
      const target = e.target.closest('.block');
      clearDropMarks();
      const src = blocks.find((b) => b.id === id);
      if (!src || !target) return;
      const dst = blocks.find((b) => b.el === target);
      const group = groupOf(src);
      if (group.includes(dst)) return;
      const rect = target.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      const dstIndex = indexOf(dst);
      moveGroup(group, above ? dstIndex - 1 : dstIndex);
    });

    // ドラッグでブロックを範囲選択
    let anchorIndex = -1;
    let dragging = false;
    r.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.ctl') || e.target.closest('.fmt-bar')) return;
      const node = e.target.closest('.block');
      anchorIndex = node ? blocks.findIndex((b) => b.el === node) : -1;
      dragging = false;
      if (!e.shiftKey) clearBlockSelection();
    });
    document.addEventListener('mousemove', (e) => {
      if (anchorIndex < 0 || e.buttons !== 1) return;
      const node = e.target.closest && e.target.closest('.block');
      if (!node) return;
      const i = blocks.findIndex((b) => b.el === node);
      if (i < 0 || i === anchorIndex) return;
      dragging = true;
      selectRange(anchorIndex, i);
    });
    document.addEventListener('mouseup', () => { if (!dragging) anchorIndex = -1; dragging = false; });

    scroller.addEventListener('click', (e) => {
      if (e.target.closest('.block') || e.target.closest('.page-top') || e.target.closest('#trash-view') || e.target.closest('.popup')) return;
      const last = blocks[blocks.length - 1];
      if (last && last.el && e.clientY < last.el.getBoundingClientRect().top) return;
      if (last && last.type === 'p' && !(textEl(last) || {}).textContent) focus(last, 'end');
      else focus(insertAfter(last || null, {}), 'start');
    });

    scroller.addEventListener('scroll', () => { FormatBar.hide(); if (menu.kind) positionMenu(); });

    document.addEventListener('selectionchange', () => FormatBar.update());

    document.addEventListener('mousedown', (e) => {
      if (menu.kind && !e.target.closest('.popup')) closeMenu();
    });

    // エディタ外にフォーカスがあるときの取り消し／やり直し
    document.addEventListener('keydown', (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z') return;
      const ae = document.activeElement;
      if (ae && (ae.id === 'title' || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (ae && ae.classList && (ae.classList.contains('text') || ae.tagName === 'TD')) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    });

    // ブロック選択中のキー操作
    document.addEventListener('keydown', (e) => {
      if (!bsel.ids.length) return;
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') { clearBlockSelection(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSelection(); return; }
      if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        navigator.clipboard.writeText(MD.blocksToMd(selectedBlocks().map((b) => (syncFromDom(b), b))));
        UI.toast('コピーしました');
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const list = selectedBlocks();
        let ref = list[list.length - 1];
        quiet = true;
        list.forEach((b) => { syncFromDom(b); ref = insertAfter(ref, { type: b.type, text: b.text, indent: b.indent, checked: b.checked, lang: b.lang, icon: b.icon, src: b.src, alt: b.alt, rows: b.rows }); });
        quiet = false;
        emit();
        return;
      }
      if (meta && e.key.toLowerCase() === 'a') { e.preventDefault(); selectRange(0, blocks.length - 1); return; }
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? -1 : 1;
        const head = Math.max(0, Math.min(blocks.length - 1, bsel.head + delta));
        if (e.shiftKey) selectRange(bsel.anchor, head);
        else { clearBlockSelection(); focus(blocks[head], 'end'); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const list = selectedBlocks();
        clearBlockSelection();
        focus(list[list.length - 1], 'end');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        selectedBlocks().forEach((b) => setIndent(b, e.shiftKey ? -1 : 1));
        return;
      }
    }, true);
  }

  /* ======================= 公開API ======================= */
  return {
    TYPES,
    init(opts) {
      handlers = Object.assign(handlers, opts || {});
      wireRoot();
    },
    setPageIndex(map, byId) { pageIndex = map; if (byId) pageById = byId; },
    load(markdown) {
      hist.past.length = 0;
      hist.future.length = 0;
      quiet = true;
      render(MD.mdToBlocks(markdown));
      quiet = false;
      clearBlockSelection();
    },
    markdown() { syncAll(); return MD.blocksToMd(blocks); },
    focusFirst() { focus(blocks[0], 'end'); },
    focusLast() { focus(blocks[blocks.length - 1], 'end'); },
    undo, redo,
    blocks: () => blocks,
  };
})();
