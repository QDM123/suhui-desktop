<template>
  <div class="window" :class="{ collapsed: app.sidebarCollapsed }" :data-theme="app.themeAttr">
    <TitleBar />
    <div class="main">
      <SideNav />
      <div class="content">
        <router-view />
      </div>
      <InspectorPanel />
    </div>
    <StatusBar />
  </div>
  <ToastHost />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAppStore } from './stores/app'
import { useEditorStore } from './stores/editor'
import { useUiStore } from './stores/ui'
import TitleBar from './components/TitleBar.vue'
import SideNav from './components/SideNav.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import StatusBar from './components/StatusBar.vue'
import ToastHost from './components/ToastHost.vue'

const app = useAppStore()

onMounted(() => {
  app.loadSettings()
  app.loadStats()

  /* 关窗守卫（计划 §2.3）：主进程拦截 close → 通知这里 flush → 确认后才真正关闭 */
  window.api.app.onBeforeClose(async () => {
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
  })
})
</script>
