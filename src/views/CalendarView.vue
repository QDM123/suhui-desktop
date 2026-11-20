<template>
  <div class="view" style="display:block;">
    <div class="cal-wrap">
      <!-- 月历 -->
      <div class="cal-main card" style="padding:18px;">
        <div class="cal-head">
          <button @click="prevMonth">‹ {{ prevLabel }}</button>
          <span class="h">{{ cal.year }} 年 {{ MONTH_CN[cal.month] }}</span>
          <button @click="nextMonth">{{ nextLabel }} ›</button>
          <span style="margin-left:auto"><button @click="router.push('/tunnel')">🕳️ 年视图 · 时光隧道</button></span>
        </div>

        <div class="cal-grid">
          <div v-for="w in WEEK_HEADERS" :key="w" class="wk">{{ w }}</div>
          <div
            v-for="c in cells"
            :key="c.key"
            class="cal-cell"
            :class="{ today: c.isToday, future: c.isFuture, tunnel: c.isTunnel, sel: cal.selectedDay === c.key }"
            @click="clickCell(c)"
          >
            <span class="n">{{ c.num }}</span>
            <span v-for="(t, i) in c.previews" :key="i" class="cal-ev">{{ t }}</span>
            <span v-if="c.more > 0" class="cal-ev more">+{{ c.more }} 篇</span>
            <span v-if="c.isTunnel" class="cal-ev more">时光隧道</span>
          </div>
        </div>

        <div class="cal-legend">
          <span><i style="background:var(--accent-soft);border:1px solid var(--accent)"></i>有日记</span>
          <span><i style="background:var(--accent-soft);border:1px dashed var(--accent)"></i>时光隧道（整周空白）</span>
          <span><i style="border:1.5px solid var(--accent);background:transparent"></i>今天</span>
          <span style="margin-left:auto">未来日期禁止点击</span>
        </div>
      </div>

      <!-- 侧栏 -->
      <div class="cal-side">
        <div class="card" style="padding:14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">📌 这一天</div>
          <div v-if="dayEntries.length" style="font-size:12.5px;">
            <div
              v-for="e in dayEntries"
              :key="e.id"
              class="day-entry"
              @click="jumpToEntry(e.id)"
            >▸ {{ e.title }} <span style="color:var(--text-secondary)">{{ e.time }}</span></div>
          </div>
          <div v-else style="font-size:12.5px;color:var(--text-secondary)">点击左侧日期查看当日日记</div>
        </div>
        <div class="card" style="padding:14px;margin-top:12px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">🌤️ 今天</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:2;">
            {{ weatherLabel }} · {{ todayKey }}<br>已有 {{ todayCount }} 篇日记
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCalendarStore } from '../stores/calendar'
import { useTimelineStore } from '../stores/timeline'
import { useUiStore } from '../stores/ui'
import { weatherOf, fmtDay } from '../constants'

const MONTH_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const WEEK_HEADERS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const router = useRouter()
const cal = useCalendarStore()
const tl = useTimelineStore()
const ui = useUiStore()

const todayKey = fmtDay()
const byDay = ref(new Map())     // day -> entries[]
const latestW = ref(null)

const pad2 = (n) => String(n).padStart(2, '0')
const keyOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`

const weatherLabel = computed(() => {
  const w = latestW.value != null ? weatherOf(latestW.value) : null
  return w ? `${w.icon} ${w.name}` : '—'
})
const dayEntries = computed(() => byDay.value.get(cal.selectedDay) || [])
const todayCount = computed(() => byDay.value.get(todayKey)?.length || 0)

const prevLabel = computed(() => MONTH_CN[(cal.month + 11) % 12])
const nextLabel = computed(() => MONTH_CN[(cal.month + 1) % 12])

/* 月格子：含前后补位空格 */
const cells = computed(() => {
  const y = cal.year
  const m = cal.month
  const first = new Date(y, m, 1)
  const dim = new Date(y, m + 1, 0).getDate()
  const out = []
  for (let i = 0; i < first.getDay(); i++) out.push({ blank: true, key: `pad-${i}` })
  for (let d = 1; d <= dim; d++) {
    const key = keyOf(y, m, d)
    const entries = byDay.value.get(key) || []
    const isToday = key === todayKey
    const isFuture = key > todayKey
    out.push({
      key,
      num: d,
      isToday,
      isFuture,
      isTunnel: !entries.length && !isFuture && !isToday && weekAllBlankAndPast(y, m, d),
      previews: entries.slice(0, 2).map((e) => e.title),
      more: Math.max(0, entries.length - 2)
    })
  }
  return out
})

/* 时光隧道判定（月视图）：所在周（周日~周六）整周无日记且整周已过去 */
function weekAllBlankAndPast(y, m, d) {
  const dt = new Date(y, m, d)
  const weekStart = new Date(dt)
  weekStart.setDate(dt.getDate() - dt.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  if (keyOf(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate()) > todayKey) return false
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + i)
    if (byDay.value.get(keyOf(day.getFullYear(), day.getMonth(), day.getDate()))?.length) return false
  }
  return true
}

async function loadMonth() {
  const y = cal.year
  const m = cal.month
  const first = new Date(y, m, 1)
  const gridStart = new Date(first)
  gridStart.setDate(1 - first.getDay())
  const gridEnd = new Date(y, m + 1, 0)
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))
  const rows = await window.api.diary.range(
    keyOf(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate()),
    keyOf(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate())
  )
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.day)) map.set(r.day, [])
    map.get(r.day).push(r)
  }
  byDay.value = map
  latestW.value = await window.api.diary.latestWeather()
}

function prevMonth() {
  cal.month--
  if (cal.month < 0) { cal.month = 11; cal.year-- }
  cal.selectedDay = null
  loadMonth()
}
function nextMonth() {
  cal.month++
  if (cal.month > 11) { cal.month = 0; cal.year++ }
  cal.selectedDay = null
  loadMonth()
}

/* 点击四分支（报告 §4.2 逐字文案） */
async function clickCell(c) {
  if (c.blank) return
  if (c.isFuture) return ui.showToast('未来不可写哦')
  const entries = byDay.value.get(c.key) || []
  if (entries.length) {
    cal.selectedDay = c.key
    return
  }
  const isToday = c.isToday
  const go = () => router.push({ path: '/write', query: { date: c.key } })
  if (isToday) {
    const okAsk = await ui.askConfirm({
      title: '今日日记',
      body: '今天还没有写日记哦，快补上...',
      confirmText: '确定'
    })
    if (okAsk) go()
  } else if (c.isTunnel) {
    const okAsk = await ui.askConfirm({
      title: '时光隧道',
      body: '这段日子被时光带走了，要写点什么把它找回来吗？',
      confirmText: '确定'
    })
    if (okAsk) go()
  } else {
    const okAsk = await ui.askConfirm({
      title: '补记日记',
      body: '这一天还没有日记哦，要补一下吗？',
      confirmText: '确定'
    })
    if (okAsk) go()
  }
}

async function jumpToEntry(id) {
  await tl.setSearch('')
  if (tl.filterCat) await tl.setFilter(tl.filterCat)
  tl.pendingSelectId = id
  router.push('/timeline')
}

onMounted(loadMonth)
</script>

<style>
.cal-cell.sel{outline:2px solid var(--accent);outline-offset:-2px;}
.day-entry{
  padding:7px 0;border-bottom:1px dashed var(--line);cursor:pointer;
  color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.day-entry:hover{text-decoration:underline;}
</style>
