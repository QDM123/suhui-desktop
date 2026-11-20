<template>
  <nav class="sidebar">
    <button
      v-for="item in NAV_ITEMS"
      :key="item.path"
      class="nav-item"
      :class="{ active: route.path === item.path }"
      @click="router.push(item.path)"
    >
      <span>{{ item.icon }}</span>{{ item.label }}
    </button>
    <div class="nav-sep"></div>
    <button
      v-for="item in FOOTER_ITEMS"
      :key="item.path"
      class="nav-item"
      :class="{ active: route.path === item.path }"
      @click="router.push(item.path)"
    >
      <span>{{ item.icon }}</span>{{ item.label }}
    </button>
    <button
      class="nav-item collapse"
      :title="app.sidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
      @click="app.toggleSidebar()"
    >
      <span>{{ app.sidebarCollapsed ? '⇥' : '⇤' }}</span>{{ app.sidebarCollapsed ? '' : '折叠' }}
    </button>
  </nav>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { NAV_ITEMS, FOOTER_ITEMS } from '../router'
import { useAppStore } from '../stores/app'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
</script>
