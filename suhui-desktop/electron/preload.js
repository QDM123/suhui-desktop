/* ============================================================
   preload —— contextBridge 暴露 IPC 白名单
   渲染进程通过 window.api.* 调用，禁止直接触达 Node/Electron
   ============================================================ */
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close')
  },
  settings: {
    get: (key, fallback) => ipcRenderer.invoke('settings:get', key, fallback),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },
  app: {
    stats: () => ipcRenderer.invoke('app:stats'),
    dataDir: () => ipcRenderer.invoke('app:get-data-dir'),
    openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
    recentAddresses: () => ipcRenderer.invoke('app:recent-addresses'),
    /* 关窗守卫（Phase 1）：主进程 close 拦截 → 通知渲染进程 flush → confirmClose */
    onBeforeClose: (cb) => {
      ipcRenderer.on('app:before-close', () => cb())
    },
    confirmClose: () => ipcRenderer.send('app:confirm-close')
  },
  diary: {
    ensureDraft: (init) => ipcRenderer.invoke('diary:ensure-draft', init),
    patch: (id, patch) => ipcRenderer.invoke('diary:patch', id, patch),
    get: (id) => ipcRenderer.invoke('diary:get', id),
    today: () => ipcRenderer.invoke('diary:today'),
    setTags: (id, names) => ipcRenderer.invoke('diary:set-tags', id, names),
    list: (categoryId) => ipcRenderer.invoke('diary:list', categoryId),
    softDelete: (id) => ipcRenderer.invoke('diary:soft-delete', id),
    search: (q, categoryId) => ipcRenderer.invoke('diary:search', q, categoryId)
  },
  category: {
    list: () => ipcRenderer.invoke('category:list'),
    create: (name, color) => ipcRenderer.invoke('category:create', name, color),
    update: (id, patch) => ipcRenderer.invoke('category:update', id, patch),
    remove: (id) => ipcRenderer.invoke('category:delete', id)
  },
  tag: {
    listAll: () => ipcRenderer.invoke('tag:list-all'),
    rename: (id, name) => ipcRenderer.invoke('tag:rename', id, name),
    merge: (fromId, toId) => ipcRenderer.invoke('tag:merge', fromId, toId),
    remove: (id) => ipcRenderer.invoke('tag:delete', id)
  },
  media: {
    pickAndAdd: (entryId) => ipcRenderer.invoke('media:pick-and-add', entryId),
    addBuffer: (entryId, name, buf) =>
      ipcRenderer.invoke('media:add-buffer', entryId, name, buf),
    remove: (id) => ipcRenderer.invoke('media:remove', id)
  }
}

contextBridge.exposeInMainWorld('api', api)
