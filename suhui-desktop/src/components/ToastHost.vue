<template>
  <div class="toast" :hidden="!ui.toast.visible">{{ ui.toast.text }}</div>
  <Modal
    :visible="ui.ask.visible"
    :title="ui.ask.title"
    :buttons="[
      { text: ui.ask.cancelText },
      { text: ui.ask.confirmText, cls: ui.ask.danger ? 'danger' : 'primary' }
    ]"
    @close="ui.resolveAsk(false)"
    @action="ui.resolveAsk($event.text === ui.ask.confirmText)"
  >
    <div style="white-space:pre-wrap">{{ ui.ask.body }}</div>
  </Modal>
</template>

<script setup lang="ts">
import { useUiStore } from '../stores/ui'
import Modal from './Modal.vue'

const ui = useUiStore()
</script>
