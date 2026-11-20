<template>
  <div class="ed-wrap">
    <!-- 工具栏 -->
    <div class="ed-toolbar">
      <button class="tool-btn" title="返回" @click="leave">‹</button>
      <span class="ed-title-label">{{ ed.isNew ? '写日记' : '编辑日记' }}</span>
      <span class="sp"></span>
      <span class="save-state" :class="ed.saveState" :title="ed.saveError || ''" @click="ed.saveState === 'error' && ed.flush()">
        <template v-if="ed.saveState === 'saving'">正在保存…</template>
        <template v-else-if="ed.saveState === 'saved'">已保存 {{ savedClock }}</template>
        <template v-else-if="ed.saveState === 'error'">⚠ 保存失败，点击重试</template>
        <template v-else></template>
      </span>
      <button class="tool-btn" title="此刻心情" @click="show.mood = true">{{ moodIcon }}</button>
      <button class="tool-btn" title="今天天气" @click="show.weather = true">{{ weatherIcon }}</button>
      <button class="tool-btn" title="所在位置" @click="openAddress">📍</button>
      <button class="tool-btn" title="分类（单选）" @click="show.category = true">🏷️</button>
      <button class="tool-btn" title="标签（多选）" @click="openTags">#</button>
      <button class="tool-btn" title="插入图片（也可直接 Ctrl+V 粘贴）" @click="addFiles">🖼️</button>
      <button class="btn sm" @click="done">完成</button>
    </div>

    <!-- 信笺纸 -->
    <div class="ed-paper" :class="paperClass" @paste="onPaste">
      <div class="ed-date">
        <input type="date" v-model="dayInput" :max="todayStr" @change="onDayChange">
        <input type="time" v-model="timeInput" @change="ed.setField('occurredTime', timeInput)">
        <span class="ed-hint">🚫 未来日期不可写 · 每日新增上限 {{ DAILY_LIMIT }} 篇</span>
        <span v-if="todayList.length" class="today-list">
          今日已写 {{ todayList.length }} 篇：
          <span
            v-for="t in todayList"
            :key="t.id"
            class="chip mini"
            :class="{ on: t.id === ed.entryId }"
            @click="switchTo(t.id)"
          >{{ t.time }} {{ t.title }}</span>
        </span>
      </div>

      <input class="ed-title" placeholder="标题（可留空）" :value="ed.fields.title"
             @input="ed.setField('title', $event.target.value)">

      <textarea class="ed-content" placeholder="此刻，想说点什么…（支持 Ctrl+V 粘贴图片）"
                :value="ed.fields.content"
                @input="ed.setField('content', $event.target.value)"></textarea>

      <!-- 照片网格（原图展示） -->
      <div v-if="ed.media.length" class="ed-photos">
        <div v-for="m in ed.media" :key="m.id" class="ed-photo" :title="m.orig_name">
          <img :src="`media://${m.file_name}`" alt="">
          <button class="ed-photo-del" title="移除照片" @click="removePhoto(m)">✕</button>
        </div>
      </div>

      <!-- 信笺选择 -->
      <div class="paper-pick">
        <div v-for="p in PAPERS" :key="p" class="paper-thumb" :class="[p, { on: ed.fields.background === p }]"
             @click="ed.setField('background', p)"></div>
      </div>
    </div>

    <!-- 天气 -->
    <Modal :visible="show.weather" title="今天天气" @close="show.weather = false">
      <div class="chip-row" style="justify-content:center">
        <span v-for="w in WEATHERS" :key="w.id" class="chip" :class="{ on: ed.fields.weather === w.id }"
              @click="ed.setField('weather', w.id); show.weather = false">{{ w.icon }} {{ w.name }}</span>
      </div>
    </Modal>

    <!-- 心情 -->
    <Modal :visible="show.mood" title="此刻心情" @close="show.mood = false">
      <div class="mood-row">
        <span v-for="(m, i) in MOODS" :key="i" class="mood-item" :class="{ on: ed.fields.mood === i }"
              @click="ed.setField('mood', i); show.mood = false">{{ m }}</span>
        <span class="mood-item none" :class="{ on: ed.fields.mood == null }"
              @click="ed.setField('mood', null); show.mood = false">无</span>
      </div>
    </Modal>

    <!-- 分类（单选） -->
    <Modal :visible="show.category" title="选择分类（单选）" @close="show.category = false">
      <div class="chip-row" style="justify-content:center">
        <span v-for="c in categories" :key="c.id" class="chip" :class="{ on: ed.fields.category_id === c.id }"
              @click="ed.setField('category_id', c.id); show.category = false">
          <i class="cat-dot" :style="{ background: c.color }"></i>{{ c.name }}
        </span>
      </div>
    </Modal>

    <!-- 标签（多选 + 新建） -->
    <Modal :visible="show.tags" title="选择标签（多选）" @close="show.tags = false">
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
    <Modal :visible="show.address" title="所在位置" @close="show.address = false">
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEditorStore } from '../stores/editor'
import { useUiStore } from '../stores/ui'
import { useAppStore } from '../stores/app'
import { useTimelineStore } from '../stores/timeline'
import { WEATHERS, MOODS, PAPERS, weatherOf, moodOf, fmtDay, fmtClock, DAILY_LIMIT } from '../constants'
import Modal from '../components/Modal.vue'

