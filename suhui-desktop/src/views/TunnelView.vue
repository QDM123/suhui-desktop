<template>
  <div class="view">
    <div class="view-head">
      <h1>{{ cal.year }} 年 · 时光隧道</h1>
      <span class="sub">记录轨迹与空白时段，把沉入隧道的日子找回来</span>
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn plain sm" @click="cal.year--; load()">‹ 上一年</button>
        <button class="btn plain sm" :disabled="cal.year >= nowYear" @click="cal.year++; load()">下一年 ›</button>
      </span>
    </div>

    <!-- 统计条 -->
    <div class="hm-stats">
      <div class="hm-stat"><b>{{ stats.recordedDays }}</b><span>记录天数</span></div>
      <div class="hm-stat"><b>{{ stats.totalEntries }}</b><span>全年篇数</span></div>
      <div class="hm-stat"><b>{{ stats.longestStreak }}</b><span>最长连续（天）</span></div>
      <div class="hm-stat"><b>{{ stats.segments }}</b><span>空白时段（段）</span></div>
    </div>

    <!-- 年度热力图（三种时间尺度） -->
    <div class="card" style="padding:18px 22px;margin-bottom:14px;">
      <div class="hm-toolbar" style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        <div class="seg">
          <button :class="{ on: mode === 'month' }" @click="mode = 'month'">按月份</button>
          <button :class="{ on: mode === 'day' }" @click="mode = 'day'">按日期</button>
          <button :class="{ on: mode === 'week' }" @click="mode = 'week'">按星期</button>
        </div>
        <span style="font-size:11.5px;color:var(--text-secondary);">{{ modeHint }}</span>
      </div>

      <div class="hm-scroll">
        <div class="hm" :style="{ '--cell': cellSize, '--font': fontPx }">
          <!-- 表头（仅按星期：月份刻度） -->
          <div v-if="table.header.length" class="hm-row hm-head" :style="{ gridTemplateColumns: table.tpl }">
            <span class="hm-m"></span>
            <span v-for="(h, i) in table.header" :key="i" class="hm-h">{{ h }}</span>
          </div>
          <div
            v-for="row in table.rows"
            :key="row.label"
            class="hm-row"
            :style="{ gridTemplateColumns: table.tpl }"
          >
            <span class="hm-m">{{ row.label }}</span>
            <span
              v-for="(c, i) in row.cells"
              :key="i"
              class="hm-c"
              :class="[c.level, { tunnel: c.isTunnel, future: c.isFuture, today: c.isToday, void: c.void }]"
              :title="c.title"
              @click="clickCell(c)"
            >{{ c.text }}</span>
          </div>
        </div>
      </div>

      <div class="hm-legend">
        <span><i class="lg-sw l1"></i>1 篇</span>
        <span><i class="lg-sw l2"></i>2-3 篇</span>
        <span><i class="lg-sw l3"></i>4+ 篇</span>
        <span><i class="lg-sw tunnel"></i>时光隧道（整周空白）</span>
        <span><i class="lg-sw today"></i>今天</span>
        <span class="lg-tip">点击格子：有日记跳时间轴，空白可补记</span>
      </div>
    </div>

    <!-- 沉入隧道的时段 -->
    <div class="card" style="padding:16px 18px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">🕳️ 沉入隧道的时段</div>
      <template v-if="segments.length">
        <div v-for="s in segments" :key="s.start" class="hm-seg">
          <span style="font-size:16px">🕳️</span>
          <span class="grow">
            <span class="t">{{ s.label }}</span>
            <div class="s">{{ s.days }} 天空白 · 点击右侧把它找回来</div>
          </span>
          <button class="btn sm ghost" @click="goWrite(s.start)">补记</button>
        </div>
      </template>
      <div v-else class="empty" style="padding:26px;">
        <span class="big" style="font-size:30px;">✨</span>没有沉入隧道的时段，每个星期都有记录
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCalendarStore } from '../stores/calendar'
import { useTimelineStore } from '../stores/timeline'
import { useUiStore } from '../stores/ui'
import { fmtDay } from '../constants'

type Mode = 'month' | 'day' | 'week'

interface HmCell {
  key: string
  text: string
  cnt: number
  isFuture: boolean
  isToday: boolean
  isTunnel: boolean
  void: boolean
  level: string
  title: string
}
interface HmRow { label: string; cells: HmCell[] }
interface HmTable { header: string[]; rows: HmRow[]; tpl: string }
interface Segment { start: string; end: string; days: number; label: string }

const router = useRouter()
const cal = useCalendarStore()
const tl = useTimelineStore()
const ui = useUiStore()

const nowYear = new Date().getFullYear()
const todayKey = fmtDay()
const mode = ref<Mode>('month') // month=按月份 day=按日期 week=按星期

