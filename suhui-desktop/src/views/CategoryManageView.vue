<template>
  <div class="view" style="max-width:640px;">
    <div class="view-head">
      <button class="tool-btn" title="返回" @click="back">‹</button>
      <h1>分类管理</h1>
      <span class="sub">共 {{ list.length }} 个 · 默认分类「生活」不可删除</span>
    </div>

    <!-- 新增 -->
    <div class="card" style="padding:14px 16px;margin-bottom:14px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <input v-model="newName" placeholder="新分类名称" class="mgmt-input" @keydown.enter="add">
        <div class="palette">
          <i
            v-for="c in PALETTE"
            :key="c"
            class="cat-dot"
            :class="{ sel: newColor === c }"
            :style="{ background: c }"
            @click="newColor = c"
          ></i>
        </div>
        <button class="btn sm" @click="add">添加</button>
      </div>
    </div>

    <!-- 列表 -->
    <div class="set-group">
      <div v-for="c in list" :key="c.id" class="set-row">
        <i class="cat-dot" :style="{ background: c.color, cursor:'pointer' }" title="更换颜色" @click="cycleColor(c)"></i>
        <template v-if="editingId === c.id">
          <input v-model="editingName" class="mgmt-input" @keydown.enter="saveName(c)" @keydown.escape="editingId = null">
          <button class="btn sm" @click="saveName(c)">保存</button>
        </template>
        <template v-else>
          <span class="grow">{{ c.name }}<span v-if="c.id === 1" style="color:var(--text-secondary);font-size:11px;">（默认）</span></span>
          <span style="color:var(--text-secondary);font-size:12px;">{{ c.entry_count }} 篇</span>
          <button class="btn sm ghost" @click="startRename(c)">改名</button>
          <button class="btn sm danger" @click="remove(c)">删除</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../stores/ui'
import { useAppStore } from '../stores/app'

const router = useRouter()
const ui = useUiStore()
const app = useAppStore()

const PALETTE = ['#00CCBB', '#8695B2', '#f0885a', '#7b7fd0', '#3aa76d', '#e05a7a', '#c9a227', '#4a5a72']
const list = ref([])
const newName = ref('')
const newColor = ref(PALETTE[0])
const editingId = ref(null)
const editingName = ref('')

const backFrom = ref('/timeline')
function back() { router.push(backFrom.value) }

async function load() {
  list.value = await window.api.category.list()
}

onMounted(async () => {
  backFrom.value = router.options.history.state.back === '/timeline' ? '/timeline' : '/timeline'
  await load()
})

async function add() {
  const name = newName.value.trim()
  if (!name) return ui.showToast('请输入分类名称')
  try {
    await window.api.category.create(name, newColor.value)
    newName.value = ''
    await load()
    app.loadStats()
  } catch (e) {
    ui.showToast(e?.message || '添加失败')
  }
}

function startRename(c) {
  editingId.value = c.id
  editingName.value = c.name
}

async function saveName(c) {
  const name = editingName.value.trim()
  editingId.value = null
  if (!name || name === c.name) return
  try {
    await window.api.category.update(c.id, { name })
    await load()
  } catch (e) {
    ui.showToast(e?.message || '改名失败')
  }
}

async function cycleColor(c) {
  const i = PALETTE.indexOf(c.color)
  const next = PALETTE[(i + 1) % PALETTE.length]
  await window.api.category.update(c.id, { color: next })
  await load()
}

async function remove(c) {
  if (c.id === 1) return ui.showToast('默认分类不可删除')
  let body = `确定删除分类「${c.name}」？`
  if (c.entry_count > 0) body = `「${c.name}」下有 ${c.entry_count} 篇日记，删除后它们将移入「生活」。` + body
  const okAsk = await ui.askConfirm({ title: '删除分类', body, confirmText: '删除', danger: true })
  if (!okAsk) return
  try {
    const r = await window.api.category.remove(c.id)
    if (r.moved > 0) ui.showToast(`已删除，${r.moved} 篇移入「生活」`)
    else ui.showToast('已删除')
    await load()
    app.loadStats()
  } catch (e) {
    ui.showToast(e?.message || '删除失败')
  }
}
</script>

<style>
.mgmt-input{
  border:1px solid var(--line);border-radius:6px;padding:6px 10px;font-size:13px;
  background:var(--card);color:var(--text-main);outline:none;width:150px;
}
.mgmt-input:focus{border-color:var(--accent);}
.palette{display:flex;gap:8px;align-items:center;flex:1;}
.palette .cat-dot{width:14px;height:14px;cursor:pointer;opacity:.6;}
.palette .cat-dot:hover{opacity:1;}
.palette .cat-dot.sel{opacity:1;outline:2px solid var(--accent);outline-offset:2px;}
</style>
