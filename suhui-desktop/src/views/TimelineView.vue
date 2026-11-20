<template>
  <div class="tl-wrap">
    <!-- 左：列表 -->
    <div class="tl-list">
      <div class="tools">
        <div class="seg"><button :class="{ on: !tl.filterCat }" @click="tl.setFilter(tl.filterCat)">全部</button></div>
        <div class="chip-row" style="flex:1">
          <span
            v-for="c in tl.categories"
            :key="c.id"
            class="chip"
            :class="{ on: tl.filterCat === c.id }"
            @click="tl.setFilter(c.id)"
          ><i class="cat-dot" :style="{ background: c.color }"></i>{{ c.name }}</span>
        </div>
        <button class="tool-btn" title="管理分类" style="font-size:13px" @click="router.push('/categories')">⚙</button>
      </div>
      <div class="tl-scroll">
        <template v-if="tl.groups.length">
          <template v-for="g in tl.groups" :key="g.ym">
            <div class="ym-head">
              <span>{{ ymLabel(g.ym) }}</span><span>{{ g.items.length }} 篇</span>
            </div>
            <div
              v-for="e in g.items"
              :key="e.id"
              class="tl-item"
              :class="{ sel: e.id === tl.selectedId }"
              @click="tl.select(e.id)"
            >
              <div class="t1">
                <span class="d">{{ Number(e.day.slice(8, 10)) }}</span>
                <span class="w">{{ WEEK_CN[e.weekday] }}</span>
                <span class="time">{{ e.occurred_at.slice(11, 16) }}<template v-if="e.media_count"> · 🖼️{{ e.media_count }}</template></span>
              </div>
              <div class="t2" v-html="hl(e.title || preview(e))"></div>
              <div class="t3">
                <span>{{ weatherOf(e.weather).icon }} {{ weatherOf(e.weather).name }}</span>
                <span v-if="e.category_name">{{ e.category_name }}</span>
                <span v-for="t in e.tags" :key="t">#{{ t }}</span>
              </div>
            </div>
          </template>
        </template>
        <div v-else class="empty" style="padding:40px 10px;">
          <span class="big">🍃</span>{{ tl.searchQ.trim() ? '没有匹配的日记' : (tl.filterCat ? '该分类还没有日记' : '还没有日记，去写下第一篇吧') }}
        </div>
      </div>
    </div>

    <!-- 右：阅读 -->
    <div class="reader">
      <template v-if="readerEntry">
        <div class="bar">
          <button class="tool-btn" :disabled="tl.idx <= 0" title="上一篇（更新）" @click="step(-1)">↑</button>
          <button class="tool-btn" :disabled="tl.idx >= tl.list.length - 1" title="下一篇（更旧）" @click="step(1)">↓</button>
          <span class="pos">{{ tl.idx + 1 }} / {{ tl.list.length }}</span>
          <span class="sp" style="flex:1"></span>
          <button class="tool-btn" title="编辑" @click="edit">✏️</button>
          <button class="tool-btn" title="删除" @click="del">🗑️</button>
        </div>
        <div class="paper" :class="app.night ? 'paper-5' : (readerEntry.background || 'paper-1')">
          <div class="meta">
            <span>{{ dateLabel }}</span>
            <span>{{ weatherOf(readerEntry.weather).icon }} {{ weatherOf(readerEntry.weather).name }}</span>
            <span v-if="readerEntry.address">📍 {{ readerEntry.address }}</span>
            <span v-if="readerEntry.mood != null">{{ moodOf(readerEntry.mood) }}</span>
          </div>
          <h1>{{ readerEntry.title || '（无标题）' }}</h1>
          <div class="body" v-html="hl(readerEntry.content)"></div>
          <!-- 朋友圈式图片网格 -->
          <div v-if="tl.reader.media.length" class="r-imgs">
            <div
              v-for="(m, i) in tl.reader.media"
              :key="m.id"
              @click="lbIndex = i; lbShow = true"
            ><img :src="`media://${m.file_name}`" alt=""></div>
          </div>
          <div class="meta" style="margin-top:24px;font-size:11.5px;">
            <span>分类：{{ catName }}</span>
            <span
              v-for="t in tl.reader.tags"
              :key="t.id"
              class="tag-link"
              title="按标签搜索"
              @click="searchTag(t.name)"
            >#{{ t.name }}</span>
            <span>已更新 {{ readerEntry.rev }} 次</span>
          </div>
        </div>
      </template>
      <div v-else class="empty"><span class="big">📖</span>选择一篇日记开始阅读</div>

      <Lightbox
        :visible="lbShow"
        :media="tl.reader?.media || []"
        :index="lbIndex"
        @close="lbShow = false"
        @move="lbMove"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '../stores/timeline'
