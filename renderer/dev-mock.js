/* ブラウザで見た目を確認するための簡易モック。Electron では読み込まれても何もしない。 */
(() => {
  if (window.api) return;
  const KEY = 'ln.mock.pages';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  const now = () => new Date().toISOString();
  const uid = () => 'p_' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

  let db = load();
  if (!Object.keys(db).length) {
    const home = uid();
    db[home] = {
      id: home, title: 'はじめに', icon: '👋', parent: '', tags: ['ガイド'], favorite: true, trashed: false,
      order: 1, created: now(), updated: now(),
      content: `このアプリはローカルPCだけで動きます。クラウドには何も送信しません。\n\n## 書き方\n\n半角の **/** を押すとブロックメニューが開きます。\n\n- [ ] チェックボックスはクリックで完了にできる\n- [ ] 行頭で Tab を押すと階層が下がる\n\n## Markdown ショートカット\n\n| 入力 | 変わるブロック |\n| --- | --- |\n| # + スペース | 見出し1 |\n| - + スペース | 箇条書き |\n| [] + スペース | ToDo |\n\n> 💡 ⌘P でページ検索、⌘N で新規ページ。\n\n\`\`\`js\nconsole.log('hello');\n\`\`\`\n`,
    };
    const kid = uid();
    db[kid] = { id: kid, title: 'デイリーメモ', icon: '🗒️', parent: home, tags: [], favorite: false, trashed: false, order: 2, created: now(), updated: now(), content: '## やること\n\n- [ ] 最初のタスクを書く\n\n## メモ\n' };
    save(db);
  }

  const metas = () => Object.values(db).map((p) => { const { content, ...meta } = p; return meta; });

  window.api = {
    listPages: async () => metas().sort((a, b) => a.order - b.order),
    getPage: async (id) => ({ ...db[id] }),
    createPage: async (data = {}) => {
      const id = uid();
      db[id] = { id, title: data.title || '', icon: data.icon || '', parent: data.parent || '', tags: [], favorite: false, trashed: false, order: Date.now(), created: now(), updated: now(), content: data.content || '' };
      save(db);
      return { ...db[id] };
    },
    updatePage: async (id, patch) => { Object.assign(db[id], patch, { updated: now() }); save(db); return { ...db[id] }; },
    deletePage: async (id, permanent) => {
      const kids = Object.values(db).filter((p) => p.parent === id).map((p) => p.id);
      [id, ...kids].forEach((t) => { if (permanent) delete db[t]; else db[t].trashed = true; });
      save(db);
      return { ok: true };
    },
    duplicatePage: async (id) => window.api.createPage({ title: db[id].title + ' のコピー', parent: db[id].parent, content: db[id].content }),
    search: async (q) => {
      const n = q.toLowerCase();
      return Object.values(db).filter((p) => !p.trashed && ((p.title || '').toLowerCase().includes(n) || (p.content || '').toLowerCase().includes(n)))
        .map((p) => ({ id: p.id, title: p.title, icon: p.icon, snippet: (p.content || '').slice(0, 80).replace(/\n/g, ' '), updated: p.updated }));
    },
    saveFile: async (name, data) => ({ url: URL.createObjectURL(new Blob([new Uint8Array(data)])), name }),
    getSettings: async () => ({ dataDir: '(ブラウザ確認用モック)', theme: 'light' }),
    setTheme: async (t) => t,
    revealData: async () => {},
    chooseData: async () => null,
    exportMarkdown: async () => null,
    onMenu: () => {},
    platform: 'mock',
  };
})();
