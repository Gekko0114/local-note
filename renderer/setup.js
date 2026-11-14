/* local-note — 初回起動の保存先選択 */
'use strict';

const $ = (sel) => document.querySelector(sel);
let current = '';
let home = '';

// ホーム配下なら ~ に畳んで読みやすくする
const pretty = (p) => (home && p.startsWith(home + '/')) ? '~' + p.slice(home.length) : p;

function showNote(text, kind) {
  const el = $('#note');
  el.textContent = text || '';
  el.className = 'note' + (kind ? ' ' + kind : '');
}

function setPath(info) {
  if (!info || !info.path) return;
  current = info.path;
  if (info.home) home = info.home;
  $('#path').textContent = pretty(current);
  $('#path').title = current;
  if (info.existing > 0) {
    showNote(`このフォルダには既にメモが ${info.existing} 件あります。そのまま開きます。`, 'found');
    $('#start').textContent = 'このフォルダを開く';
  } else {
    showNote(info.fresh ? 'このフォルダを新しく作ります。' : '', '');
    $('#start').textContent = 'このフォルダで始める';
  }
}

async function boot() {
  setPath(await window.setup.info());

  $('#choose').addEventListener('click', async () => {
    const picked = await window.setup.choose();
    if (picked) setPath(picked);
  });

  $('#start').addEventListener('click', async () => {
    $('#start').disabled = true;
    const res = await window.setup.start(current);
    if (res && res.error) {
      showNote(res.error, 'err');
      $('#start').disabled = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('#start').disabled) $('#start').click();
  });

  console.log('setup ready');
}

boot().catch((err) => showNote('初期化に失敗しました: ' + err.message, 'err'));
