<template>
  <div
    v-if="visible"
    class="lb-mask"
    @click.self="$emit('close')"
    @wheel.prevent="onWheel"
  >
    <img
      class="lb-img"
      :src="`media://${media[index].file_name}`"
      :style="imgStyle"
      :class="{ grabbable: scale > 1 }"
      alt=""
      @dblclick="scale = scale > 1 ? 1 : 2; rot = rot - rot % 360; px = 0; py = 0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @click="onImgClick"
    >

    <template v-if="media.length > 1">
      <button class="lb-nav prev" @click.stop="move(-1)">‹</button>
      <button class="lb-nav next" @click.stop="move(1)">›</button>
    </template>

    <!-- 工具条：旋转 / 缩放 -->
    <div class="lb-tools" @click.stop>
      <button class="lb-tool" title="向左旋转" @click="rot -= 90">↺</button>
      <button class="lb-tool" title="向右旋转" @click="rot += 90">↻</button>
      <span class="lb-zoom">{{ Math.round(scale * 100) }}%</span>
      <button class="lb-tool" title="缩小" @click="zoomBy(-0.25)">－</button>
      <button class="lb-tool" title="放大" @click="zoomBy(0.25)">＋</button>
      <button class="lb-tool" title="重置" @click="reset">1:1</button>
    </div>

    <div class="lb-info">{{ index + 1 }} / {{ media.length }}</div>
    <button class="lb-close" @click="$emit('close')">✕</button>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  visible: Boolean,
  media: { type: Array, default: () => [] },
  index: { type: Number, default: 0 }
})
const emit = defineEmits(['close', 'move'])

const scale = ref(1)
const rot = ref(0)
const px = ref(0)
const py = ref(0)
const dragging = ref(false)
let startX = 0
let startY = 0
let baseX = 0
let baseY = 0
let moved = false

const imgStyle = computed(() => ({
  transform: `translate(${px.value}px, ${py.value}px) rotate(${rot.value}deg) scale(${scale.value})`
}))

/* 切换图片时重置视图状态 */
watch(() => props.index, reset)
watch(() => props.visible, (v) => { if (v) reset() })

function reset() {
  scale.value = 1
  rot.value = 0
  px.value = 0
  py.value = 0
}
function zoomBy(d) {
  scale.value = Math.min(6, Math.max(0.2, Math.round((scale.value + d) * 100) / 100))
}
function onWheel(e) {
  zoomBy(e.deltaY < 0 ? 0.2 : -0.2)
}
function move(d) {
  reset()
  emit('move', d)
}
function onPointerDown(e) {
  if (scale.value <= 1) return
  dragging.value = true
  moved = false
  startX = e.clientX
  startY = e.clientY
  baseX = px.value
  baseY = py.value
  e.target.setPointerCapture(e.pointerId)
}
function onPointerMove(e) {
  if (!dragging.value) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
  px.value = baseX + dx
  py.value = baseY + dy
}
function onPointerUp() {
  dragging.value = false
}
function onImgClick() {
  /* 拖拽后不触发关闭 */
  if (moved) { moved = false; return }
  emit('close')
}

function onKey(e) {
  if (!props.visible) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') move(-1)
  else if (e.key === 'ArrowRight') move(1)
  else if (e.key === '+' || e.key === '=') zoomBy(0.25)
  else if (e.key === '-') zoomBy(-0.25)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style>
.lb-mask{
  position:fixed;inset:0;background:rgba(10,12,18,.9);z-index:300;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
}
.lb-img{
  max-width:92vw;max-height:84vh;object-fit:contain;border-radius:4px;
  user-select:none;touch-action:none;will-change:transform;
}
.lb-img.grabbable{cursor:grab;}
.lb-img.grabbable:active{cursor:grabbing;}
.lb-nav{
  position:absolute;top:50%;transform:translateY(-50%);
  width:46px;height:72px;border:0;border-radius:8px;background:rgba(255,255,255,.08);
  color:#fff;font-size:30px;cursor:pointer;
}
.lb-nav:hover{background:rgba(255,255,255,.18);}
.lb-nav.prev{left:22px;}
.lb-nav.next{right:22px;}
.lb-tools{
  position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
  display:flex;align-items:center;gap:6px;background:rgba(20,24,32,.75);
  border-radius:999px;padding:6px 12px;
}
.lb-tool{
  width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.1);
  color:#fff;font-size:15px;cursor:pointer;
}
.lb-tool:hover{background:rgba(255,255,255,.25);}
.lb-zoom{color:rgba(255,255,255,.85);font-size:12px;min-width:44px;text-align:center;}
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
