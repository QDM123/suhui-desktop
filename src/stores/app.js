import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,        // Phase 6 持久化
    theme: 'default',               // Phase 6 实装（default/forest/dusk/sunset/ink）
    night: false,                   // Phase 6 实装
    stats: { entries: 0, categories: 0 }
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
    }
  }
})
