<template>
  <div class="titlebar">
    <span class="tb-logo">📖</span>
    <span class="tb-app">溯洄 · 桌面版</span>
    <div class="tb-search">
      <span>🔍</span>
      <input
        ref="searchRef"
        :value="tl.searchQ"
        placeholder="全局搜索：标题 / 正文 / 标签（Ctrl+K）"
        @input="onInput($event.target.value)"
        @keydown.escape="clearSearch"
      >
      <button v-if="tl.searchQ" class="tb-search-clear" title="清空" @click="clearSearch">✕</button>
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
import { useRoute, useRouter } from 'vue-router'
import { useTimelineStore } from '../stores/timeline'

const searchRef = ref(null)
const win = window.api.window
const route = useRoute()
const router = useRouter()
const tl = useTimelineStore()

/* 防抖 300ms（Phase 3）：词存 timeline store，标签点击等入口可联动 */
let timer = null
function onInput(v) {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (v && route.path !== '/timeline') router.push('/timeline')
    await tl.setSearch(v)
  }, 300)
}

function clearSearch() {
  clearTimeout(timer)
  tl.setSearch('')
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchRef.value?.focus()
    searchRef.value?.select()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  clearTimeout(timer)
})
</script>

<style>
.tb-search-clear{
  border:0;background:none;color:var(--text-secondary);cursor:pointer;
  font-size:11px;padding:2px 4px;border-radius:4px;
}
.tb-search-clear:hover{background:var(--line);}
</style>
