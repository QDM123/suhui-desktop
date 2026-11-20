/* ============================================================
   时间轴 store（Phase 2）：列表 + 分类过滤 + 选中阅读 + 软删
   ============================================================ */
import { defineStore } from 'pinia'
import { useAppStore } from './app'

export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    list: [],              // 列表条目（含 tags/category_name/media_count）
    filterCat: null,       // 分类过滤（null=全部）
    searchQ: '',           // 全局搜索词（Phase 3，空=全部）
    categories: [],
    selectedId: null,
    reader: null,          // 选中条目完整数据 {entry, tags, media}
    pendingSelectId: null  // 编辑器完成后跳转预选
  }),

  getters: {
    groups(state) {
      const m = new Map()
      for (const e of state.list) {
        const ym = e.year_month
        if (!m.has(ym)) m.set(ym, [])
        m.get(ym).push(e)
      }
      return [...m.entries()].map(([ym, items]) => ({ ym, items }))
    },
    idx(state) {
      return state.list.findIndex((e) => e.id === state.selectedId)
    }
  },

  actions: {
    async loadCategories() {
      this.categories = await window.api.category.list()
    },
    async load() {
      const q = this.searchQ.trim()
      this.list = q
        ? await window.api.diary.search(q, this.filterCat)
        : await window.api.diary.list(this.filterCat)
      // 选中项失效（被删/被过滤）时自动切换
      if (this.selectedId && !this.list.some((e) => e.id === this.selectedId)) {
        this.selectedId = this.list[0]?.id ?? null
        await this.loadReader()
      } else if (this.selectedId && !this.reader) {
        await this.loadReader()
      }
    },
    async setSearch(q) {
      this.searchQ = q
      await this.load()
      if (!this.list.some((e) => e.id === this.selectedId)) {
        this.selectedId = this.list[0]?.id ?? null
        await this.loadReader()
      }
    },
    async select(id) {
      this.selectedId = id
      await this.loadReader()
    },
    async loadReader() {
      if (!this.selectedId) { this.reader = null; return }
      this.reader = await window.api.diary.get(this.selectedId)
    },
    async setFilter(catId) {
      this.filterCat = this.filterCat === catId ? null : catId
      await this.load()
      if (!this.list.some((e) => e.id === this.selectedId)) {
        this.selectedId = this.list[0]?.id ?? null
        await this.loadReader()
      }
    },
    /** 翻页：d=-1 上移（更新），d=+1 下移（更旧）；返回到头文案或 null */
    step(d) {
      const n = this.idx + d
      if (n < 0) return '已经是第一篇日记了'
      if (n >= this.list.length) return '已经是最后一篇日记了'
      this.select(this.list[n].id)
      return null
    },
    async remove(id) {
      const r = await window.api.diary.softDelete(id)
      if (!r.ok) return false
      const oldIdx = this.list.findIndex((e) => e.id === id)
      this.selectedId = null
      this.reader = null
      await this.load()
      // 选中相邻条目（原位置优先，原为末篇则前一篇）
      const target = this.list[oldIdx] || this.list[oldIdx - 1] || null
      if (target) await this.select(target.id)
      useAppStore().loadStats()
      return true
    }
  }
})
