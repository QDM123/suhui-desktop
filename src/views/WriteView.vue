<template>
  <div class="ed-wrap">
    <!-- 工具栏 -->
    <div class="ed-toolbar">
      <button class="tool-btn big" title="返回" @click="leave">‹</button>
      <span class="ed-title-label">{{ ed.isNew ? '写日记' : '编辑日记' }}</span>
      <span class="save-state" :class="ed.saveState" :title="ed.saveError || ''" @click="ed.saveState === 'error' && ed.flush()">
        <template v-if="ed.saveState === 'saving'">正在保存…</template>
        <template v-else-if="ed.saveState === 'saved'">已保存 {{ savedClock }}</template>
        <template v-else-if="ed.saveState === 'error'">⚠ 保存失败，点击重试</template>
        <template v-else></template>
      </span>
      <span class="sp"></span>
      <button class="tool-btn big" title="自动保存并前往时间轴" @click="leave">📖</button>
      <button class="btn" @click="done">完成</button>
    </div>

    <!-- 信息栏：上行 日期时间；下行 元信息按钮（放大） -->
    <div class="ed-info">
      <div class="row">
        <label class="info-field">
          <span>📅</span>
          <input type="date" v-model="dayInput" :max="todayStr" @change="onDayChange">
        </label>
        <label class="info-field">
          <span>⏰</span>
          <input type="time" v-model="timeInput" @change="ed.setField('occurredTime', timeInput)">
        </label>
        <span class="ed-hint">🚫 未来不可写</span>
        <span class="grow"></span>
        <button class="btn sm ghost" :disabled="autoBusy" title="按当前位置自动填地址与天气" @click="applyAuto(false)">
          {{ autoBusy ? '定位中…' : '📍 自动填充' }}
        </button>
      </div>
      <div class="row">
        <button class="info-btn" @click="show.weather = true">{{ weatherIcon }} {{ weatherName }}</button>
        <button class="info-btn" @click="show.mood = true">{{ moodIcon }} 心情</button>
        <button class="info-btn" @click="show.category = true">
          <i class="cat-dot" :style="{ background: catColor }"></i>{{ catName }}
        </button>
        <button class="info-btn" @click="openTags"># {{ ed.tags.length ? ed.tags.join(' ') : '标签' }}</button>
        <button class="info-btn addr" :title="ed.fields.address" @click="openAddress">📍 {{ ed.fields.address || '所在位置' }}</button>
        <span class="grow"></span>
        <button class="info-btn fmt" title="有序列表（Ctrl+Shift+O）" @click="toggleList('ol')">1.</button>
        <button class="info-btn fmt" title="无序列表（Ctrl+Shift+U）" @click="toggleList('ul')">•</button>
        <button class="info-btn fmt" title="分隔线（Ctrl+Shift+H）" @click="insertDivider">─</button>
        <button class="info-btn fmt" title="插入时间戳（Ctrl+Shift+T）" @click="insertTimestamp">⏱</button>
        <button class="info-btn" title="添加图片（可多选）" @click="addFiles">🖼️ 图片</button>
      </div>
    </div>

    <!-- 信笺纸：标题 + 正文 -->
    <div class="ed-paper" :class="paperInfo.cls" :style="paperInfo.style" @paste="onPaste">
      <input class="ed-title" placeholder="标题（可留空）" :value="ed.fields.title"
             @input="ed.setField('title', $event.target.value)">

      <textarea ref="contentRef" class="ed-content" placeholder="此刻，想说点什么…（支持 Ctrl+V 粘贴图片）"
                :value="ed.fields.content"
                @input="ed.setField('content', $event.target.value)"></textarea>

      <!-- 信笺选择：默认 5 款 + 全部 -->
      <div class="paper-pick">
        <div
          v-for="p in pickList"
          :key="p.value"
          class="paper-thumb"
          :class="[p.cls, { on: ed.fields.background === p.value }]"
          :style="p.style"
          :title="p.name"
          @click="ed.setField('background', p.value)"
        ></div>
        <div class="paper-thumb all" title="全部信纸" @click="showPapers = true">⋯</div>
      </div>
    </div>

    <!-- 图片墙：信纸下方独立一行，横向排开 -->
    <div class="ed-photos-bar">
      <div v-for="(m, i) in ed.media" :key="m.id" class="ed-photo" :title="m.orig_name"
           @click="lbIndex = i; lbShow = true">
        <img :src="`media://${m.file_name}`" alt="">
        <button class="ed-photo-del" title="移除照片" @click.stop="removePhoto(m)">✕</button>
      </div>
      <div class="ed-photo add" title="添加图片（可多选，原图保存）" @click="addFiles">
        <span>＋</span><i>添加图片</i>
      </div>
    </div>

    <!-- 编辑器内图片预览（缩放/旋转） -->
    <Lightbox
      :visible="lbShow"
      :media="ed.media"
      :index="lbIndex"
      @close="lbShow = false"
      @move="lbMove"
    />

    <!-- 全部信纸 -->
    <Modal :visible="showPapers" title="全部信纸" @close="showPapers = false">
      <div class="paper-grid">
        <div
          v-for="opt in ps.options"
          :key="opt.value"
          class="pg-item"
          :class="{ on: ed.fields.background === opt.value }"
          @click="ed.setField('background', opt.value); showPapers = false"
        >
          <div class="pg-thumb" :class="ps.resolve(opt.value).cls" :style="ps.resolve(opt.value).style"></div>
          <span class="pg-name">{{ opt.custom ? opt.name : '' }}</span>
        </div>
      </div>
    </Modal>

    <!-- 天气 -->
    <Modal :visible="show.weather" title="今天天气" :buttons="[]" @close="show.weather = false">
      <div class="chip-row" style="justify-content:center">
        <span v-for="w in WEATHERS" :key="w.id" class="chip" :class="{ on: ed.fields.weather === w.id }"
              @click="ed.setField('weather', w.id); show.weather = false">{{ w.icon }} {{ w.name }}</span>
      </div>
    </Modal>

    <!-- 心情 -->
    <Modal :visible="show.mood" title="此刻心情" :buttons="[]" @close="show.mood = false">
      <div class="mood-row">
        <span v-for="(m, i) in MOODS" :key="i" class="mood-item" :class="{ on: ed.fields.mood === i }"
              @click="ed.setField('mood', i); show.mood = false">{{ m }}</span>
        <span class="mood-item none" :class="{ on: ed.fields.mood == null }"
              @click="ed.setField('mood', null); show.mood = false">无</span>
      </div>
    </Modal>

    <!-- 分类（单选，点选即生效并关闭） -->
    <Modal :visible="show.category" title="选择分类（单选）" :buttons="[]" @close="show.category = false">
      <div class="chip-row chip-lg" style="justify-content:center">
        <span v-for="c in categories" :key="c.id" class="chip" :class="{ on: ed.fields.category_id === c.id }"
              @click="ed.setField('category_id', c.id); show.category = false">
          <i class="cat-dot" :style="{ background: c.color }"></i>{{ c.name }}<em v-if="c.entry_count"> {{ c.entry_count }}</em>
        </span>
      </div>
    </Modal>

    <!-- 标签（多选 + 新建） -->
    <Modal :visible="show.tags" title="选择标签（多选）" :buttons="[]" @close="show.tags = false">
      <div class="chip-row" style="justify-content:center">
        <span v-for="t in allTags" :key="t.id" class="chip" :class="{ on: draftTags.includes(t.name) }"
              @click="toggleDraftTag(t.name)">#{{ t.name }}</span>
      </div>
      <div class="tag-new">
        <input v-model="newTag" placeholder="新建标签" @keydown.enter="addNewTag">
        <button class="btn sm plain" @click="addNewTag">添加</button>
      </div>
      <div class="modal-ok"><button class="btn sm" @click="applyTags">确定</button></div>
    </Modal>

    <!-- 地址 -->
    <Modal :visible="show.address" title="所在位置" :buttons="[]" @close="show.address = false">
      <input class="addr-input" v-model="draftAddress" placeholder="自由输入地点" @keydown.enter="applyAddress">
      <template v-if="recentAddresses.length">
        <div class="addr-recent">最近使用：</div>
        <div class="chip-row" style="justify-content:center">
          <span v-for="a in recentAddresses" :key="a" class="chip"
                @click="draftAddress = a">{{ a }}</span>
        </div>
      </template>
      <div class="modal-ok"><button class="btn sm" @click="applyAddress">确定</button></div>
    </Modal>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEditorStore } from '../stores/editor'
