// レンダラに渡す最小限のAPI（contextIsolation 有効）
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listPages: () => ipcRenderer.invoke('pages:list'),
  getPage: (id) => ipcRenderer.invoke('page:get', id),
  createPage: (data) => ipcRenderer.invoke('page:create', data),
  updatePage: (id, patch) => ipcRenderer.invoke('page:update', id, patch),
  deletePage: (id, permanent) => ipcRenderer.invoke('page:delete', id, permanent),
  duplicatePage: (id) => ipcRenderer.invoke('page:duplicate', id),
  search: (q) => ipcRenderer.invoke('pages:search', q),
  saveFile: (name, data) => ipcRenderer.invoke('file:save', { name, data }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:theme', theme),
  revealData: () => ipcRenderer.invoke('data:reveal'),
  chooseData: () => ipcRenderer.invoke('data:choose'),
  exportMarkdown: (id) => ipcRenderer.invoke('page:exportMarkdown', id),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  platform: process.platform,
});

// 初回起動の保存先選択画面だけが使う
contextBridge.exposeInMainWorld('setup', {
  info: () => ipcRenderer.invoke('setup:info'),
  choose: () => ipcRenderer.invoke('setup:choose'),
  start: (dir) => ipcRenderer.invoke('setup:start', dir),
});
