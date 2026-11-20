/* ============================================================
   UI 全局服务：toast + 询问弹窗（Promise 化）
   ============================================================ */
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    toast: { visible: false, text: '', _timer: null },
    ask: {
      visible: false,
      title: '',
      body: '',
      confirmText: '确定',
      cancelText: '取消',
      danger: false,
      _resolve: null
    }
  }),
  actions: {
    showToast(text, ms = 2000) {
      this.toast.text = text
      this.toast.visible = true
      clearTimeout(this.toast._timer)
      this.toast._timer = setTimeout(() => { this.toast.visible = false }, ms)
    },
    /** 询问弹窗，返回 Promise<boolean>（true=确认） */
    askConfirm(opts) {
      return new Promise((resolve) => {
        this.ask.title = opts.title || '提示'
        this.ask.body = opts.body || ''
        this.ask.confirmText = opts.confirmText || '确定'
        this.ask.cancelText = opts.cancelText ?? '取消'
        this.ask.danger = !!opts.danger
        this.ask.visible = true
        this.ask._resolve = resolve
      })
    },
    resolveAsk(ok) {
      this.ask.visible = false
      this.ask._resolve?.(ok)
      this.ask._resolve = null
    }
  }
})
