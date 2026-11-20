<template>
  <div class="titlebar">
    <span class="tb-logo">📖</span>
    <span class="tb-app">溯洄 · 桌面版</span>
    <div class="tb-search">
      <span>🔍</span>
      <input
        ref="searchRef"
        v-model="q"
        placeholder="全局搜索：标题 / 正文 / 标签（Ctrl+K）"
      >
    </div>
    <div class="tb-btns">
      <button class="tb-btn" title="最小化" @click="win.minimize()">—</button>
      <button class="tb-btn" title="最大化 / 还原" @click="win.toggleMaximize()">▢</button>
      <button class="tb-btn close" title="关闭" @click="win.close()">✕</button>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const q = ref('')
const searchRef = ref(null)
const win = window.api.window

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchRef.value?.focus()
    searchRef.value?.select()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>
