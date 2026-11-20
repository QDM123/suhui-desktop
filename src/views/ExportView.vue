<template>
  <div class="view" style="max-width:720px;margin:0 auto;width:100%;">
    <div class="view-head">
      <h1>导出日记</h1>
      <span class="sub">PDF / Word / 长图，本地生成、不限次数</span>
    </div>

    <!-- 筛选 -->
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">
        筛选范围 <span style="font-weight:400;color:var(--text-secondary);font-size:12px">（不选分类 = 全部；日期可选）</span>
      </div>
      <div class="chip-row" style="margin-bottom:10px;">
        <span
          v-for="c in categories"
          :key="c.id"
          class="chip"
          :class="{ on: pickedCats.includes(c.id) }"
          @click="toggleCat(c.id)"
        ><i class="cat-dot" :style="{ background: c.color }"></i>{{ c.name }}</span>
      </div>
      <div style="display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--text-secondary);">
        <input type="date" v-model="fromDay"> 至 <input type="date" v-model="toDay">
        <button v-if="fromDay || toDay" class="btn sm plain" @click="fromDay = ''; toDay = ''">清除日期</button>
      </div>
    </div>

    <!-- 三种导出 -->
    <div class="export-opt" :class="{ busy: busy === 'pdf' }" @click="run('pdf')">
      <span class="ico">📄</span>
      <span><div class="t">导出 PDF</div><div class="s">合并为单个 PDF，按时间正序、保留原日期，可预览可打印</div></span>
    </div>
    <div class="export-opt" :class="{ busy: busy === 'word' }" @click="run('word')">
      <span class="ico">📝</span>
      <span><div class="t">导出 Word</div><div class="s">合并为单个 .docx 文档，含标题 / 日期 / 正文 / 图片</div></span>
    </div>
    <div class="export-opt" :class="{ busy: busy === 'image' }" @click="longImage">
      <span class="ico">🖼️</span>
      <span><div class="t">生成长图</div><div class="s">把当前时间轴选中的一篇日记渲染为竖长图 PNG（也可在阅读页点 🖼️）</div></span>
    </div>

    <!-- 导出历史 -->
    <div class="card" style="padding:16px;margin-top:14px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">已导出文件</div>
      <template v-if="history.length">
        <div v-for="h in history" :key="h.id" class="table-row">
          <span style="font-size:18px">{{ h.type === 'pdf' ? '📄' : h.type === 'word' ? '📝' : '🖼️' }}</span>
          <span class="grow">
            <span class="t">{{ baseName(h.path) }}</span>
            <div class="s">{{ fmtSize(h.size) }} · {{ h.created_at.replace('T', ' ').slice(0, 16) }}</div>
          </span>
          <button class="btn sm ghost" @click="reveal(h.path)">打开位置</button>
          <button class="btn sm danger" @click="removeRecord(h)">删除</button>
        </div>
      </template>
      <div v-else style="font-size:12.5px;color:var(--text-secondary);">暂无导出记录</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useTimelineStore } from '../stores/timeline'
import { useUiStore } from '../stores/ui'

const tl = useTimelineStore()
const ui = useUiStore()

const categories = ref([])
const pickedCats = ref([])
const fromDay = ref('')
const toDay = ref('')
const busy = ref(null)
const history = ref([])

function toggleCat(id) {
  const i = pickedCats.value.indexOf(id)
  if (i >= 0) pickedCats.value.splice(i, 1)
  else pickedCats.value.push(id)
}
function baseName(p) { return p.split(/[\\/]/).pop() }
function fmtSize(n) {
  if (!n) return '—'
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'
}

async function loadHistory() {
  history.value = await window.api.export.history()
}

async function run(type) {
  if (busy.value) return
  if (fromDay.value && toDay.value && fromDay.value > toDay.value) {
    return ui.showToast('起始日期不能晚于结束日期')
  }
  busy.value = type
  ui.showToast(type === 'pdf' ? '正在生成 PDF…' : '正在生成 Word…')
  try {
    const r = await window.api.export.run(type, {
      categoryIds: pickedCats.value,
      fromDay: fromDay.value || null,
      toDay: toDay.value || null
    })
    if (r.canceled) ui.showToast('已取消')
    else if (r.ok) ui.showToast('导出完成：' + baseName(r.path))
    else ui.showToast(r.error || '导出失败')
    await loadHistory()
  } catch (e) {
    ui.showToast('导出失败：' + (e?.message || e))
  } finally {
    busy.value = null
  }
}

async function longImage() {
  if (busy.value) return
  if (!tl.selectedId) return ui.showToast('请先在时间轴选中一篇日记')
  busy.value = 'image'
  ui.showToast('正在生成长图…')
  try {
    const r = await window.api.export.longImage(tl.selectedId)
    if (r.canceled) ui.showToast('已取消')
    else if (r.ok) ui.showToast('长图已生成：' + baseName(r.path))
    else ui.showToast(r.error || '生成失败')
    await loadHistory()
  } catch (e) {
    ui.showToast('生成失败：' + (e?.message || e))
  } finally {
    busy.value = null
  }
}

async function reveal(p) {
  window.api.export.reveal(p)
}

async function removeRecord(h) {
  const okAsk = await ui.askConfirm({
    title: '删除导出文件记录',
    body: `确定删除该导出记录？\n（仅移除记录，不删除磁盘上的文件）`,
    confirmText: '删除',
    danger: true
  })
  if (!okAsk) return
  await window.api.export.deleteRecord(h.id)
  await loadHistory()
}

onMounted(async () => {
  categories.value = await window.api.category.list()
  await loadHistory()
})
</script>

<style>
.export-opt.busy{opacity:.5;cursor:wait;}
</style>
