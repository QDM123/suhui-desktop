import { defineStore } from 'pinia'

/* settings 表键名 */
export const K = {
  theme: 'ui.theme',
  night: 'ui.night',
  sidebar: 'ui.sidebar_collapsed'
}

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,
    theme: 'default',               // default/forest/dusk/sunset/ink
    night: false,
    stats: { entries: 0, categories: 0 },
    settingsLoaded: false
  }),
  getters: {
    themeAttr(state) {
      if (state.night) return 'night'
      return state.theme === 'default' ? null : state.theme
    }
  },
  actions: {
    async loadStats() {
      if (window.api) this.stats = await window.api.app.stats()
    },
    /* Phase 6：外观/侧栏状态持久化，启动时恢复 */
    async loadSettings() {
      if (!window.api || this.settingsLoaded) return
      const [theme, night, collapsed] = await Promise.all([
        window.api.settings.get(K.theme, 'default'),
        window.api.settings.get(K.night, '0'),
        window.api.settings.get(K.sidebar, '0')
      ])
      this.theme = ['default', 'forest', 'dusk', 'sunset', 'ink'].includes(theme) ? theme : 'default'
      this.night = night === '1'
      this.sidebarCollapsed = collapsed === '1'
      this.settingsLoaded = true
    },
    async setTheme(key) {
      this.theme = key
      this.night = false // 主题与夜间互斥（与 Demo 行为一致）
      await Promise.all([
        window.api.settings.set(K.theme, key),
        window.api.settings.set(K.night, '0')
      ])
    },
    async setNight(v) {
      this.night = v
      await window.api.settings.set(K.night, v ? '1' : '0')
    },
    async toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      await window.api.settings.set(K.sidebar, this.sidebarCollapsed ? '1' : '0')
    }
  }
})
