<template>
  <div class="view" style="max-width:720px;margin:0 auto;width:100%;">
    <div class="view-head">
      <h1>导出日记</h1>
      <span class="sub">PDF / Word / HTML，本地生成、不限次数</span>
    </div>

    <!-- 筛选 -->
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">
        筛选范围 <span style="font-weight:400;color:var(--text-secondary);font-size:12px">（不选分类 = 全部）</span>
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
      <div class="chip-row">
        <span
          v-for="r in RANGES"
          :key="r.key"
          class="chip"
          :class="{ on: range === r.key }"
          @click="setRange(r.key)"
        >{{ r.label }}</span>
      </div>
      <div v-if="range === 'custom'" style="display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--text-secondary);margin-top:10px;">
        <input type="date" v-model="fromDay"> 至 <input type="date" v-model="toDay">
        <button class="btn sm plain" @click="fromDay = ''; toDay = ''">清空</button>
      </div>
    </div>

    <!-- 三种合并导出 + 长图 -->
    <div class="export-opt" :class="{ busy: busy === 'pdf' }" @click="openPreview('pdf')">
      <span class="ico">📄</span>
      <span><div class="t">导出 PDF</div><div class="s">合并为单个 PDF，按时间正序、保留原日期，可预览可打印</div></span>
    </div>
    <div class="export-opt" :class="{ busy: busy === 'word' }" @click="openPreview('word')">
      <span class="ico">📝</span>
      <span><div class="t">导出 Word</div><div class="s">合并为单个 .docx 文档，含标题 / 日期 / 正文 / 图片</div></span>
    </div>
    <div class="export-opt" :class="{ busy: busy === 'html' }" @click="openPreview('html')">
      <span class="ico">🌐</span>
      <span><div class="t">导出 HTML</div><div class="s">生成文件夹（index.html + images），双击即可浏览，适合数据迁移与分享</div></span>
    </div>
    <div class="export-opt" :class="{ busy: busy === 'image' }" @click="longImage">
      <span class="ico">🖼️</span>
      <span><div class="t">生成长图</div><div class="s">把当前时间轴选中的一篇日记渲染为竖长图 PNG（也可在阅读页点 🖼️）</div></span>
    </div>

    <!-- 导出前预览 -->
    <Modal
      :visible="previewShow"
      title="导出预览"
      :buttons="[{ text: '取消' }, { text: '开始导出', cls: 'primary' }]"
      @close="previewShow = false"
      @action="onPreviewAction"
    >
      <div v-if="preview" class="pv-summary">
        <span>共 <b>{{ preview.count }}</b> 篇</span>
        <span>{{ preview.mediaCount }} 张图片</span>
        <span>{{ preview.fromDay }} ~ {{ preview.toDay }}</span>
        <span v-if="catNames">{{ catNames }}</span>
      </div>
      <div v-if="preview" class="pv-list">
        <div v-for="(it, i) in preview.items" :key="i" class="pv-item">
          <span class="d">{{ it.day.slice(5).replace('-', '/') }} {{ WEEK_CN[it.weekday] }}</span>
          <span class="t">{{ it.title }}</span>
          <span class="m">
            <template v-if="it.categoryName">[{{ it.categoryName }}] </template>
            <template v-if="it.mediaCount">🖼️{{ it.mediaCount }} </template>
            <template v-if="it.tagCount">#{{ it.tagCount }}</template>
          </span>
        </div>
      </div>
    </Modal>

    <!-- 导出历史 -->
    <div class="card" style="padding:16px;margin-top:14px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">已导出文件</div>
      <template v-if="history.length">
        <div v-for="h in history" :key="h.id" class="table-row">
          <span style="font-size:18px">{{ typeIcon(h.type) }}</span>
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
import { computed, onMounted, ref } from 'vue'
import { useTimelineStore } from '../stores/timeline'
import { useUiStore } from '../stores/ui'
import { WEEK_CN, fmtDay } from '../constants'
import Modal from '../components/Modal.vue'

const tl = useTimelineStore()
const ui = useUiStore()

const categories = ref([])
const pickedCats = ref([])
const range = ref('all')
const fromDay = ref('')
const toDay = ref('')
const busy = ref(null)
const history = ref([])

const previewShow = ref(false)
const preview = ref(null)
const previewType = ref(null)

const RANGES = [
  { key: 'all', label: '全部' },
  { key: 'year', label: '今年' },
  { key: 'month', label: '本月' },
  { key: 'd30', label: '近 30 天' },
  { key: 'custom', label: '自定义' }
]

const catNames = computed(() => {
  if (!pickedCats.value.length) return ''
  const names = categories.value
    .filter((c) => pickedCats.value.includes(c.id))
    .map((c) => c.name)
  return '分类：' + names.join('、')
})

function setRange(key) {
  range.value = key
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  if (key === 'all') {
    fromDay.value = ''
    toDay.value = ''
  } else if (key === 'year') {
    fromDay.value = `${y}-01-01`
    toDay.value = `${y}-12-31`
  } else if (key === 'month') {
    fromDay.value = `${y}-${String(m).padStart(2, '0')}-01`
    toDay.value = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`
  } else if (key === 'd30') {
    const d = new Date(now)
    d.setDate(d.getDate() - 29)
    fromDay.value = fmtDay(d)
    toDay.value = fmtDay(now)
  }
  /* custom：保留/让用户编辑现有日期 */
}

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
function typeIcon(t) {
  return { pdf: '📄', word: '📝', html: '🌐', image: '🖼️' }[t] || '📄'
}

/** IPC 参数必须是普通对象/数组：Vue 响应式 Proxy 无法被 structured clone */
function buildOpts() {
  return {
    categoryIds: Array.from(pickedCats.value, Number),
    fromDay: fromDay.value || null,
    toDay: toDay.value || null
  }
}

async function loadHistory() {
  history.value = await window.api.export.history()
}

async function openPreview(type) {
  if (busy.value) return
  if (fromDay.value && toDay.value && fromDay.value > toDay.value) {
    return ui.showToast('起始日期不能晚于结束日期')
  }
  const r = await window.api.export.preview(buildOpts())
  if (!r.count) return ui.showToast('没有符合条件的日记，请调整筛选范围')
  preview.value = r
  previewType.value = type
  previewShow.value = true
}

function onPreviewAction(b) {
  if (b.cls === 'primary') {
    previewShow.value = false
    run(previewType.value)
  } else {
    previewShow.value = false
  }
}

async function run(type) {
  if (busy.value) return
  busy.value = type
  ui.showToast(type === 'pdf' ? '正在生成 PDF…' : type === 'word' ? '正在生成 Word…' : '正在生成 HTML…')
  try {
    const r = await window.api.export.run(type, buildOpts())
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
/* 导出预览 */
.pv-summary{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12.5px;color:var(--text-secondary);
  padding-bottom:10px;border-bottom:1px dashed var(--line);}
.pv-summary b{color:var(--accent);font-size:14px;}
.pv-list{max-height:300px;overflow:auto;margin-top:8px;}
.pv-item{display:flex;gap:8px;align-items:baseline;font-size:12.5px;padding:5px 2px;border-radius:6px;}
.pv-item:nth-child(odd){background:var(--bg);}
.pv-item .d{flex:none;color:var(--text-secondary);}
.pv-item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-main);}
.pv-item .m{flex:none;color:var(--text-secondary);font-size:11.5px;}
</style>
