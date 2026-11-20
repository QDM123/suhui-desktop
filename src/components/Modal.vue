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

<script setup>
defineProps({
  visible: Boolean,
  title: { type: String, default: '' },
  buttons: {
    type: Array,
    default: () => [{ text: '确定', cls: 'primary' }]
  }
})
defineEmits(['close', 'action'])
</script>
