<template>
  <div v-if="visible" class="dialog-mask" @click.self="$emit('close')">
    <div class="scq">
      <div class="scq-title">⌨️ 快捷键速查</div>
      <div class="scq-cols">
        <div v-for="col in cols" :key="col.name">
          <div class="sc-group">{{ col.name }}</div>
          <div v-for="s in col.items" :key="s.id" class="scq-row">
            <span>{{ s.label }}</span>
            <span class="scq-keys">
              <span v-for="(k, i) in s.keys" :key="i" class="kbd">{{ k }}</span>
              <template v-if="s.alts">
                <span class="sc-or">/</span>
                <span v-for="(k, i) in s.alts" :key="'alt' + i" class="kbd">{{ k }}</span>
              </template>
            </span>
          </div>
        </div>
      </div>
      <div class="scq-foot">按 F1 或 ? 随时呼出 · Esc / 点击空白关闭</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { shortcutGroups } from '../shortcuts'

defineProps({ visible: Boolean })
defineEmits(['close'])

/* 双栏：左=全局操作，右=写作页+文本排版（与中心页同一注册表） */
const cols = computed(() => {
  const gs = shortcutGroups()
  const pick = (name) => gs.find((g) => g.name === name) || { name, items: [] }
  const writeAndFormat = {
    name: '写作页 / 排版',
    items: [...pick('写作页').items, ...pick('文本排版').items]
  }
  return [pick('全局操作'), writeAndFormat]
})
</script>