import { useUiStore } from '../stores/ui'
import { useAppStore } from '../stores/app'
import { useTimelineStore } from '../stores/timeline'
import { WEATHERS, MOODS, BUILTIN_PAPERS, weatherOf, moodOf, fmtDay, fmtClock } from '../constants'
import { getAutoInfo } from '../autofill'
import { usePaperStore } from '../stores/papers'
import { matchShortcut } from '../shortcuts'
import Modal from '../components/Modal.vue'
import Lightbox from '../components/Lightbox.vue'

const route = useRoute()
const router = useRouter()
const ed = useEditorStore()
const ui = useUiStore()
const app = useAppStore()
const tl = useTimelineStore()
const ps = usePaperStore()

const show = reactive({ weather: false, mood: false, category: false, tags: false, address: false })
const showPapers = ref(false)
const categories = ref([])
const allTags = ref([])
const recentAddresses = ref([])
const draftTags = ref([])
const draftAddress = ref('')
const newTag = ref('')
const dayInput = ref(fmtDay())
const timeInput = ref('00:00')

const autoBusy = ref(false)
/* 自动填充只覆盖“仍是打开时默认值”的字段，用户手填不覆盖 */
const defaultsAtOpen = ref({ address: '', weather: 1 })

const contentRef = ref(null)

