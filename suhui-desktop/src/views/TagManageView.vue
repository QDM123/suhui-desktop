<template>
  <div class="view" style="max-width:640px;margin:0 auto;width:100%;">
    <div class="view-head">
      <button class="tool-btn" title="返回" @click="back">‹</button>
      <h1>标签管理</h1>
      <span class="sub">共 {{ list.length }} 个 · 孤儿标签（0 引用）可删除</span>
    </div>

    <div class="set-group">
      <div v-for="t in list" :key="t.id" class="set-row">
        <template v-if="editingId === t.id">
          <input v-model="editingName" class="mgmt-input" @keydown.enter="saveRename(t)" @keydown.escape="editingId = null">
          <button class="btn sm" @click="saveRename(t)">保存</button>
        </template>
        <template v-else>
          <span class="grow">#{{ t.name }}</span>
          <span style="color:var(--text-secondary);font-size:12px;">{{ t.used }} 篇</span>
          <button class="btn sm ghost" @click="startRename(t)">重命名</button>
          <button v-if="list.length > 1" class="btn sm plain" @click="openMerge(t)">合并到…</button>
          <button class="btn sm danger" :disabled="t.used > 0" :title="t.used > 0 ? '仍有日记使用，不可删除' : ''" @click="remove(t)">删除</button>
        </template>
      </div>
      <div v-if="!list.length" class="empty" style="padding:30px;">还没有标签，写日记时添加即可</div>
    </div>

    <!-- 合并弹窗 -->
    <Modal :visible="mergeFrom !== null" title="合并标签" @close="mergeFrom = null">
      <div style="text-align:center;">
        将 <b>#{{ mergeFromName }}</b> 合并到：
        <div class="chip-row" style="justify-content:center;margin-top:10px;">
          <span v-for="t in mergeTargets" :key="t.id" class="chip" @click="doMerge(t)">#{{ t.name }}（{{ t.used }}）</span>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../stores/ui'
import Modal from '../components/Modal.vue'
import type { TagWithUsed } from '../types/domain'

const router = useRouter()

/* 从哪进入回哪：无来源时回设置 */
function back() { router.push((router.options.history.state.back as string | null) || '/settings') }
const ui = useUiStore()

const list = ref<TagWithUsed[]>([])
const editingId = ref<number | null>(null)
const editingName = ref('')
const mergeFrom = ref<number | null>(null)

const mergeFromName = computed(() => list.value.find((t) => t.id === mergeFrom.value)?.name || '')
const mergeTargets = computed(() => list.value.filter((t) => t.id !== mergeFrom.value))

async function load() {
  list.value = await window.api.tag.listAll()
}
onMounted(load)

function startRename(t: TagWithUsed) {
  editingId.value = t.id
  editingName.value = t.name
}

async function saveRename(t: TagWithUsed) {
  const name = editingName.value.trim().replace(/^#/, '')
  editingId.value = null
  if (!name || name === t.name) return
  try {
    await window.api.tag.rename(t.id, name)
    await load()
  } catch (e) {
    ui.showToast((e as { message?: string } | null)?.message || '重命名失败')
  }
}

function openMerge(t: TagWithUsed) {
  mergeFrom.value = t.id
}

async function doMerge(target: TagWithUsed) {
  const fromName = mergeFromName.value
  const okAsk = await ui.askConfirm({
    title: '合并标签',
    body: `将 #${fromName} 的全部日记并入 #${target.name}，#${fromName} 将被删除。确定？`,
    confirmText: '合并'
  })
  if (!okAsk) return
  try {
    await window.api.tag.merge(mergeFrom.value as number, target.id)
    mergeFrom.value = null
    ui.showToast('合并完成')
    await load()
  } catch (e) {
    ui.showToast((e as { message?: string } | null)?.message || '合并失败')
  }
}

async function remove(t: TagWithUsed) {
  const okAsk = await ui.askConfirm({
    title: '删除标签',
    body: `确定删除未被使用的标签 #${t.name}？`,
    confirmText: '删除',
    danger: true
  })
  if (!okAsk) return
  try {
    await window.api.tag.remove(t.id)
    await load()
  } catch (e) {
    ui.showToast((e as { message?: string } | null)?.message || '删除失败')
  }
}
</script>
