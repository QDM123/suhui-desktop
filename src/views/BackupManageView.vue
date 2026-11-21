<template>
  <div class="view" style="max-width:760px;margin:0 auto;width:100%;">
    <div class="view-head">
      <button class="tool-btn" title="返回" @click="back">‹</button>
      <h1>备份管理</h1>
      <span class="sub">{{ dir || '…' }}</span>
    </div>

    <!-- 统计条 -->
    <div class="bk-stats">
      <div class="bk-st"><span class="k">备份总数</span><b>{{ list.length }}</b><span class="u">份</span></div>
      <div class="bk-st"><span class="k">占用空间</span><b>{{ fmtSize(totalSize) }}</b></div>
      <div class="bk-st hl"><span class="k">最新备份</span><b>{{ list.length ? fmtAgo(list[0].mtime) : '暂无' }}</b></div>
      <span class="grow"></span>
      <button class="btn sm" :disabled="busy" @click="createNow">{{ busy ? '备份中…' : '＋ 立即备份' }}</button>
    </div>

    <!-- 列表 -->
    <div v-if="list.length" class="bk-list">
      <div v-for="(b, i) in list" :key="b.file" class="bk-row">
        <span class="tm">{{ fmtWhen(b.mtime) }}</span>
        <span class="badge" :class="b.type">{{ typeLabel(b.type) }}</span>
        <span v-if="i === 0" class="lock" title="最新一份受保护，完成下一次备份后自动解锁">🔒 最新·受保护</span>
        <span class="sz">{{ fmtSize(b.size) }}</span>
        <span class="grow"></span>
        <button class="btn sm plain" :disabled="busy" @click="restore(b)">恢复</button>
        <button v-if="i === 0" class="btn sm ghost" disabled title="最新一份备份不可删除">删除</button>
        <button v-else class="btn sm ghost" :disabled="busy" @click="remove(b)">删除</button>
      </div>
    </div>
    <div v-else class="card bk-empty">
      还没有备份。<br>点击上方「立即备份」创建第一份；之后每日快照与定时备份也会自动出现在这里。
    </div>

    <p class="bk-tip">💡 最新一份备份始终受保护不可删除，保证任何时刻都有备份可恢复；「每日快照」固定保留 7 份，「自动备份」按设置中的保留份数滚动清理。</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const ui = useUiStore()
const list = ref([])
const dir = ref('')
const busy = ref(false)

const totalSize = computed(() => list.value.reduce((s, b) => s + b.size, 0))

/* 从哪进入回哪：无来源时回设置 */
function back() { router.push(router.options.history.state.back || '/settings') }

function typeLabel(t) {
  return t === 'snapshot' ? '每日快照' : t === 'auto' ? '自动' : '手动'
}

function fmtSize(n) {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

function fmtWhen(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  const now = new Date()
  const yest = new Date(Date.now() - 86400000)
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`
  if (d.toDateString() === yest.toDateString()) return `昨天 ${hm}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

function fmtAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前'
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前'
  return Math.floor(s / 86400) + ' 天前'
}

async function load() {
  list.value = await window.api.backup.list()
  const s = await window.api.backup.getSettings()
  dir.value = s.effectiveDir || ''
}

async function createNow() {
  if (busy.value) return
  busy.value = true
  ui.showToast('正在备份…')
  try {
    const r = await window.api.backup.createNow()
    if (r.ok) {
      ui.showToast('备份完成：' + r.file)
      await load()
    } else {
      ui.showToast(r.error || '备份失败')
    }
  } catch (e) {
    ui.showToast('备份失败：' + (e?.message || e))
  } finally {
    busy.value = false
  }
}

async function restore(b) {
  if (busy.value) return
  busy.value = true
  try {
    const v = await window.api.backup.validate(b.path)
    if (!v.ok) {
      ui.askConfirm({ title: '备份无效', body: v.error, cancelText: '关闭' })
      return
    }
    const okAsk = await ui.askConfirm({
      title: '恢复备份',
      body: `该备份创建于 ${fmtWhen(b.mtime)}，包含 ${v.entries} 篇日记、${v.media} 条照片记录。\n\n恢复将覆盖当前全部数据，确定吗？`,
      confirmText: '恢复',
      danger: true
    })
    if (!okAsk) return
    ui.showToast('正在恢复，应用即将重启…')
    await new Promise((r) => setTimeout(r, 600))
    await window.api.backup.restore(b.path)
  } finally {
    busy.value = false
  }
}

async function remove(b) {
  const okAsk = await ui.askConfirm({
    title: '删除备份',
    body: `确定删除这份备份吗？\n${fmtWhen(b.mtime)} · ${fmtSize(b.size)}\n\n删除后不可恢复。`,
    confirmText: '删除',
    danger: true
  })
  if (!okAsk) return
  const r = await window.api.backup.delete(b.file)
  if (r.ok) {
    ui.showToast('已删除 1 份备份')
    await load()
  } else {
    ui.showToast(r.error || '删除失败')
  }
}

onMounted(load)
</script>

<style>
/* 备份管理中心 */
.bk-stats{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.bk-st{display:flex;align-items:baseline;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px;}
.bk-st .k{font-size:12px;color:var(--text-secondary);}
.bk-st b{font-size:15px;color:var(--text-main);}
.bk-st .u{font-size:12px;color:var(--text-secondary);}
.bk-st.hl{border-color:var(--accent);}
.bk-st.hl b{color:var(--accent);}
.bk-list{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px;}
.bk-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);}
.bk-row:last-child{border-bottom:0;}
.bk-row .tm{font-size:13px;color:var(--text-main);min-width:118px;flex:none;font-variant-numeric:tabular-nums;}
.bk-row .badge{flex:none;font-size:11px;border-radius:999px;padding:1px 9px;border:1px solid var(--line);color:var(--text-secondary);}
.bk-row .badge.snapshot{color:var(--accent);border-color:var(--accent);}
.bk-row .badge.auto{color:var(--text-main);border-color:var(--text-secondary);}
.bk-row .lock{flex:none;font-size:11px;border-radius:999px;padding:1px 9px;background:color-mix(in srgb,var(--accent) 12%,transparent);border:1px solid var(--accent);color:var(--accent);}
.bk-row .sz{flex:none;font-size:12px;color:var(--text-secondary);font-variant-numeric:tabular-nums;}
.bk-empty{text-align:center;padding:36px 16px;color:var(--text-secondary);line-height:1.9;}
.bk-tip{font-size:12px;color:var(--text-secondary);line-height:1.8;margin:14px 2px 0;}
</style>
