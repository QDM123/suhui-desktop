import { createRouter, createWebHashHistory } from 'vue-router'
import WriteView from './views/WriteView.vue'
import TimelineView from './views/TimelineView.vue'
import CalendarView from './views/CalendarView.vue'
import TunnelView from './views/TunnelView.vue'
import AlbumView from './views/AlbumView.vue'
import BinView from './views/BinView.vue'
import ExportView from './views/ExportView.vue'
import SettingsView from './views/SettingsView.vue'

export const NAV_ITEMS = [
  { path: '/write',     label: '写日记',   icon: '✏️', comp: WriteView },
  { path: '/timeline',  label: '时间轴',   icon: '📖', comp: TimelineView },
  { path: '/calendar',  label: '日历',     icon: '📅', comp: CalendarView },
  { path: '/tunnel',    label: '时光隧道', icon: '🕳️', comp: TunnelView },
  { path: '/album',     label: '相册',     icon: '🖼️', comp: AlbumView },
  { path: '/bin',       label: '回收站',   icon: '🗑️', comp: BinView },
  { path: '/export',    label: '导出',     icon: '📤', comp: ExportView }
]

export const FOOTER_ITEMS = [
  { path: '/settings',  label: '设置',     icon: '⚙️', comp: SettingsView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/timeline' },
    ...[...NAV_ITEMS, ...FOOTER_ITEMS].map((i) => ({
      path: i.path,
      name: i.path.slice(1),
      component: i.comp
    }))
  ]
})

export default router