const route = useRoute()
const router = useRouter()
const ed = useEditorStore()
const ui = useUiStore()
const app = useAppStore()
const tl = useTimelineStore()

const show = reactive({ weather: false, mood: false, category: false, tags: false, address: false })
const categories = ref([])
const allTags = ref([])
const recentAddresses = ref([])
const todayList = ref([])
const draftTags = ref([])
const draftAddress = ref('')
const newTag = ref('')
const dayInput = ref(fmtDay())
const timeInput = ref('00:00')

const todayStr = fmtDay()
const weatherIcon = computed(() => weatherOf(ed.fields.weather).icon)
const moodIcon = computed(() => ed.fields.mood == null ? '😶' : moodOf(ed.fields.mood))
const paperClass = computed(() => (app.night ? 'paper-5' : ed.fields.background))
const savedClock = computed(() => (ed.savedAt ? fmtClock(ed.savedAt) : ''))

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
  await loadAll()
})

async function loadAll() {
  categories.value = await window.api.category.list()
  todayList.value = await window.api.diary.today()
}

watch(() => ed.entryId, () => { loadAll() })

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

async function switchTo(id) {
  if (ed.dirty) {
    const ok = await ed.flush()
    if (!ok) { ui.showToast('有修改保存失败，不能切换'); return }
  }
  const data = await window.api.diary.get(id)
  if (data) {
    ed.open(data)
    dayInput.value = ed.fields.occurredDay
    timeInput.value = ed.fields.occurredTime
    draftTags.value = [...ed.tags]
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
.ed-title-label{font-size:13.5px;font-weight:700;margin-left:2px;}
.save-state{font-size:11.5px;color:var(--text-secondary);cursor:default;min-width:110px;text-align:right;}
.save-state.saving{color:var(--text-secondary);}
.save-state.saved{color:var(--accent);}
.save-state.error{color:var(--danger);font-weight:700;cursor:pointer;}
.ed-hint{font-size:11px;opacity:.75;}
.today-list{font-size:11px;color:var(--text-secondary);display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.chip.mini{padding:2px 8px;font-size:11px;border-radius:999px;cursor:pointer;}
.chip.mini.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft);}
.ed-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:14px;}
.ed-photo{position:relative;aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--line);}
.ed-photo img{width:100%;height:100%;object-fit:cover;display:block;}
.ed-photo-del{
  position:absolute;top:4px;right:4px;width:20px;height:20px;border:0;border-radius:50%;
  background:rgba(20,25,35,.55);color:#fff;font-size:11px;cursor:pointer;line-height:20px;padding:0;
}
.ed-photo-del:hover{background:var(--danger);}
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
.addr-input{
  width:100%;border:1px solid var(--line);border-radius:6px;padding:7px 10px;font-size:13px;
  background:var(--card);color:var(--text-main);outline:none;
}
.addr-recent{font-size:11.5px;color:var(--text-secondary);margin-top:14px;}
</style>