const countByDay = ref(new Map<string, number>())
const firstIdByDay = ref(new Map<string, string>())
const stats = ref({ recordedDays: 0, totalEntries: 0, longestStreak: 0, segments: 0 })
const segments = ref<Segment[]>([])

const pad2 = (n: number): string => String(n).padStart(2, '0')
const keyOf = (y: number, m: number, d: number): string => `${y}-${pad2(m + 1)}-${pad2(d)}`
const dayLabel = (key: string): string => {
  const [, m, d] = key.split('-').map(Number)
  return `${m}月${d}日`
}

const modeHint = computed(() => ({
  month: '每行一个月，看整月节奏',
  day: '每行一个日期，看每月同一天的轨迹',
  week: '每行一个星期，列为一年的周序，看每周节律'
}[mode.value]))

/* 格子字号/滚动基准（按模式）；列宽由 grid 模板弹性决定 */
const cellSize = computed(() => ({
  month: 'clamp(22px, 1.9vw, 32px)',
  day: 'clamp(30px, 3.6vw, 56px)',
  week: 'clamp(22px, 1.9vw, 30px)'
}[mode.value]))
const fontPx = computed(() => ({
  month: 'clamp(10px, 1.05vw, 15px)',
  day: 'clamp(13px, 1.7vw, 24px)',
  week: 'calc(var(--cell) * .44)'
}[mode.value]))

/* 统一构造格子：text = 印在格子上的数字（按模式为“几号”或“月份”） */
function makeCell(key: string, text: number): HmCell {
  const cnt = countByDay.value.get(key) || 0
  const isFuture = key > todayKey
  const isToday = key === todayKey
  const isTunnel = cnt === 0 && !isFuture && key < todayKey && weekBlank(key)
  return {
    key,
    text: String(text),
    cnt,
    isFuture,
    isToday,
    isTunnel,
    void: false,
    level: cnt === 0 ? '' : cnt >= 4 ? 'l3' : cnt >= 2 ? 'l2' : 'l1',
    title: isFuture
      ? `${dayLabel(key)} · 未来`
      : cnt > 0
        ? `${dayLabel(key)} · ${cnt} 篇`
        : isTunnel
          ? `${dayLabel(key)} · 沉入隧道`
          : `${dayLabel(key)} · 空白`
  }
}
/* 占位格（非本年 / 超出范围）：模板以 void 隐藏，不响应点击 */
const VOID: HmCell = { void: true, key: '', text: '', cnt: 0, isFuture: false, isToday: false, isTunnel: false, level: '', title: '' }

/* 三种尺度的表格：header + rows + 弹性列模板（数字直接印在格子上）
   month/day 用 1fr 弹性列填满容器（同日历机制，随窗口等比缩放）；
   week 列多（~53），用固定列横向滚动 */
const table = computed<HmTable>(() => {
  const y = cal.year
  const maxM = y === nowYear ? new Date().getMonth() : 11

  if (mode.value === 'month') {
    /* 按月份：格子上印“几号” */
    const rows: HmRow[] = []
    for (let m = 0; m <= maxM; m++) {
      const dim = new Date(y, m + 1, 0).getDate()
      const cells: HmCell[] = []
      for (let d = 1; d <= dim; d++) cells.push(makeCell(keyOf(y, m, d), d))
      rows.push({ label: `${m + 1}月`, cells })
    }
    return { header: [], rows, tpl: '46px repeat(31, minmax(0, 1fr))' }
  }

  if (mode.value === 'day') {
    /* 按日期：格子上印“月份” */
    const rows: HmRow[] = []
    for (let d = 1; d <= 31; d++) {
      const cells: HmCell[] = []
      let any = false
      for (let m = 0; m <= maxM; m++) {
        const dim = new Date(y, m + 1, 0).getDate()
        if (d > dim) { cells.push({ ...VOID }); continue }
        cells.push(makeCell(keyOf(y, m, d), m + 1))
        any = true
      }
      if (any) rows.push({ label: `${d}日`, cells })
    }
    return { header: [], rows, tpl: `46px repeat(${maxM + 1}, minmax(0, 72px))` }
  }

  /* week：行=日一二三四五六（单字），格子上印“几号”，列=全年周序 */
  const WEEK_CH = ['日', '一', '二', '三', '四', '五', '六']
  const jan1 = new Date(y, 0, 1)
  const gridStart = new Date(jan1)
  gridStart.setDate(1 - jan1.getDay())
  const lastDay = y === nowYear ? new Date() : new Date(y, 11, 31)
  const totalDays = Math.round((lastDay.getTime() - gridStart.getTime()) / 86400000) + 1
  const weeks = Math.ceil(totalDays / 7)
  const header: string[] = []
  let lastM = -1
  for (let w = 0; w < weeks; w++) {
    const colStart = new Date(gridStart)
    colStart.setDate(gridStart.getDate() + w * 7)
    const m = colStart.getMonth()
    header.push(m !== lastM && colStart.getFullYear() === y ? `${m + 1}月` : '')
    if (colStart.getFullYear() === y) lastM = m
  }
  const rows: HmRow[] = []
  for (let dow = 0; dow < 7; dow++) {
    const cells: HmCell[] = []
    for (let w = 0; w < weeks; w++) {
      const dt = new Date(gridStart)
      dt.setDate(gridStart.getDate() + w * 7 + dow)
      if (dt.getFullYear() !== y || dt > lastDay) { cells.push({ ...VOID }); continue }
      cells.push(makeCell(keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate()), dt.getDate()))
    }
    rows.push({ label: WEEK_CH[dow], cells })
  }
  return { header, rows, tpl: `46px repeat(${weeks}, var(--cell))` }
})

