<template>
  <div class="statusbar">
    <span>就绪</span>
    <span class="sb-right">
      <span>{{ app.stats.entries }} 篇日记 · {{ app.stats.categories }} 个分类</span>
      <span></span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from '../stores/app'
const app = useAppStore()
</script>
