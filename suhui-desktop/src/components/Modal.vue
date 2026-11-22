<template>
  <div v-if="visible" class="dialog-mask" @click.self="$emit('close')">
    <div class="dialog">
      <div class="dialog-title">{{ title }}</div>
      <div class="dialog-body"><slot></slot></div>
      <div class="dialog-btns">
        <button
          v-for="(b, i) in buttons"
          :key="i"
          :class="b.cls"
          @click="$emit('action', b)"
        >{{ b.text }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

interface ModalButton {
  text: string
  cls?: string
}

defineProps({
  visible: Boolean,
  title: { type: String, default: '' },
  buttons: {
    type: Array as PropType<ModalButton[]>,
    default: () => [{ text: '确定', cls: 'primary' }]
  }
})
defineEmits<{ close: []; action: [b: ModalButton] }>()
</script>
