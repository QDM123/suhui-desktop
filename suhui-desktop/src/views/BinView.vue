<template>
  <div class="view">
    <div class="view-head">
      <h1>回收站</h1>
      <span class="sub">删除后 30 天内可恢复，到期启动时自动清理</span>
    </div>
    <template v-if="list.length">
      <div v-for="e in list" :key="e.id" class="table-row">
        <span style="font-size:18px">📄</span>
        <span class="grow">
          <span class="t">{{ e.title }}</span>
          <div class="s">{{ e.day }} {{ e.time }} · 原文 {{ e.contentLen }} 字 · 删除于 {{ e.deleted_at?.slice(0, 16).replace('T', ' ') }}</div>
        </span>
        <button class="btn sm ghost" @click="restore(e)">恢复</button>
        <button class="btn sm danger" @click="purge(e)">彻底删除</button>
      </div>
    </template>
    <div v-else class="empty"><span class="big">🗑️</span>回收站是空的</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useAppStore } from '../stores/app'
import type { BinItem } from '../types/domain'

const ui = useUiStore()
const app = useAppStore()
const list = ref<BinItem[]>([])

async function load() {
  list.value = await window.api.bin.list()
}

async function restore(e: BinItem) {
  const r = await window.api.bin.restore(e.id)
  ui.showToast(r.ok ? '恢复成功' : '恢复失败')
  if (r.ok) {
    await load()
    app.loadStats()
  }
}

async function purge(e: BinItem) {
  const okAsk = await ui.askConfirm({
    title: '彻底删除',
    body: '彻底删除后无法恢复，确定吗？',
    confirmText: '删除',
    danger: true
  })
  if (!okAsk) return
  const r = await window.api.bin.purge(e.id)
  if (r.ok) {
    ui.showToast('已彻底删除')
    await load()
    app.loadStats()
  } else {
    ui.showToast('删除失败（文件可能被占用）')
  }
}

onMounted(load)
</script>