import { useUiStore } from '../stores/ui'
import { useAppStore } from '../stores/app'
import { WEEK_CN, weatherOf, moodOf } from '../constants'
import Lightbox from '../components/Lightbox.vue'

const router = useRouter()
const tl = useTimelineStore()
const ui = useUiStore()
const app = useAppStore()

const lbShow = ref(false)
const lbIndex = ref(0)

const readerEntry = computed(() => tl.reader?.entry || null)
const catName = computed(() => {
  const id = readerEntry.value?.category_id
  return tl.categories.find((c) => c.id === id)?.name || '未分类'
})
const dateLabel = computed(() => {
  const e = readerEntry.value
  if (!e) return ''
  const d = new Date(e.occurred_at)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEK_CN[e.weekday]} ${p(d.getHours())}:${p(d.getMinutes())}`
})

function ymLabel(ym) {
  const [y, m] = ym.split('-')
  return `${y}年 ${Number(m)}月`
}
function preview(e) {
  const first = (e.content || '').split('\n').map((s) => s.trim()).find(Boolean)
  return first ? first.slice(0, 20) : '（无标题）'
}

/* 搜索高亮（Phase 3）：先按原文切分，再分段转义，避免实体拆词 */
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
function hl(text) {
  const t = String(text ?? '')
  const q = tl.searchQ.trim()
  if (!q) return escHtml(t)
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(t))) {
    out += escHtml(t.slice(last, m.index)) + '<span class="hit">' + escHtml(m[0]) + '</span>'
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  return out + escHtml(t.slice(last))
}

function searchTag(name) {
  tl.setSearch(name)
}

onMounted(async () => {
  await tl.loadCategories()
  await tl.load()
  // 编辑器完成后的预选 / 默认选第一篇
  const target = tl.pendingSelectId && tl.list.some((e) => e.id === tl.pendingSelectId)
    ? tl.pendingSelectId
    : tl.list[0]?.id
  tl.pendingSelectId = null
  if (target) await tl.select(target)
  else { tl.selectedId = null; tl.reader = null }
  app.loadStats()
})

function step(d) {
  const end = tl.step(d)
  if (end) ui.showToast(end)
}
function edit() {
  router.push({ path: '/write', query: { id: tl.selectedId } })
}
async function del() {
  const okAsk = await ui.askConfirm({
    title: '删除日记',
    body: '确定删除日记？删除后可在回收站恢复',
    confirmText: '删除',
    danger: true
  })
  if (!okAsk) return
  const id = tl.selectedId
  const ok = await tl.remove(id)
  if (ok) ui.showToast('已移入回收站')
}
function lbMove(d) {
  const n = tl.reader.media.length
  lbIndex.value = (lbIndex.value + d + n) % n
}
</script>

<style>
.reader .bar .pos{font-size:12px;color:var(--text-secondary);margin-left:4px;}
.reader .bar .tool-btn:disabled{opacity:.35;cursor:default;}
.reader .bar .tool-btn:disabled:hover{background:none;}
.r-imgs div{overflow:hidden;cursor:zoom-in;background:var(--line);}
.r-imgs img{width:100%;height:100%;object-fit:cover;display:block;transition:.15s;}
.r-imgs img:hover{transform:scale(1.03);}
.tag-link{cursor:pointer;color:var(--accent);}
.tag-link:hover{text-decoration:underline;}
</style>
