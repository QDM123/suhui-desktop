/* ============================================================
   信纸 store（Phase 9 追加）
   - 内置：CSS 类 paper-N（见 base.css）
   - 自定义：papers 表，kind=image（paper:// 图片）/ gen（参数生成 CSS）
   - entry.background 取值：'paper-N' | 'custom:<paperId>'
   ============================================================ */
import { defineStore } from 'pinia'

function genStyle(cfg, forText = false) {
  const c = cfg || {}
  const patternColor = c.patternColor || 'rgba(0,150,140,.16)'

  /* 文字层模式（编辑器 / 阅读区）：容器只留底色，图案通过 CSS 变量
     交给正文元素绘制（32px 节奏随内容滚动，横线与文字永不错位） */
  if (forText) {
    const style = { backgroundColor: c.base || '#fffdf8' }
    if (c.pattern === 'lines') {
      style['--paper-line'] = patternColor
    } else if (c.pattern === 'dots') {
      style['--paper-bg'] = `radial-gradient(${patternColor} 1.2px, transparent 1.2px)`
      style['--paper-bg-size'] = '18px 18px'
    } else if (c.pattern === 'grid') {
      style['--paper-line'] = patternColor
      style['--paper-bg'] = `repeating-linear-gradient(90deg, transparent, transparent 31px, ${patternColor} 31px 32px)`
    }
    return style
  }

  /* 完整图案模式（缩略图 / 预览） */
  const style = { backgroundColor: c.base || '#fffdf8', backgroundImage: 'none' }
  if (c.pattern === 'lines') {
    style.backgroundImage = `repeating-linear-gradient(transparent, transparent 31px, ${patternColor} 31px 32px)`
  } else if (c.pattern === 'dots') {
    style.backgroundImage = `radial-gradient(${patternColor} 1.2px, transparent 1.2px)`
    style.backgroundSize = '18px 18px'
  } else if (c.pattern === 'grid') {
    style.backgroundImage =
      `repeating-linear-gradient(0deg, transparent, transparent 31px, ${patternColor} 31px 32px),` +
      `repeating-linear-gradient(90deg, transparent, transparent 31px, ${patternColor} 31px 32px)`
  }
  return style
}

export const usePaperStore = defineStore('papers', {
  state: () => ({
    customs: [],
    loaded: false
  }),

  getters: {
    options(state) {
      /* 全部可选：自定义在前 + 内置在后，value 为 entry.background 取值 */
      const custom = state.customs.map((c) => ({
        value: `custom:${c.id}`,
        name: c.name,
        custom: c
      }))
      return [...custom, ...BUILTINS.map((p) => ({ value: p, name: p, custom: null }))]
    }
  },

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return
      this.customs = await window.api.papers.list()
      this.loaded = true
    },
    /** background 值 → { cls, style }；自定义缺失时回退 paper-1
        forText=true 为文字层模式（编辑器/阅读区，图案交正文画，防滚动错位） */
    resolve(bg, forText = false) {
      if (!bg) return { cls: 'paper-1', style: null }
      if (!bg.startsWith('custom:')) return { cls: bg, style: null }
      const c = this.customs.find((x) => x.id === bg.slice(7))
      if (!c) return { cls: 'paper-1', style: null }
      if (c.kind === 'image') {
        return {
          cls: '',
          style: {
            backgroundImage: `url('paper://${c.file_name}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }
        }
      }
      return { cls: '', style: genStyle(c.config, forText) }
    },
    /** 供“全部信纸”弹窗 / 管理页的缩略图预览 */
    preview(bg) {
      return this.resolve(bg)
    },
    async remove(id) {
      await window.api.papers.remove(id)
      await this.load(true)
    }
  }
})

/* 内置列表（避免与 constants 循环依赖，这里字面量同步） */
const BUILTINS = [
  'paper-1', 'paper-2', 'paper-3', 'paper-4', 'paper-6',
  'paper-7', 'paper-8', 'paper-9', 'paper-10',
  'paper-11', 'paper-12', 'paper-13', 'paper-14', 'paper-15', 'paper-16'
]
