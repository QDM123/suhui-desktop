import { defineStore } from 'pinia'
import { fmtDay, fmtTime } from '../constants'

/* 文本类字段：300ms 防抖合并（计划 §2.3 / 开放问题 #8 默认）
   属性类字段：变更即时写库 */
const TEXT_KEYS = ['title', 'content']

function defaultFields() {
  return {
    title: '',
    content: '',
    occurredDay: fmtDay(),
    occurredTime: fmtTime(),
    weather: 1,
    mood: null,
    category_id: 1,
    address: '',
    background: 'paper-1'
  }
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    active: false,
    isNew: true,
    entryId: null,
    fields: defaultFields(),
    rev: 0,
    tags: [],
    media: [],
    /* idle | saving | saved | error */
    saveState: 'idle',
    savedAt: null,
    saveError: null,
    _pending: {},
    _timer: null,
    _flushing: false,
    _rerun: false,
    _current: Promise.resolve(true)
  }),

  getters: {
    pendingCount: (s) => Object.keys(s._pending).length,
    dirty: (s) => s.active && (Object.keys(s._pending).length > 0 || s.saveState === 'error')
  },

  actions: {
    open(existing = null, presetDate = null) {
      clearTimeout(this._timer)
      this._pending = {}
      this.saveState = 'idle'
      this.savedAt = null
      this.saveError = null
      this.isNew = !existing
      this.media = []
      this.tags = []
      if (existing) {
        this.entryId = existing.entry.id
        this.rev = existing.entry.rev
        const at = existing.entry.occurred_at
        this.fields = {
          title: existing.entry.title,
          content: existing.entry.content,
          occurredDay: at.slice(0, 10),
          occurredTime: at.slice(11, 16),
          weather: existing.entry.weather,
          mood: existing.entry.mood,
          category_id: existing.entry.category_id,
          address: existing.entry.address,
          background: existing.entry.background
        }
        this.tags = existing.tags.map((t) => t.name)
        this.media = existing.media || []
      } else {
        this.entryId = null
        this.rev = 0
        this.fields = defaultFields()
        if (presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate) && presetDate <= fmtDay()) {
          this.fields.occurredDay = presetDate
        }
      }
      this.active = true
    },

    closeSilent() {
      clearTimeout(this._timer)
      this.active = false
      this._pending = {}
    },

    setField(key, value) {
      this.fields[key] = value
      this.queueSave([key])
    },

    queueSave(keys) {
      if (!this.active) return
      for (const k of keys) this._pending[k] = true
      clearTimeout(this._timer)
      const allText = Object.keys(this._pending).every((k) => TEXT_KEYS.includes(k))
      if (allText) {
        this._timer = setTimeout(() => { this.flush() }, 300)
      } else {
        this.flush()
      }
    },

    _draftInit() {
      const f = this.fields
      return {
        title: f.title,
        content: f.content,
        occurredDay: f.occurredDay,
        occurredTime: f.occurredTime,
        weather: f.weather,
        mood: f.mood,
        category_id: f.category_id,
        address: f.address,
        background: f.background
      }
    },

    _buildPatch() {
      const f = this.fields
      const patch = {}
      for (const k of Object.keys(this._pending)) {
        if (k === 'occurredDay' || k === 'occurredTime') {
          if (patch.occurred_at === undefined) {
            const time = /^\d{2}:\d{2}$/.test(f.occurredTime) ? f.occurredTime : '00:00'
            patch.occurred_at = `${f.occurredDay}T${time}:00`
          }
        } else {
          patch[k] = f[k]
        }
      }
      return patch
    },

    /** flush 全部待写变更；返回 true=全部落盘成功 */
    async flush() {
      if (this._flushing) {
        this._rerun = true
        return this._current
      }
      this._flushing = true
      this._current = this._doFlush()
      const ok = await this._current
      this._flushing = false
      if (this._rerun) {
        this._rerun = false
        return this.flush()
      }
      return ok
    },

    async _doFlush() {
      if (!this.active) return true
      try {
        if (!this.entryId) {
          if (!this.pendingCount) return true
          this.saveState = 'saving'
          const { id } = await window.api.diary.ensureDraft(this._draftInit())
          this.entryId = id
        }
        if (this.pendingCount) {
          this.saveState = 'saving'
          const r = await window.api.diary.patch(this.entryId, this._buildPatch())
          this.rev = r.rev
          this._pending = {}
        }
        this.saveState = 'saved'
        this.savedAt = new Date()
        this.saveError = null
        return true
      } catch (e) {
        this.saveState = 'error'
        this.saveError = String(e?.message || e)
        return false
      }
    },

    /** 属性/文本之外的操作前置：确保条目已建 */
    async ensureEntry() {
      if (this.entryId) return this.entryId
      const { id } = await window.api.diary.ensureDraft(this._draftInit())
      this.entryId = id
      this.rev = 1
      return id
    },

    async applyTags(names) {
      const id = await this.ensureEntry()
      const r = await window.api.diary.setTags(id, names)
      this.tags = r.tags.map((t) => t.name)
      this.rev = r.rev
    },

    async pickAndAddFiles() {
      const id = await this.ensureEntry()
      const r = await window.api.media.pickAndAdd(id)
      if (r.added?.length) this.media.push(...r.added)
      return r
    },

    async addBufferFile(file) {
      const id = await this.ensureEntry()
      const buf = await file.arrayBuffer()
      const name = file.name || `paste-${Date.now()}.png`
      const row = await window.api.media.addBuffer(id, name, buf)
      this.media.push(row)
    },

    async removeMedia(id) {
      const r = await window.api.media.remove(id)
      if (r.ok) this.media = this.media.filter((m) => m.id !== id)
      return r
    }
  }
})
