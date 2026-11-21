<template>
  <div class="window" :class="{ collapsed: app.sidebarCollapsed }" :data-theme="app.themeAttr">
    <TitleBar />
    <div class="main">
      <SideNav />
      <div class="content">
        <router-view />
      </div>
    </div>
    <StatusBar />
  </div>
  <ToastHost />
  <ShortcutsQuick :visible="quickShow" @close="quickShow = false" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from './stores/app'
import { useEditorStore } from './stores/editor'
import { useUiStore } from './stores/ui'
import { matchShortcut } from './shortcuts'
import TitleBar from './components/TitleBar.vue'
import SideNav from './components/SideNav.vue'
import StatusBar from './components/StatusBar.vue'
import ToastHost from './components/ToastHost.vue'
import ShortcutsQuick from './components/ShortcutsQuick.vue'

const app = useAppStore()
const router = useRouter()
const route = useRoute()
const quickShow = ref(false)

function isTypingTarget(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/* 全局快捷键：从注册表匹配 global 作用域（写作页快捷键在 WriteView 内处理） */
function onGlobalKeydown(e) {
  /* 速查弹窗打开时：Esc 关闭 */
  if (quickShow.value && e.key === 'Escape') {
    quickShow.value = false
    e.preventDefault()
    return
  }
  const sc = matchShortcut(e, ['global'])
  if (!sc) return
  /* 输入框/正文里按 ?（Shift+/）视为打字，不呼出速查 */
  if (sc.id === 'help' && e.key === '?' && isTypingTarget(e.target)) return
  e.preventDefault()
  switch (sc.id) {
    case 'new-diary':
      if (route.path === '/write') {
        useUiStore().showToast('正在编辑日记，先 Ctrl+S 保存并退出后再新建')
      } else {
        router.push('/write')
      }
      break
    case 'search':
      if (route.path !== '/timeline') router.push('/timeline')
      /* TitleBar 监听该事件聚焦搜索框 */
      window.dispatchEvent(new Event('app:focus-search'))
      break
    case 'goto-export':
      router.push('/export')
      break
    case 'goto-settings':
      router.push('/settings')
      break
    case 'help':
      quickShow.value = !quickShow.value
      break
  }
}

onMounted(() => {
  app.loadSettings()
  app.loadStats()
  window.addEventListener('keydown', onGlobalKeydown)

  /* 提醒通知点击 → 进入写日记（Phase 8） */
  window.api.app.onOpenWrite(() => {
    router.push('/write')
  })

  /* 关窗守卫（计划 §2.3）：主进程拦截 close → 通知这里 flush → 确认后才真正关闭
     防重入：flush 期间重复的 before-close（如连点 X）直接忽略 */
  let closing = false
  window.api.app.onBeforeClose(async () => {
    if (closing) return
    closing = true
    try {
      const ed = useEditorStore()
      if (ed.active) {
        let ok = await ed.flush()
        if (!ok) {
          const ui = useUiStore()
          const retry = await ui.askConfirm({
            title: '保存失败',
            body: (ed.saveError || '未知错误') + '\n\n重试保存并关闭？',
            confirmText: '重试并关闭'
          })
          if (retry) ok = await ed.flush()
          if (!ok) return // 不确认关闭，用户可继续处理
        }
        ed.closeSilent()
      }
      window.api.app.confirmClose()
    } finally {
      closing = false
    }
  })
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>