/* ---------- 快捷键与排版工具（列表 / 分隔线 / 时间戳） ---------- */

/** 更新正文并恢复光标到指定位置 */
function applyContent(newVal, selStart, selEnd) {
  ed.setField('content', newVal)
  nextTick(() => {
    if (!contentRef.value) return
    contentRef.value.focus()
    contentRef.value.setSelectionRange(selStart, selEnd)
  })
}

/** 行级列表切换：作用于光标所在行或选中的多行；重复按可取消/互转（标记为 Markdown 兼容语法） */
function toggleList(kind) {
  const ta = contentRef.value
  const val = ed.fields.content || ''
  const start = ta ? ta.selectionStart : val.length
  const end = ta ? ta.selectionEnd : val.length
  const ls = val.lastIndexOf('\n', Math.max(start - 1, 0)) + 1
  let le = val.indexOf('\n', end)
  if (le === -1) le = val.length
  const lines = val.slice(ls, le).split('\n')
  const olRe = /^\d+\.\s/
  const ulRe = /^-\s/
  const allOl = lines.every((l) => olRe.test(l))
  const allUl = lines.every((l) => ulRe.test(l))
  const strip = (l) => l.replace(olRe, '').replace(ulRe, '')
  const next = kind === 'ol'
    ? (allOl ? lines.map((l) => l.replace(olRe, ''))
             : lines.map((l, i) => `${i + 1}. ${strip(l)}`))
    : (allUl ? lines.map((l) => l.replace(ulRe, ''))
             : lines.map((l) => `- ${strip(l)}`))
  const newBlock = next.join('\n')
  applyContent(val.slice(0, ls) + newBlock + val.slice(le), ls, ls + newBlock.length)
}

