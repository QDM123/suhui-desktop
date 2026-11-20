<template>
  <div class="titlebar">
    <span class="tb-logo">📖</span>
    <span class="tb-app">溯洄 · 桌面版</span>
    <div class="tb-search">
      <span>🔍</span>
      <input
        ref="searchRef"
        :value="tl.searchQ"
        placeholder="搜索日记：标题 / 正文 / 标签（Ctrl+K）"
        @input="onInput($event.target.value)"
        @keydown.escape="clearSearch"
      >
      <button v-if="tl.searchQ" class="tb-search-clear" title="清空" @click="clearSearch">✕</button>
    </div>
    <button
      class="tb-theme"
      :title="app.night ? '切换到日间模式' : '切换到夜间模式'"
      @click="app.setNight(!app.night)"
    >{{ app.night ? '☀️' : '🌙' }}</button>
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
import { useAppStore } from '../stores/app'

const searchRef = ref(null)
const win = window.api.window
const route = useRoute()
const router = useRouter()
const tl = useTimelineStore()
const app = useAppStore()

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
/* 搜索框比例优化：胶囊形、更紧凑 */
.tb-search{
  max-width:340px;min-width:220px;
  border-radius:999px;padding:7px 16px;gap:8px;
}
.tb-search input{font-size:13px;}
.tb-search-clear{
  border:0;background:none;color:var(--text-secondary);cursor:pointer;
  font-size:11px;width:20px;height:20px;border-radius:50%;line-height:20px;padding:0;flex:none;
}
.tb-search-clear:hover{background:var(--line);color:var(--text-main);}
/* 日/夜切换按钮 */
.tb-theme{
  width:34px;height:30px;border:0;border-radius:999px;background:none;cursor:pointer;
  font-size:15px;color:var(--text-secondary);flex:none;transition:.15s;
}
.tb-theme:hover{background:var(--line);transform:rotate(15deg);}
</style>
