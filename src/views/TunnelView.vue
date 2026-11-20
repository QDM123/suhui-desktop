<template>
  <div class="view">
    <div class="view-head">
      <h1>{{ cal.year }} 年 · 时光隧道</h1>
      <span class="sub">整周 / 整月没有日记的时段会沉入隧道</span>
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn plain sm" @click="cal.year--; load()">‹ 上一年</button>
        <button class="btn plain sm" :disabled="cal.year >= nowYear" @click="cal.year++; load()">下一年 ›</button>
      </span>
    </div>

    <div class="card" style="padding:18px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
      <div
        v-for="m in months"
        :key="m.m"
        class="cal-cell"
        :class="{ tunnel: m.isTunnel }"
        :style="m.cnt ? '' : 'border-style:dashed;min-height:86px;'"
        @click="clickMonth(m)"
      >
        <span class="n">{{ m.m }}月</span>
        <span v-if="m.cnt" class="cal-ev">{{ m.cnt }} 篇日记</span>
        <span v-else-if="m.isTunnel" class="cal-ev more">🕳️ 整月空白</span>
        <span v-else class="cal-ev more" style="color:var(--text-secondary)">还没有日记</span>
      </div>
    </div>

    <div class="empty" style="padding-top:30px;">
      <span class="big" style="font-size:34px;">🕳️</span>
      点击空白月份可以直接补记 —— 这是溯洄区别于普通日记应用的差异化记忆点
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCalendarStore } from '../stores/calendar'
import { useUiStore } from '../stores/ui'
import { fmtDay } from '../constants'

const router = useRouter()
const cal = useCalendarStore()
const ui = useUiStore()

const nowYear = new Date().getFullYear()
const todayKey = fmtDay()
const monthCounts = ref(new Map())   // 月(1-12) -> 篇数

const isCurrentYear = computed(() => cal.year === nowYear)
const months = computed(() => {
  const maxM = isCurrentYear ? new Date().getMonth() + 1 : 12
  const out = []
  for (let m = 1; m <= maxM; m++) {
    const cnt = monthCounts.value.get(m) || 0
    const mm = String(m).padStart(2, '0')
    const monthEnd = `${cal.year}-${mm}-${new Date(cal.year, m, 0).getDate()}`
    out.push({
      m,
      cnt,
      isTunnel: cnt === 0 && monthEnd < todayKey   // 整月已过去且全空白
    })
  }
  return out
})

async function load() {
  const rows = await window.api.diary.range(`${cal.year}-01-01`, `${cal.year}-12-31`)
  const map = new Map()
  for (const r of rows) {
    const m = Number(r.day.slice(5, 7))
    map.set(m, (map.get(m) || 0) + 1)
  }
  monthCounts.value = map
}

async function clickMonth(m) {
  const mm = String(m).padStart(2, '0')
  if (m.cnt) {
    // 有日记 → 跳到该月日历
    cal.year = cal.year
    cal.month = m.m - 1
    cal.selectedDay = null
    router.push('/calendar')
    return
  }
  // 空白月 → 预填日期（15 日；未来则用今天）
  let date = `${cal.year}-${mm}-15`
  if (date > todayKey) date = todayKey
  const go = () => router.push({ path: '/write', query: { date } })
  if (m.isTunnel) {
    const okAsk = await ui.askConfirm({
      title: '时光隧道',
      body: '这段日子被时光带走了，要写点什么把它找回来吗？',
      confirmText: '确定'
    })
    if (okAsk) go()
  } else {
    go()
  }
}

onMounted(load)
</script>

<style>
.btn:disabled{opacity:.4;cursor:not-allowed;}
</style>
