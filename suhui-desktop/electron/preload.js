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
    openDataDir: () => ipcRenderer.invoke('app:open-data-dir')
  }
}

contextBridge.exposeInMainWorld('api', api)
