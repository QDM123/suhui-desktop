<template>
  <div class="view" style="max-width:720px;margin:0 auto;width:100%;">
    <div class="view-head">
      <h1>⌨️ 快捷键</h1>
      <span class="sub">集中说明 · 与按键行为同源维护 · 任意页面按 F1 或 ? 可随时速查</span>
    </div>

    <div v-for="g in groups" :key="g.name" class="card" style="padding:6px 0;margin-bottom:14px;">
      <div class="sc-group">{{ g.name }}</div>
      <div v-for="s in g.items" :key="s.id" class="sc-row">
        <span class="grow">{{ s.label }}</span>
        <span class="sc-scope">{{ SCOPE_NAMES[s.scope] }}</span>
        <span v-for="(k, i) in s.keys" :key="i" class="kbd">{{ k }}</span>
        <template v-if="s.alts">
          <span class="sc-or">/</span>
          <span v-for="(k, i) in s.alts" :key="'alt' + i" class="kbd">{{ k }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SCOPE_NAMES, shortcutGroups } from '../shortcuts'

const groups = shortcutGroups()
</script>
