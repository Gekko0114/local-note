/* Markdown ⇄ ブロックの回帰テスト。
 *
 *   npm test
 *
 * renderer/markdown.js はブラウザ向けに window.MD へ代入するだけのスクリプトなので、
 * 偽の window を渡して評価して取り出す（DOM は使わない関数だけを対象にする）。
 * htmlToMd は DOM が必要なのでここでは扱わない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../renderer/markdown.js', import.meta.url), 'utf8');
const win = {};
new Function('window', src)(win);
const MD = win.MD;

const roundTrip = (md) => MD.blocksToMd(MD.mdToBlocks(md));
const typesOf = (md) => MD.mdToBlocks(md).map((b) => b.type);

test('MD が読み込めている', () => {
  assert.deepEqual(
    Object.keys(MD).sort(),
    ['blocksToMd', 'escHtml', 'htmlToMd', 'mdToBlocks', 'mdToHtml', 'uid'].sort()
  );
});

/* ---------------- 往復 ---------------- */

test('全ブロック種別が往復しても変わらない', () => {
  const md = [
    '# 見出し1',
    '',
    '## 見出し2',
    '',
    '### 見出し3',
    '',
    'ふつうの段落。**太字**と*斜体*と`コード`。',
    '',
    '- 箇条書き',
    '- もうひとつ',
    '',
    '1. 番号付き',
    '2. ふたつめ',
    '',
    '- [ ] 未完了',
    '- [x] 完了',
    '',
    '- ▾ 開いたトグル',
    '- ▸ 閉じたトグル',
    '',
    '> 引用',
    '',
    '> 💡 コールアウト',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    '---',
    '',
    '![画像](lnfile://files/a.png)',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
  ].join('\n');

  const once = roundTrip(md);
  // 1回目で正規形になり、2回目以降は変わらない（情報が落ちていない）。
  assert.equal(roundTrip(once), once, '2回目の往復で変化した');
  for (const needle of [
    '# 見出し1', '### 見出し3', '**太字**', '- 箇条書き', '1. 番号付き', '2. ふたつめ',
    '- [ ] 未完了', '- [x] 完了', '- ▾ 開いたトグル', '- ▸ 閉じたトグル',
    '> 引用', '> 💡 コールアウト', '```js', 'const a = 1;', '---',
    '![画像](lnfile://files/a.png)', '| A | B |', '| 1 | 2 |',
  ]) {
    assert.ok(once.includes(needle), `往復で消えた: ${needle}`);
  }
});

test('ページへのリンクは page ブロックになる', () => {
  const md = '[子ページ](p_1a2b3c4d.md)\n';
  const [b] = MD.mdToBlocks(md);
  assert.equal(b.type, 'page');
  assert.equal(b.title, '子ページ');
  assert.equal(b.pageId, 'p_1a2b3c4d');
  assert.equal(roundTrip(md).trim(), '[子ページ](p_1a2b3c4d.md)');
});

/* ---------------- 過去に壊れた箇所 ---------------- */

test('トグルの子のインデントが落ちない', () => {
  const md = [
    '- ▾ 親トグル',
    '  - 子の箇条書き',
    '    - 孫の箇条書き',
    '',
  ].join('\n');
  const blocks = MD.mdToBlocks(md);
  assert.deepEqual(blocks.map((b) => [b.type, b.indent]), [
    ['toggle', 0],
    ['bullet', 1],
    ['bullet', 2],
  ]);
  const out = roundTrip(md);
  assert.ok(out.includes('\n  - 子の箇条書き'), 'インデント1が落ちた:\n' + out);
  assert.ok(out.includes('\n    - 孫の箇条書き'), 'インデント2が落ちた:\n' + out);
});

test('種別の違うリストの間に空行が入る（続きとして読まれない）', () => {
  const blocks = [
    { type: 'bullet', text: '箇条書き', indent: 0 },
    { type: 'numbered', text: '番号付き', indent: 0 },
  ];
  const md = MD.blocksToMd(blocks);
  assert.ok(/- 箇条書き\n\n1\. 番号付き/.test(md), '空行が入っていない:\n' + md);
  assert.deepEqual(typesOf(md), ['bullet', 'numbered']);
});

test('番号付きリストはネストごとに振り直す', () => {
  const blocks = [
    { type: 'numbered', text: '一', indent: 0 },
    { type: 'numbered', text: '一の一', indent: 1 },
    { type: 'numbered', text: '一の二', indent: 1 },
    { type: 'numbered', text: '二', indent: 0 },
  ];
  const md = MD.blocksToMd(blocks);
  assert.equal(md.trim().split('\n').join('|'), '1. 一|  1. 一の一|  2. 一の二|2. 二');
});

test('コードブロックの中身はブロックとして解釈されない', () => {
  const md = ['```sh', '# これはコメント', '- これもコード', '---', '```', ''].join('\n');
  const blocks = MD.mdToBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code');
  assert.equal(blocks[0].lang, 'sh');
  assert.equal(blocks[0].text, '# これはコメント\n- これもコード\n---');
});

test('空の Markdown でも段落が1つ返る', () => {
  assert.deepEqual(typesOf(''), ['p']);
  assert.deepEqual(typesOf('   \n\n'), ['p']);
});

/* ---------------- HTML 化の安全性 ---------------- */

test('危険なURLはリンクにしない', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:x']) {
    const html = MD.mdToHtml(`[押して](${url})`);
    assert.ok(!/<a[^>]+href="[^"]*(?:file:|javascript:|vbscript:)/i.test(html), `リンクになった: ${url}\n${html}`);
  }
});

test('安全なURLはリンクになる', () => {
  assert.match(MD.mdToHtml('[外部](https://example.com/a)'), /<a[^>]+href="https:\/\/example\.com\/a"/);
  assert.match(MD.mdToHtml('[メール](mailto:a@example.com)'), /<a[^>]+href="mailto:a@example\.com"/);
  assert.match(MD.mdToHtml('[隣](p_1a2b3c4d.md)'), /<a[^>]+href="p_1a2b3c4d\.md"/);
  assert.match(MD.mdToHtml('![図](lnfile://files/a.png)'), /<img[^>]+src="lnfile:\/\/files\/a\.png"/);
});

test('URLから属性を抜け出せない', () => {
  const html = MD.mdToHtml('[罠](https://example.com/" onmouseover="alert(1))');
  // 本文として &quot; 付きで出るのは問題ない。タグの中に属性として紛れ込んでいないことを見る。
  assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), '属性を注入できた:\n' + html);
  assert.ok(!/href="[^"]*"[^\s>]/.test(html), 'href が閉じきれていない:\n' + html);
});

test('escHtml は引用符まで落とす', () => {
  assert.equal(MD.escHtml(`<a href="x" title='y'>&`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;');
});

test('本文のHTMLはそのまま出力しない', () => {
  const html = MD.mdToHtml('<img src=x onerror=alert(1)>');
  assert.ok(!/<img/i.test(html), 'タグが生で出た:\n' + html);
  assert.match(html, /&lt;img/);
});
