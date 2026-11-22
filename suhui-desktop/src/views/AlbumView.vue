<template>
  <div class="view">
    <div class="view-head">
      <h1>日记相册</h1>
      <span class="sub">自动汇集日记中的图片 · {{ items.length }} 张</span>
    </div>
    <div v-if="items.length" class="album-grid">
      <div
        v-for="m in items"
        :key="m.id"
        class="ph"
        :title="m.orig_name ?? undefined"
        @click="jump(m.entry_id)"
      >
        <img :src="`media://${m.file_name}`" alt="" loading="lazy">
        <span>{{ m.day }} · {{ m.title }}</span>
      </div>
    </div>
    <div v-else class="empty">
      <span class="big">🖼️</span>日记里还没有照片，写日记时添加的照片会自动汇集到这里
    </div>
    <div v-if="items.length" class="empty" style="padding-top:24px;">
      图片按日记时间自动归档，无需手动整理；点击任意图片跳转到所属日记
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '../stores/timeline'
import type { AlbumMediaItem } from '../types/domain'

const router = useRouter()
const tl = useTimelineStore()
const items = ref<AlbumMediaItem[]>([])

async function jump(entryId: string) {
  await tl.setSearch('')
  if (tl.filterCat) await tl.setFilter(tl.filterCat)
  tl.pendingSelectId = entryId
  router.push('/timeline')
}

onMounted(async () => {
  items.value = await window.api.media.listAll()
})
</script>

<style>
.album-grid .ph{position:relative;overflow:hidden;}
.album-grid .ph img{width:100%;height:100%;object-fit:cover;display:block;transition:.15s;}
.album-grid .ph:hover img{transform:scale(1.03);}
</style>
