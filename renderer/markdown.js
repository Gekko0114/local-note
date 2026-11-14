/* ブロック配列 ⇄ Markdown の相互変換（保存形式はただのMarkdownファイル） */
'use strict';

window.MD = (() => {
  let seq = 0;
  const uid = () => 'b' + (++seq) + Date.now().toString(36).slice(-4);

  const EMOJI_HEAD = /^(\p{Extended_Pictographic}(?:\uFE0F)?)\s+/u;

  /* ---------------- inline: HTML -> Markdown ---------------- */
  function inlineToMd(node) {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) { out += child.nodeValue; return; }
      if (child.nodeType !== 1) return;
      const tag = child.tagName.toLowerCase();
      const inner = inlineToMd(child);
      if (tag === 'br') out += '\n';
      else if (tag === 'strong' || tag === 'b') out += inner ? `**${inner}**` : '';
      else if (tag === 'em' || tag === 'i') out += inner ? `*${inner}*` : '';
      else if (tag === 'del' || tag === 's' || tag === 'strike') out += inner ? `~~${inner}~~` : '';
      else if (tag === 'u') out += inner ? `<u>${inner}</u>` : '';
      else if (tag === 'code') out += inner ? '`' + inner + '`' : '';
      else if (tag === 'img') out += `![${child.alt || ''}](${child.getAttribute('src') || ''})`;
      else if (tag === 'a') {
        if (child.dataset.page || child.classList.contains('wiki')) out += `[[${child.dataset.title || inner}]]`;
        else out += `[${inner}](${child.getAttribute('href') || ''})`;
      } else out += inner;
    });
    return out;
  }

  const htmlToMd = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return inlineToMd(div).replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
  };

  /* ---------------- inline: Markdown -> HTML ---------------- */
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // メモは他人からもらったファイルかもしれないので、URLは出所を見てから属性に入れる。
  // （mdToHtml は先頭で全体を escHtml 済みなので、ここでは再エスケープしない）
  // 許すのは http(s) / mailto / 画像用の lnfile・data:image / 同じフォルダ内の相対パスだけ。
  const safeUrl = (raw) => {
    const url = String(raw || '').trim();
    if (!url) return '';
    if (/^(https?:|mailto:|lnfile:)/i.test(url)) return url;
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]*$/i.test(url)) return url;
    if (/^[^:/?#]+\.md$/i.test(url)) return url;            // 隣のページへの相対リンク
    return '';                                              // javascript: や file: はここで落ちる
  };

  function mdToHtml(src, pageIndex) {
    const codes = [];
    let s = escHtml(src || '').replace(/`([^`]+)`/g, (_m, c) => { codes.push(c); return `\u0000C${codes.length - 1}\u0000`; });

    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) => {
      const src = safeUrl(url);
      return src ? `<img src="${src}" alt="${alt}">` : (alt || url);
    });

    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => {
      const key = target.trim().toLowerCase();
      const hit = pageIndex && pageIndex.get(key);
      const text = escHtml(label || target.trim());
      return hit
        ? `<a class="wiki" data-page="${hit.id}" data-title="${escHtml(target.trim())}">${text}</a>`
        : `<a class="wiki missing" data-new="${escHtml(target.trim())}" data-title="${escHtml(target.trim())}">${text}</a>`;
    });

    s = s.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, text, url) => {
      const href = safeUrl(url);
      const label = text || url;
      return href ? `<a href="${href}">${label}</a>` : label;
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre, url) => {
      const href = safeUrl(url);
      return href ? `${pre}<a href="${href}">${url}</a>` : `${pre}${url}`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
         .replace(/~~([^~]+)~~/g, '<del>$1</del>')
         .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');
    s = s.replace(/\n/g, '<br>');
    return s.replace(/\u0000C(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  }

  /* ---------------- blocks -> Markdown ---------------- */
  const pad = (n) => '  '.repeat(Math.max(0, n || 0));

  const LIST_TYPES = new Set(['bullet', 'numbered', 'todo', 'toggle']);

  function blocksToMd(blocks) {
    const out = [];
    const counters = [];
    let prevType = '';
    blocks.forEach((b) => {
      const indent = b.indent || 0;
      const switchedList = LIST_TYPES.has(prevType) && prevType !== b.type;
      if (switchedList) out.push('');
      prevType = b.type;
      if (b.type !== 'numbered') counters.length = 0;
      const text = (b.text || '').trim();
      const ind = pad(indent);
      switch (b.type) {
        case 'h1': out.push(`${ind}# ${text}`, ''); break;
        case 'h2': out.push(`${ind}## ${text}`, ''); break;
        case 'h3': out.push(`${ind}### ${text}`, ''); break;
        case 'bullet': out.push(`${pad(indent)}- ${text}`); break;
        case 'toggle': out.push(`${pad(indent)}- ${b.collapsed ? '▸' : '▾'} ${text}`); break;
        case 'todo': out.push(`${pad(indent)}- [${b.checked ? 'x' : ' '}] ${text}`); break;
        case 'numbered': {
          counters[indent] = (counters[indent] || 0) + 1;
          counters.length = indent + 1;
          out.push(`${pad(indent)}${counters[indent]}. ${text}`);
          break;
        }
        case 'quote': out.push(...text.split('\n').map((l) => `${ind}> ${l}`), ''); break;
        case 'callout': out.push(`${ind}> ${b.icon || '💡'} ${text.split('\n').join(' ')}`, ''); break;
        case 'code': out.push(ind + '```' + (b.lang || ''), ...(b.text || '').split('\n'), ind + '```', ''); break;
        case 'divider': out.push(`${ind}---`, ''); break;
        case 'image': out.push(`${ind}![${b.alt || ''}](${b.src || ''})`, ''); break;
        case 'page': out.push(`${ind}[${(b.title || '無題').replace(/[\[\]]/g, '')}](${b.pageId || ''}.md)`, ''); break;
        case 'table': {
          const rows = b.rows || [];
          if (!rows.length) break;
          out.push(`| ${rows[0].join(' | ')} |`);
          out.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
          rows.slice(1).forEach((r) => out.push(`| ${r.join(' | ')} |`));
          out.push('');
          break;
        }
        default: out.push(ind + text.split('\n').join('\n' + ind), '');
      }
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ---------------- Markdown -> blocks ---------------- */
  function mdToBlocks(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const push = (b) => blocks.push(Object.assign({ id: uid(), indent: 0, text: '' }, b));
    let i = 0;

    const indentOf = (l) => Math.floor((l.match(/^ */)[0].length) / 2);

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const lineIndent = indentOf(line);

      let m = line.match(/^\s*```(\S*)\s*$/);
      if (m) {
        const lang = m[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        push({ type: 'code', indent: lineIndent, lang, text: buf.join('\n') });
        continue;
      }

      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { push({ type: 'divider', indent: lineIndent }); i++; continue; }

      m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) { push({ type: 'h' + Math.min(3, m[1].length), indent: lineIndent, text: m[2] }); i++; continue; }

      if (/^\s*>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        const joined = buf.join('\n');
        const em = joined.match(EMOJI_HEAD);
        if (em) push({ type: 'callout', indent: lineIndent, icon: em[1], text: joined.slice(em[0].length) });
        else push({ type: 'quote', indent: lineIndent, text: joined });
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:\-|]+\|[\s:\-|]*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const rows = [cells(line)];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
        push({ type: 'table', indent: lineIndent, rows });
        continue;
      }

      m = line.match(/^(\s*)!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
      if (m) { push({ type: 'image', indent: lineIndent, alt: m[2], src: m[3] }); i++; continue; }

      m = line.match(/^\s*\[([^\]]*)\]\((p_[0-9a-f]{6,32})\.md\)\s*$/);
      if (m) { push({ type: 'page', indent: lineIndent, title: m[1], pageId: m[2] }); i++; continue; }

      m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (m) {
        const indent = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
        const ordered = /\d/.test(m[2]);
        const task = m[3].match(/^\[([ xX])\]\s*(.*)$/);
        const toggle = m[3].match(/^([\u25b8\u25be])\s*([\s\S]*)$/);
        if (task) push({ type: 'todo', indent, checked: task[1].toLowerCase() === 'x', text: task[2] });
        else if (toggle) push({ type: 'toggle', indent, collapsed: toggle[1] === '\u25b8', text: toggle[2] });
        else push({ type: ordered ? 'numbered' : 'bullet', indent, text: m[3] });
        i++;
        continue;
      }

      const buf = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s*(```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s|---+\s*$)/.test(lines[i])) { buf.push(lines[i].replace(/^ +/, '')); i++; }
      if (!buf.length) { buf.push(lines[i].replace(/^ +/, '')); i++; }
      push({ type: 'p', indent: lineIndent, text: buf.join('\n') });
    }

    if (!blocks.length) push({ type: 'p' });
    return blocks;
  }

  return { uid, htmlToMd, mdToHtml, blocksToMd, mdToBlocks, escHtml };
})();
