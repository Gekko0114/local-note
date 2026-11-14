# local-note

[日本語](README.ja.md) | **English**

A **Notion-like desktop note app** that runs entirely on your own Mac (Electron, built for personal use).
Nothing is ever sent to the cloud — every page is a plain Markdown file on your disk.

> The app's interface is in Japanese.

```bash
npm install     # first time only
npm start       # run it
```

To build it as an `.app`:

```bash
npm run pack
```

That produces `dist/mac-arm64/local-note.app`. Copy it to `/Applications` and use it like any other Mac app.

## Editing

The editor follows Notion's behaviour closely.

### Block editor
- **`/`** opens the block menu. Recently used blocks come first, and action commands such as `/削除` (delete) and `/複製` (duplicate) are available too (page / text / heading 1–3 / bulleted / numbered / to-do / toggle / quote / callout / code / divider / table / image / link to page)
- **`/page`** creates a sub-page right where you are. Type its name inline, then click it to go in (it also appears in the sidebar as a child)
- To the left of each block: **＋** (insert a block below, with the menu) and **⠿** (drag to reorder, click for the block menu)
- **Selecting text floats a format bar** (turn into / **B** / *I* / <u>U</u> / ~~S~~ / `code` / link)
- **Drag across blocks to select several**, then delete, duplicate, copy or indent them together
- `Esc` selects the block, `Shift+↑↓` extends the selection, `⌘A` twice selects every block
- **⌘Z / ⌘⇧Z** undo and redo everything, including adding, deleting and reordering blocks
- Right-click opens the block menu

### Markdown shortcuts (type at the start of a line)
| Type | Becomes |
| --- | --- |
| `# ` `## ` `### ` | Heading 1–3 |
| `- ` `* ` | Bulleted list |
| `1. ` | Numbered list |
| `[] ` | To-do |
| `> ` | Toggle list |
| `\| ` `" ` | Quote |
| `[]` | To-do (no space needed) |
| `a. ` `i. ` | Numbered list |
| ` ``` ` | Code block |
| `---` | Divider |

### Inline formatting as you type
`**bold**` / `*italic*` / `~strikethrough~` (`~~` works too) / `` `code` `` are converted the moment you close them.

### Sub-pages
- `/page` inserts a sub-page as a one-line block and lets you name it immediately. Click it to open that page
- An existing text block can become a page via **ページに変換** (turn into page) in the ⠿ menu
- The ⠿ menu also has **名前を変更** (rename) and **このページを開く** (open this page)
- On disk it is stored as a relative link, `[Title](p_xxxxxxxxxxxx.md)`, so other Markdown editors can follow it too
- Deleting the block keeps the page itself (to remove it, use ⋯ → trash in the sidebar)

### Links between pages
- **`[[`** or **`@`** opens a page search popup. Pick a page to link to it — or create one on the spot if it does not exist yet

### Keyboard
| Key | Action |
| --- | --- |
| `⌘P` / `⌘K` | Search / create a page |
| `⌘N` | New page |
| `⌘⇧N` | Add a sub-page |
| `⌘S` | Save now (it autosaves anyway) |
| `⌘\` | Show / hide the sidebar |
| `⌘D` | Duplicate the block |
| `⌘⏎` | Toggle a to-do / open a toggle |
| `Tab` / `⇧Tab` | Indent / outdent |
| `⌘⇧E` | Export as Markdown |

## How your notes are stored

One page is one Markdown file.

**On first launch the app asks where to keep them.** The suggested folder is `~/local-note/`, but you can pick anywhere — inside Dropbox or iCloud Drive, inside a Git repository, wherever. If you pick a folder that already holds notes, it opens them as they are instead of creating anything (so a folder carried over from another Mac just works). If you close the window without choosing, the app quits without creating anything.

```
~/local-note/
├── pages/p_xxxxxxxxxxxx.md
└── files/              # pasted images
```

> The default sits directly in your home folder because **Documents, Desktop and Downloads are protected by macOS**. Keeping notes in one of those means the app cannot read them until you grant it "Files and Folders" access in System Settings.

```markdown
---
id: p_1a2b3c4d5e6f
title: 週次メモ
icon: 🗒️
parent: p_0123456789ab
tags: 仕事, 議事録
favorite: false
trashed: false
order: 1762900000
created: 2026-11-12T10:00:00+09:00
updated: 2026-11-12T10:30:00+09:00
---
## やること

- [ ] 見積りを出す
- ▸ トグル
  中身
```

It is ordinary Markdown, so you are free to open it in another editor, `grep` it, or keep its history in `git`.
You can change the location later from **menu › local-note › データフォルダを変更…** (moving the existing files over is up to you, in Finder).

## Other things

- Drag the sidebar edge to resize it; drag and drop pages to nest them
- Favourites (★), tags, and a trash you can restore from
- Theme: menu › 表示 › ライト / ダーク / システムに合わせる (light / dark / match the system)
- Paste an image with `⌘V` while editing and it is saved into `files/`

## Limitations

- Text and background colours for blocks (Notion's colours) are not supported — Markdown cannot express them
- No database, board or calendar views. This is for documents only
- No sync. If you need it, put the storage folder itself in a syncing service

## Layout

```
local-note/
├── main.js            # Electron main process (file storage, menus, window)
├── preload.js         # the storage API exposed through contextBridge
├── renderer/
│   ├── index.html
│   ├── styles.css     # Notion-like design
│   ├── markdown.js    # blocks ⇄ Markdown
│   ├── editor.js      # the block editor itself
│   ├── app.js         # sidebar, search, page management
│   └── dev-mock.js    # a mock used only when checking the UI in a browser
└── package.json
```

Security settings: `contextIsolation: true`, `nodeIntegration: false`, CSP enabled. No code in this app reaches the network.
