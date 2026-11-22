/* ============================================================
   全局常量（对齐逆向报告 §3.6 天气枚举 / Demo 主题与信笺）
   ============================================================ */

export interface Weather {
  id: number
  name: string
  icon: string
}

export const WEATHERS: Weather[] = [
  { id: 1, name: '晴',   icon: '☀️' },
  { id: 2, name: '多云', icon: '⛅' },
  { id: 3, name: '阴',   icon: '☁️' },
  { id: 4, name: '雨',   icon: '🌧️' },
  { id: 5, name: '雷',   icon: '⛈️' },
  { id: 6, name: '冰雹', icon: '🧊' },
  { id: 7, name: '雾',   icon: '🌫️' },
  { id: 8, name: '雪',   icon: '🌨️' },
  { id: 9, name: '霾',   icon: '😶‍🌫️' },
  { id: 10, name: '夜晚', icon: '🌙' }
]

export const MOODS: string[] = ['😔', '😐', '🙂', '😊', '😄']

/* 内置信笺（夜间模式统一用 paper-5；paper-5 不在日间可选列表）
   Phase 9 追加：内置由 5 款扩充到 15 款（paper-1~4、6~16） */
export const BUILTIN_PAPERS: string[] = [
  'paper-1', 'paper-2', 'paper-3', 'paper-4', 'paper-6',
  'paper-7', 'paper-8', 'paper-9', 'paper-10',
  'paper-11', 'paper-12', 'paper-13', 'paper-14', 'paper-15', 'paper-16'
]
export const NIGHT_PAPER = 'paper-5'

export interface Theme {
  key: string
  name: string
  color: string
}

export const THEMES: Theme[] = [
  { key: 'default', name: '默认青', color: '#00CCBB' },
  { key: 'forest',  name: '林间',   color: '#3aa76d' },
  { key: 'dusk',    name: '暮紫',   color: '#7b7fd0' },
  { key: 'sunset',  name: '暖橙',   color: '#f0885a' },
  { key: 'ink',     name: '黛蓝',   color: '#4a5a72' }
]

export const WEEK_CN: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export const weatherOf = (id: number): Weather => WEATHERS.find((w) => w.id === id) || WEATHERS[0]
export const moodOf = (i: number | null): string => (i == null ? '' : MOODS[i] || '')

export const pad = (n: number): string => String(n).padStart(2, '0')
export const fmtDay = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fmtTime = (d: Date = new Date()): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const fmtClock = (d: Date = new Date()): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
