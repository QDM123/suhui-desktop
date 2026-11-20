<template>
  <div class="tl-wrap">
    <!-- 左：列表 -->
    <div class="tl-list">
      <div class="tools">
        <div class="seg"><button :class="{ on: !tl.filterCat }" @click="tl.setFilter(tl.filterCat)">全部</button></div>
        <!-- 分类：按使用频率取前 4，··· 展开全部 -->
        <div class="cat-bar">
          <span
            v-for="c in topCats"
            :key="c.id"
            class="chip"
            :class="{ on: tl.filterCat === c.id }"
            :title="`${c.name} · ${c.entry_count} 篇`"
            @click="tl.setFilter(c.id)"
          ><i class="cat-dot" :style="{ background: c.color }"></i>{{ c.name }}</span>
          <button v-if="sortedCats.length > 4" class="cat-more" title="全部分类" @click="showCats = true">···</button>
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
          <button class="tool-btn" title="生成长图" @click="makeLongImage">🖼️</button>
        </div>
        <div
          class="paper"
          :class="paperInfo.cls"
          :style="paperInfo.style"
        >
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
            <span v-if="tl.reader.media.length">🖼️ {{ tl.reader.media.length }} 张</span>
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

      <!-- 全部分类（···） -->
      <Modal :visible="showCats" title="全部分类（按常用排序）" :buttons="[]" @close="showCats = false">
        <div class="chip-row chip-lg" style="justify-content:center">
          <span
            v-for="c in sortedCats"
            :key="c.id"
            class="chip"
            :class="{ on: tl.filterCat === c.id }"
            @click="tl.setFilter(c.id); showCats = false"
          ><i class="cat-dot" :style="{ background: c.color }"></i>{{ c.name }}<em> {{ c.entry_count }}</em></span>
        </div>
        <div class="modal-ok">
          <button class="btn sm ghost" @click="showCats = false; router.push('/categories')">管理分类</button>
        </div>
      </Modal>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '../stores/timeline'
import { useUiStore } from '../stores/ui'
import { useAppStore } from '../stores/app'
import { usePaperStore } from '../stores/papers'
import { WEEK_CN, weatherOf, moodOf } from '../constants'
import Lightbox from '../components/Lightbox.vue'
import Modal from '../components/Modal.vue'

const router = useRouter()
const tl = useTimelineStore()
const ui = useUiStore()
const app = useAppStore()
const ps = usePaperStore()

const lbShow = ref(false)
const lbIndex = ref(0)
const showCats = ref(false)

/* 分类排序：常用（日记多）在前，同数按管理顺序；横排最多 4 个（当前选中始终可见） */
const sortedCats = computed(() =>
  [...tl.categories].sort((a, b) => (b.entry_count - a.entry_count) || (a.sort - b.sort))
)
const topCats = computed(() => {
  const top = sortedCats.value.slice(0, 4)
  if (tl.filterCat && !top.some((c) => c.id === tl.filterCat)) {
    const active = sortedCats.value.find((c) => c.id === tl.filterCat)
    if (active) top[top.length - 1] = active
  }
  return top
})

const readerEntry = computed(() => tl.reader?.entry || null)
/* 信纸解析与编辑器同规则：夜间内置→paper-5，自定义保持 */
const paperInfo = computed(() => {
  const bg = readerEntry.value?.background
  if (app.night && !(bg || '').startsWith('custom:')) {
    return { cls: 'paper-5', style: null }
  }
  return ps.resolve(bg)
})
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
  ps.load()
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

const longBusy = ref(false)
async function makeLongImage() {
  if (longBusy.value) return
  longBusy.value = true
  ui.showToast('正在生成长图…')
  try {
    const r = await window.api.export.longImage(tl.selectedId)
    if (r.canceled) ui.showToast('已取消')
    else if (r.ok) ui.showToast('长图已生成')
    else ui.showToast(r.error || '生成失败')
  } catch (e) {
    ui.showToast('生成失败：' + (e?.message || e))
  } finally {
    longBusy.value = false
  }
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
/* 分类横排（淘宝式） */
.cat-bar{flex:1;display:flex;gap:7px;align-items:center;overflow:hidden;min-width:0;}
.cat-bar .chip{flex:none;}
.cat-more{
  border:1px solid var(--line);background:var(--card);color:var(--text-secondary);
  border-radius:999px;padding:5px 12px;font-size:13px;cursor:pointer;flex:none;letter-spacing:1px;
}
.cat-more:hover{border-color:var(--accent);color:var(--accent);}
.chip-lg .chip{padding:9px 18px;font-size:13.5px;}
.chip-lg .chip em{font-style:normal;font-size:11px;color:var(--text-secondary);margin-left:2px;}
.modal-ok{text-align:center;margin-top:16px;}
</style>
