/* ============================================================
   preload —— contextBridge 暴露 IPC 白名单
   渲染进程通过 window.api.* 调用，禁止直接触达 Node/Electron
   `satisfies SuhuiApi`：与 src/types/api.d.ts 契约逐方法校验（A0-4）
   ============================================================ */
import { contextBridge, ipcRenderer } from 'electron'
import type { SuhuiApi } from '../src/types/api'

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
    version: () => ipcRenderer.invoke('app:get-version'),
    sysinfo: () => ipcRenderer.invoke('app:get-sysinfo'),
    autostart: {
      get: () => ipcRenderer.invoke('app:get-autostart'),
      set: (on) => ipcRenderer.invoke('app:set-autostart', on)
    },
    /* 关窗守卫（Phase 1）：主进程 close 拦截 → 通知渲染进程 flush → confirmClose */
    onBeforeClose: (cb) => {
      ipcRenderer.on('app:before-close', () => cb())
    },
    confirmClose: () => ipcRenderer.send('app:confirm-close'),
    /* 提醒通知点击 → 进入写日记（Phase 8） */
    onOpenWrite: (cb) => {
      ipcRenderer.on('app:open-write', () => cb())
    }
  },
  reminder: {
    get: () => ipcRenderer.invoke('reminder:get'),
    set: (opts) => ipcRenderer.invoke('reminder:set', opts)
  },
  mirror: {
    getSettings: () => ipcRenderer.invoke('mirror:get-settings'),
    setSettings: (patch) => ipcRenderer.invoke('mirror:set-settings', patch),
    chooseDir: () => ipcRenderer.invoke('mirror:choose-dir'),
    status: () => ipcRenderer.invoke('mirror:status'),
    syncNow: () => ipcRenderer.invoke('mirror:sync-now'),
    verify: () => ipcRenderer.invoke('mirror:verify'),
    restore: () => ipcRenderer.invoke('mirror:restore'),
    openDir: () => ipcRenderer.invoke('mirror:open-dir')
  },
  diary: {
    ensureDraft: (init) => ipcRenderer.invoke('diary:ensure-draft', init),
    patch: (id, patch) => ipcRenderer.invoke('diary:patch', id, patch),
    get: (id) => ipcRenderer.invoke('diary:get', id),
    today: () => ipcRenderer.invoke('diary:today'),
    setTags: (id, names) => ipcRenderer.invoke('diary:set-tags', id, names),
    list: (categoryId) => ipcRenderer.invoke('diary:list', categoryId),
    softDelete: (id) => ipcRenderer.invoke('diary:soft-delete', id),
    search: (q, categoryId) => ipcRenderer.invoke('diary:search', q, categoryId),
    range: (fromDay, toDay) => ipcRenderer.invoke('diary:range', fromDay, toDay),
    latestWeather: () => ipcRenderer.invoke('diary:latest-weather')
  },
  category: {
    list: () => ipcRenderer.invoke('category:list'),
    reorder: (ids) => ipcRenderer.invoke('category:reorder', ids),
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
    remove: (id) => ipcRenderer.invoke('media:remove', id),
    listAll: () => ipcRenderer.invoke('media:list-all')
  },
  bin: {
    list: () => ipcRenderer.invoke('bin:list'),
    restore: (id) => ipcRenderer.invoke('bin:restore', id),
    purge: (id) => ipcRenderer.invoke('bin:purge', id)
  },
  export: {
    preview: (opts) => ipcRenderer.invoke('export:preview', opts),
    run: (type, opts) => ipcRenderer.invoke('export:run', type, opts),
    longImage: (entryId) => ipcRenderer.invoke('export:long-image', entryId),
    history: () => ipcRenderer.invoke('export:history'),
    deleteRecord: (id) => ipcRenderer.invoke('export:delete-record', id),
    reveal: (p) => ipcRenderer.invoke('export:reveal', p)
  },
  import: {
    pick: () => ipcRenderer.invoke('import:pick'),
    run: (mdPath) => ipcRenderer.invoke('import:run', mdPath)
  },
  papers: {
    list: () => ipcRenderer.invoke('papers:list'),
    addImage: (name) => ipcRenderer.invoke('papers:add-image', name),
    addGen: (name, config) => ipcRenderer.invoke('papers:add-gen', name, config),
    remove: (id) => ipcRenderer.invoke('papers:remove', id)
  }
} satisfies SuhuiApi

contextBridge.exposeInMainWorld('api', api)
