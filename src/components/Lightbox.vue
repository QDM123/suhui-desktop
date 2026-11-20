<template>
  <div
    v-if="visible"
    class="lb-mask"
    @click.self="$emit('close')"
  >
    <button class="lb-nav prev" v-if="media.length > 1" @click.stop="move(-1)">‹</button>
    <img class="lb-img" :src="`media://${media[index].file_name}`" alt="" @click="$emit('close')">
    <button class="lb-nav next" v-if="media.length > 1" @click.stop="move(1)">›</button>
    <div class="lb-info">{{ index + 1 }} / {{ media.length }}</div>
    <button class="lb-close" @click="$emit('close')">✕</button>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps({
  visible: Boolean,
  media: { type: Array, default: () => [] },
  index: { type: Number, default: 0 }
})
const emit = defineEmits(['close', 'move'])

function onKey(e) {
  if (!props.visible) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') emit('move', -1)
  else if (e.key === 'ArrowRight') emit('move', 1)
}
function move(d) { emit('move', d) }

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style>
.lb-mask{
  position:fixed;inset:0;background:rgba(10,12,18,.88);z-index:300;
  display:flex;align-items:center;justify-content:center;
}
.lb-img{
  max-width:92vw;max-height:88vh;object-fit:contain;border-radius:6px;
  cursor:zoom-out;user-select:none;
}
.lb-nav{
  position:absolute;top:50%;transform:translateY(-50%);
  width:46px;height:72px;border:0;border-radius:8px;background:rgba(255,255,255,.08);
  color:#fff;font-size:30px;cursor:pointer;
}
.lb-nav:hover{background:rgba(255,255,255,.18);}
.lb-nav.prev{left:22px;}
.lb-nav.next{right:22px;}
.lb-info{
  position:absolute;bottom:22px;left:50%;transform:translateX(-50%);
  color:rgba(255,255,255,.75);font-size:12.5px;letter-spacing:1px;
}
.lb-close{
  position:absolute;top:18px;right:22px;width:34px;height:34px;border:0;border-radius:50%;
  background:rgba(255,255,255,.1);color:#fff;font-size:14px;cursor:pointer;
}
.lb-close:hover{background:var(--danger);}
</style>