/** 光标处插入分隔线（前后自动补换行） */
function insertDivider() {
  const ta = contentRef.value
  const val = ed.fields.content || ''
  const at = ta ? ta.selectionStart : val.length
  const before = val.slice(0, at)
  const pre = before && !before.endsWith('\n') ? '\n' : ''
  const text = `${pre}———————\n`
  applyContent(before + text + val.slice(at), at + text.length, at + text.length)
}

/** 光标处插入当前日期时间 */
function insertTimestamp() {
  const ta = contentRef.value
  const val = ed.fields.content || ''
  const at = ta ? ta.selectionStart : val.length
  const d = new Date()
  const text = `${fmtDay(d)} ${fmtClock(d)} `
  applyContent(val.slice(0, at) + text + val.slice(at), at + text.length, at + text.length)
}

function onKeydown(e) {
  /* 从快捷键注册表匹配写作页/正文作用域（键位与说明页同源） */
  const sc = matchShortcut(e, ['write', 'content'])
  if (!sc) return
  /* Esc：关闭当前打开的弹窗（信纸 / 天气 / 心情 / 分类 / 标签 / 位置） */
  if (sc.id === 'close-modal') {
    for (const k of Object.keys(show)) {
      if (show[k]) { show[k] = false; e.preventDefault(); return }
    }
    if (showPapers.value) { showPapers.value = false; e.preventDefault() }
    return
  }
  e.preventDefault()
  if (sc.id === 'save-exit') done()
  else if (sc.id === 'ol') toggleList('ol')
  else if (sc.id === 'ul') toggleList('ul')
  else if (sc.id === 'divider') insertDivider()
  else if (sc.id === 'timestamp') insertTimestamp()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const lbShow = ref(false)
const lbIndex = ref(0)

const todayStr = fmtDay()
const weatherIcon = computed(() => weatherOf(ed.fields.weather).icon)
const weatherName = computed(() => weatherOf(ed.fields.weather).name)
const moodIcon = computed(() => (ed.fields.mood == null ? '😶' : moodOf(ed.fields.mood)))
/* 信纸解析：夜间内置→paper-5；自定义信纸保持用户选择；
   forText=true → 图案交给正文层画（32px 节奏，横线与文字对齐且随滚动） */
const paperInfo = computed(() => {
  const bg = ed.fields.background
  if (app.night && !(bg || '').startsWith('custom:')) {
    return { cls: 'paper-5', style: null }
  }
  return ps.resolve(bg, true)
})
/* 默认展示 5 款：当前选中优先 + 内置补足 */
const pickList = computed(() => {
  const bg = ed.fields.background
  const list = []
  const push = (value, name) => {
    if (list.length >= 5 || list.some((x) => x.value === value)) return
    const r = ps.resolve(value)
    list.push({ value, name: name || value, cls: r.cls, style: r.style })
  }
  if (bg) push(bg)
  for (const p of BUILTIN_PAPERS) {
    if (list.length >= 5) break
    push(p)
  }
  return list
})
const savedClock = computed(() => (ed.savedAt ? fmtClock(ed.savedAt) : ''))
const catName = computed(() => {
  const c = categories.value.find((x) => x.id === ed.fields.category_id)
  return c?.name || '分类'
})
const catColor = computed(() => {
  const c = categories.value.find((x) => x.id === ed.fields.category_id)
  return c?.color || 'var(--line)'
})

onMounted(async () => {
  if (route.query.id) {
    const data = await window.api.diary.get(String(route.query.id))
    if (data) ed.open(data)
    else { ui.showToast('日记不存在'); ed.open() }
  } else {
    ed.open(null, route.query.date ? String(route.query.date) : null)
  }
  dayInput.value = ed.fields.occurredDay
  timeInput.value = ed.fields.occurredTime
  draftTags.value = [...ed.tags]
  defaultsAtOpen.value = { address: ed.fields.address, weather: ed.fields.weather }
  categories.value = await window.api.category.list()
  ps.load()
  if (ed.isNew) applyAuto(true) // 新日记静默自动填充，失败不打扰
})

async function applyAuto(silent) {
  if (autoBusy.value) return
  autoBusy.value = true
  try {
    const info = await getAutoInfo()
    if (info.failed) {
      if (!silent) ui.showToast(info.reason || '定位失败，请手动填写')
      return
    }
    if (info.address && ed.fields.address === defaultsAtOpen.value.address) {
      ed.setField('address', info.address)
    }
    if (info.weatherId && ed.fields.weather === defaultsAtOpen.value.weather) {
      ed.setField('weather', info.weatherId)
    }
    const tip = info.precision === 'city'
      ? '已按 IP 城市自动填充（城市级精度；开启 Windows 定位可获得精确位置）'
      : '已按当前位置自动填充'
    ui.showToast(tip)
  } finally {
    autoBusy.value = false
  }
}

function lbMove(d) {
  const n = ed.media.length
  if (!n) return
  lbIndex.value = (lbIndex.value + d + n) % n
}

function onDayChange() {
  if (dayInput.value > todayStr) {
    dayInput.value = ed.fields.occurredDay
    ui.showToast('未来不可写哦')
    return
  }
  ed.setField('occurredDay', dayInput.value)
}

function openTags() {
  draftTags.value = [...ed.tags]
  newTag.value = ''
  window.api.tag.listAll().then((r) => { allTags.value = r })
  show.tags = true
}

function toggleDraftTag(name) {
  const i = draftTags.value.indexOf(name)
  if (i >= 0) draftTags.value.splice(i, 1)
  else draftTags.value.push(name)
}

function addNewTag() {
  const name = newTag.value.trim().replace(/^#/, '')
  if (!name) return
  if (!draftTags.value.includes(name)) draftTags.value.push(name)
  if (!allTags.value.some((t) => t.name === name)) {
    allTags.value.push({ id: -Date.now(), name, used: 0 })
  }
  newTag.value = ''
}

async function applyTags() {
  show.tags = false
  try {
    await ed.applyTags(draftTags.value)
    ui.showToast('标签已保存')
  } catch (e) {
    ui.showToast('标签保存失败：' + (e?.message || e))
  }
}

function openAddress() {
  draftAddress.value = ed.fields.address
  window.api.app.recentAddresses().then((r) => { recentAddresses.value = r })
  show.address = true
}

async function applyAddress() {
  show.address = false
  ed.setField('address', draftAddress.value.trim())
}

async function addFiles() {
  try {
    const r = await ed.pickAndAddFiles()
    if (r.skipped?.length) ui.showToast(`已跳过 ${r.skipped.length} 个非图片文件`)
  } catch (e) {
    ui.showToast('添加图片失败：' + (e?.message || e))
  }
}

async function removePhoto(m) {
  const r = await ed.removeMedia(m.id)
  if (!r.ok) ui.showToast('删除失败（文件可能被占用）')
}

async function onPaste(e) {
  const items = Array.from(e.clipboardData?.items || [])
  const files = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean)
  if (!files.length) return
  e.preventDefault()
  for (const f of files) {
    try { await ed.addBufferFile(f) } catch { ui.showToast('粘贴图片失败') }
  }
}

async function leave() {
  router.push('/timeline') // 守卫在 router 层统一 flush（src/main.js）
}

async function done() {
  const ok = await ed.flush()
  if (!ok) {
    const retry = await ui.askConfirm({ title: '保存失败', body: ed.saveError + '\n\n重试保存并离开？', confirmText: '重试并离开' })
    if (!retry) return
    const ok2 = await ed.flush()
    if (!ok2) { ui.showToast('仍未保存成功，请检查后重试'); return }
  }
  app.loadStats()
  if (ed.entryId) tl.pendingSelectId = ed.entryId
  router.push('/timeline')
}
</script>

<style>
.ed-title-label{font-size:14px;font-weight:700;margin-left:2px;}
.info-btn.fmt{min-width:36px;justify-content:center;font-weight:700;padding-left:8px;padding-right:8px;}
.tool-btn.big{font-size:20px;padding:6px 12px;}
.save-state{font-size:11.5px;color:var(--text-secondary);cursor:default;min-width:110px;text-align:right;}
.save-state.saved{color:var(--accent);}
.save-state.error{color:var(--danger);font-weight:700;cursor:pointer;}

/* ---------- 信息栏 ---------- */
.ed-info{flex:none;background:var(--card);border-bottom:1px solid var(--line);padding:8px 14px;display:flex;flex-direction:column;gap:8px;}
.ed-info .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.ed-info .grow{flex:1;}
.ed-hint{font-size:11px;opacity:.7;color:var(--text-secondary);}
.info-field{
  display:inline-flex;align-items:center;gap:7px;background:var(--bg);
  border:1px solid var(--line);border-radius:9px;padding:6px 12px;font-size:13px;color:var(--text-secondary);
}
.info-field input{border:0;background:none;outline:none;font-size:13.5px;color:var(--text-main);}
.info-btn{
  display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);
  border-radius:9px;padding:8px 14px;font-size:13.5px;cursor:pointer;color:var(--text-main);transition:.12s;
  max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.info-btn:hover{border-color:var(--accent);color:var(--accent);}

/* ---------- 图片墙（信纸下方独立一行） ---------- */
.ed-photos-bar{
  flex:none;display:flex;gap:10px;align-items:stretch;
  padding:12px 46px 16px;overflow-x:auto;background:var(--bg);
  border-top:1px solid var(--line);
}
.ed-photos-bar::-webkit-scrollbar{height:6px;}
.ed-photos-bar::-webkit-scrollbar-thumb{background:var(--line);border-radius:3px;}
.ed-photo{
  position:relative;width:118px;aspect-ratio:4/3;flex:none;
  border-radius:8px;overflow:hidden;background:var(--line);cursor:zoom-in;
}
.ed-photo img{width:100%;height:100%;object-fit:cover;display:block;transition:.15s;}
.ed-photo:hover img{transform:scale(1.04);}
.ed-photo.add{
  border:1.5px dashed var(--line);background:transparent;color:var(--text-secondary);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  cursor:pointer;user-select:none;transition:.15s;overflow:hidden;
}
.ed-photo.add span{font-size:26px;line-height:1;font-weight:300;}
.ed-photo.add i{font-style:normal;font-size:11px;letter-spacing:1px;}
.ed-photo.add:hover{border-color:var(--accent);color:var(--accent);}
.ed-photo-del{
  position:absolute;top:4px;right:4px;width:20px;height:20px;border:0;border-radius:50%;
  background:rgba(20,25,35,.55);color:#fff;font-size:11px;cursor:pointer;line-height:20px;padding:0;
}
.ed-photo-del:hover{background:var(--danger);}

/* ---------- 弹窗 ---------- */
.mood-row{font-size:28px;letter-spacing:10px;text-align:center;}
.mood-item{cursor:pointer;opacity:.35;transition:.15s;display:inline-block;}
.mood-item.on{opacity:1;transform:scale(1.12);}
.mood-item.none{font-size:14px;vertical-align:middle;color:var(--text-secondary);}
.tag-new{display:flex;gap:8px;justify-content:center;margin-top:14px;}
.tag-new input{
  border:1px solid var(--line);border-radius:6px;padding:5px 10px;font-size:12.5px;
  background:var(--card);color:var(--text-main);outline:none;width:160px;
}
.modal-ok{text-align:center;margin-top:16px;}
.chip-lg .chip{padding:9px 18px;font-size:13.5px;}
.chip-lg .chip em{font-style:normal;font-size:11px;color:var(--text-secondary);margin-left:2px;}
.addr-input{
  width:100%;border:1px solid var(--line);border-radius:6px;padding:7px 10px;font-size:13px;
  background:var(--card);color:var(--text-main);outline:none;
}
.addr-recent{font-size:11.5px;color:var(--text-secondary);margin-top:14px;}
</style>
