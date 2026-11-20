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
</template>

<script setup>
import { onMounted } from 'vue'
import { useAppStore } from './stores/app'
import TitleBar from './components/TitleBar.vue'
import SideNav from './components/SideNav.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import StatusBar from './components/StatusBar.vue'

const app = useAppStore()

onMounted(() => {
  app.loadStats()
})
</script>
