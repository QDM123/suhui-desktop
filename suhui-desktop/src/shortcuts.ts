/* ============================================================
   快捷键注册表（单一数据源）
   - 展示层：/shortcuts 中心页、F1 速查弹窗（ShortcutsView / ShortcutsQuick）
   - 执行层：App.vue（global 作用域）、WriteView.vue（write / content 作用域）
   新增快捷键只需在 SHORTCUTS 里登记一条，页面说明与按键行为自动同步；
   将来升级"自定义键位"时，把 COMBO_MAP 的构建改为读用户配置即可。
   ============================================================ */

export type Scope = 'global' | 'write' | 'content'

export const SCOPE_NAMES: Record<Scope, string> = { global: '全局', write: '写作页', content: '正文' }

export interface Shortcut {
  id: string
  group: string
  label: string
  keys: string[]
  alts?: string[]
  scope: Scope
}

export const SHORTCUTS: Shortcut[] = [
  /* 全局操作 */
  { id: 'new-diary',     group: '全局操作', label: '新建日记',     keys: ['Ctrl', 'N'], scope: 'global' },
  { id: 'search',        group: '全局操作', label: '搜索日记',     keys: ['Ctrl', 'F'], scope: 'global' },
  { id: 'goto-export',   group: '全局操作', label: '打开导出',     keys: ['Ctrl', 'E'], scope: 'global' },
  { id: 'goto-settings', group: '全局操作', label: '打开设置',     keys: ['Ctrl', ','], scope: 'global' },
  { id: 'help',          group: '全局操作', label: '快捷键速查',   keys: ['F1'], alts: ['?'], scope: 'global' },
  /* 写作页 */
  { id: 'save-exit',     group: '写作页',   label: '保存并退出',   keys: ['Ctrl', 'S'], scope: 'write' },
  { id: 'close-modal',   group: '写作页',   label: '关闭当前弹窗', keys: ['Esc'], scope: 'write' },
  /* 文本排版（写作页正文） */
  { id: 'ol',            group: '文本排版', label: '有序列表',     keys: ['Ctrl', 'Shift', 'O'], scope: 'content' },
  { id: 'ul',            group: '文本排版', label: '无序列表',     keys: ['Ctrl', 'Shift', 'U'], scope: 'content' },
  { id: 'divider',       group: '文本排版', label: '插入分隔线',   keys: ['Ctrl', 'Shift', 'H'], scope: 'content' },
  { id: 'timestamp',     group: '文本排版', label: '插入时间戳',   keys: ['Ctrl', 'Shift', 'T'], scope: 'content' }
]

/* ---------- 事件匹配 ---------- */

function normKey(e: KeyboardEvent): string {
  const k = e.key
  if (k === 'Escape') return 'Esc'
  if (k === ' ') return 'Space'
  return k.length === 1 ? k.toUpperCase() : k
}

/** 键盘事件 → 候选组合串数组（如 ['Ctrl+Shift+O']、['Shift+?', '?']）
    符号键（如 ? 本身隐含 Shift）会额外补充不带 Shift 的等价写法 */
export function eventCombos(e: KeyboardEvent): string[] {
  const key = normKey(e)
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  const out: string[] = []
  if (e.shiftKey) {
    out.push([...mods, 'Shift', key].join('+'))
    if (key.length === 1 && !/[A-Z0-9]/.test(key)) {
      out.push([...mods, key].join('+'))
    }
  } else {
    out.push([...mods, key].join('+'))
  }
  return out
}

/* 组合串 → 注册项（首登记优先，天然防止重复键位） */
const COMBO_MAP = new Map<string, Shortcut>()
for (const s of SHORTCUTS) {
  for (const c of [s.keys.join('+'), ...(s.alts || [])]) {
    if (!COMBO_MAP.has(c)) COMBO_MAP.set(c, s)
  }
}

/** 按作用域匹配快捷键；未命中返回 null
    scopes: 'global' | 'write' | 'content' 的子集 */
export function matchShortcut(e: KeyboardEvent, scopes: Scope[] = ['global', 'write', 'content']): Shortcut | null {
  for (const c of eventCombos(e)) {
    const s = COMBO_MAP.get(c)
    if (s && scopes.includes(s.scope)) return s
  }
  return null
}

export interface ShortcutGroup {
  name: string
  items: Shortcut[]
}

/** 分组视图：按注册表登记顺序返回 [{ name, items }]（展示层共用） */
export function shortcutGroups(): ShortcutGroup[] {
  const groups: ShortcutGroup[] = []
  for (const s of SHORTCUTS) {
    let g = groups.find((x) => x.name === s.group)
    if (!g) {
      g = { name: s.group, items: [] }
      groups.push(g)
    }
    g.items.push(s)
  }
  return groups
}