/* 空白周判定：所在周（周日~周六）整周已过去且全无记录 */
function weekBlank(key: string): boolean {
  const dt = new Date(key + 'T00:00:00')
  const start = new Date(dt)
  start.setDate(dt.getDate() - dt.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  if (keyOf(end.getFullYear(), end.getMonth(), end.getDate()) > todayKey) return false
  for (let i = 0; i < 7; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    if ((countByDay.value.get(keyOf(day.getFullYear(), day.getMonth(), day.getDate())) || 0) > 0) return false
  }
  return true
}

async function load() {
  const y = cal.year
  const from = new Date(y, 0, 1 - 7)
  const to = new Date(y, 11, 31 + 7)
  const rows = await window.api.diary.range(
    keyOf(from.getFullYear(), from.getMonth(), from.getDate()),
    keyOf(to.getFullYear(), to.getMonth(), to.getDate())
  )
  const counts = new Map<string, number>()
  const firsts = new Map<string, string>()
  for (const r of rows) {
    counts.set(r.day, (counts.get(r.day) || 0) + 1)
    if (!firsts.has(r.day)) firsts.set(r.day, r.id)
  }
  countByDay.value = counts
  firstIdByDay.value = firsts
  computeStats()
  computeSegments()
}

function computeStats(): void {
  const y = cal.year
  const prefix = `${y}-`
  let recordedDays = 0
  let totalEntries = 0
  for (const [day, c] of countByDay.value) {
    if (day.startsWith(prefix)) {
      recordedDays++
      totalEntries += c
    }
  }
  let longest = 0
  let cur = 0
  const end = new Date(Math.min(new Date(y, 11, 31).getTime(), new Date().getTime()))
  for (const d = new Date(y, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const k = keyOf(d.getFullYear(), d.getMonth(), d.getDate())
    if ((countByDay.value.get(k) || 0) > 0) {
      cur++
      if (cur > longest) longest = cur
    } else {
      cur = 0
    }
  }
  stats.value = { recordedDays, totalEntries, longestStreak: longest, segments: segments.value.length }
}

function computeSegments(): void {
  const y = cal.year
  const tunnelDays: string[] = []
  const end = new Date(Math.min(new Date(y, 11, 31).getTime(), new Date().getTime()))
  for (const d = new Date(y, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const k = keyOf(d.getFullYear(), d.getMonth(), d.getDate())
    if ((countByDay.value.get(k) || 0) === 0 && weekBlank(k)) tunnelDays.push(k)
  }
  const out: Segment[] = []
  let start: string | null = null
  let prev: string | null = null
  for (const k of tunnelDays) {
    if (start === null) {
      start = k
    } else if ((new Date(`${k}T00:00:00`).getTime() - new Date(`${prev as string}T00:00:00`).getTime()) / 86400000 > 1) {
      out.push(mkSeg(start, prev as string))
      start = k
    }
    prev = k
  }
  if (start !== null) out.push(mkSeg(start, prev as string))
  segments.value = out
  stats.value.segments = out.length
}

function mkSeg(start: string, end: string): Segment {
  const days = Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1
  const label = start === end ? dayLabelFull(start) : `${dayLabelFull(start)} ~ ${dayLabelFull(end)}`
  return { start, end, days, label }
}
const dayLabelFull = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

/* 格子点击：有日记跳时间轴；空白/隧道/今天走对应弹窗（报告 §4.2 逐字文案） */
async function clickCell(c: HmCell) {
  if (!c || c.void || c.isFuture || !c.key) return
  if (c.cnt > 0) {
    /* 跳时间轴并选中该日第一篇；清空搜索与分类过滤，确保目标可见 */
    await tl.setSearch('')
    if (tl.filterCat) await tl.setFilter(tl.filterCat)
    tl.pendingSelectId = firstIdByDay.value.get(c.key) ?? null
    router.push('/timeline')
    return
  }
  const go = () => goWrite(c.key)
  if (c.isToday) {
    const okAsk = await ui.askConfirm({ title: '今日日记', body: '今天还没有写日记哦，快补上...', confirmText: '确定' })
    if (okAsk) go()
  } else if (c.isTunnel) {
    const okAsk = await ui.askConfirm({
      title: '时光隧道',
      body: '这段日子被时光带走了，要写点什么把它找回来吗？',
      confirmText: '确定'
    })
    if (okAsk) go()
  } else {
    const okAsk = await ui.askConfirm({ title: '补记日记', body: '这一天还没有日记哦，要补一下吗？', confirmText: '确定' })
    if (okAsk) go()
  }
}

function goWrite(date: string) {
  router.push({ path: '/write', query: { date } })
}

onMounted(load)
</script>

<style>
.hm-stats{display:flex;gap:12px;margin-bottom:14px;}
.hm-stat{
  flex:1;background:var(--card);border:1px solid var(--line);border-radius:12px;
  padding:14px 18px;display:flex;flex-direction:column;gap:3px;
}
.hm-stat b{font-size:24px;color:var(--accent);}
.hm-stat span{font-size:12px;color:var(--text-secondary);}
.hm-scroll{overflow-x:auto;padding-bottom:4px;}
.hm{display:flex;flex-direction:column;gap:5px;}
/* 弹性网格行：列宽由模板决定（month/day 填满容器，week 固定列滚动） */
.hm-row{
  display:grid;gap:4px;align-items:stretch;
}
.hm-m{width:46px;font-size:12px;color:var(--text-secondary);align-self:center;flex:none;}
.hm-h{font-size:calc(var(--font,12px) * .9);color:var(--text-secondary);align-self:end;text-align:center;overflow:visible;white-space:nowrap;padding-bottom:2px;}
.hm-c{
  width:auto;height:auto;aspect-ratio:1;
  border-radius:calc(var(--font,12px) * .45);
  background:var(--line);opacity:.7;
  cursor:pointer;transition:.1s;
  display:flex;align-items:center;justify-content:center;
  font-size:var(--font,12px);color:var(--text-secondary);user-select:none;
}
.hm-c:hover{outline:1.5px solid var(--accent);}
.hm-c.l1{background:var(--accent-soft);opacity:1;color:#0e8f84;font-weight:600;}
.hm-c.l2{background:var(--accent);opacity:.62;color:#fff;font-weight:600;}
.hm-c.l3{background:var(--accent);opacity:1;color:#fff;font-weight:700;}
.hm-c.tunnel{
  background:transparent;opacity:1;
  border:1.5px dashed var(--accent);color:var(--accent);
}
.hm-c.future,.hm-c.void{visibility:hidden;pointer-events:none;}
.hm-c.today{outline:2px solid var(--accent);outline-offset:1px;opacity:.9;}
.cal-legend i.hm-c{display:inline-flex;vertical-align:-8px;cursor:default;}
/* 图例：小色块 + 可换行，不再挤压变形 */
.hm-legend{
  display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;
  margin-top:16px;padding-top:12px;border-top:1px dashed var(--line);
  font-size:12px;color:var(--text-secondary);
}
.hm-legend span{display:inline-flex;align-items:center;gap:7px;}
.lg-sw{
  width:14px;height:14px;border-radius:4px;display:inline-block;flex:none;
  background:var(--line);opacity:.7;
}
.lg-sw.l1{background:var(--accent-soft);opacity:1;}
.lg-sw.l2{background:var(--accent);opacity:.62;}
.lg-sw.l3{background:var(--accent);opacity:1;}
.lg-sw.tunnel{background:transparent;border:1.5px dashed var(--accent);opacity:1;}
.lg-sw.today{background:var(--line);outline:2px solid var(--accent);outline-offset:1px;opacity:.9;}
.lg-tip{margin-left:auto;color:var(--text-secondary);opacity:.8;}
/* 夜间适配：亮色硬编码换为暗底友好色 */
[data-theme="night"] .hm-c.l1{color:#7fe6dc;}
[data-theme="night"] .hm-c.tunnel{color:#7fe6dc;}
[data-theme="night"] .hm-stat b{color:#7fe6dc;}
[data-theme="night"] .hm-c{background:#262c3a;opacity:.85;}
/* 模式切换按钮放大 */
.hm-toolbar .seg{padding:4px;}
.hm-toolbar .seg button{padding:7px 18px;font-size:13px;border-radius:7px;}
.hm-seg{
  display:flex;align-items:center;gap:12px;padding:12px 4px;
  border-bottom:1px dashed var(--line);
}
.hm-seg:last-child{border-bottom:0;}
.hm-seg .grow{flex:1;min-width:0;}
.hm-seg .t{font-size:13.5px;font-weight:600;}
.hm-seg .s{font-size:11.5px;color:var(--text-secondary);margin-top:2px;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
</style>
