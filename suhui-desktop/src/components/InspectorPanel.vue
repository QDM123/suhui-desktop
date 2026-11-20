<template>
  <aside class="inspector">
    <h3>属性</h3>
    <template v-if="entry">
      <div class="insp-row"><span class="k">日期</span><span>{{ entry.occurred_at.slice(0, 10) }}</span></div>
      <div class="insp-row"><span class="k">时间</span><span>{{ entry.occurred_at.slice(11, 16) }}</span></div>
      <div class="insp-row"><span class="k">星期</span><span>{{ WEEK_CN[entry.weekday] }}</span></div>
      <div class="insp-row"><span class="k">天气</span><span>{{ weatherOf(entry.weather).icon }} {{ weatherOf(entry.weather).name }}</span></div>
      <div class="insp-row"><span class="k">地址</span><span>{{ entry.address || '—' }}</span></div>
      <div class="insp-row"><span class="k">分类</span><span>{{ catName }}</span></div>
      <div class="insp-row"><span class="k">标签</span><span>{{ tagsText }}</span></div>
      <div class="insp-row"><span class="k">照片</span><span>{{ tl.reader?.media?.length || 0 }} 张</span></div>
      <div class="insp-row"><span class="k">信笺</span><span>{{ entry.background }}</span></div>
      <div class="insp-row"><span class="k">更新</span><span>{{ entry.rev }} 次</span></div>
    </template>
    <div v-else style="font-size:13px;color:var(--text-secondary)">未选中条目</div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useTimelineStore } from '../stores/timeline'
import { WEEK_CN, weatherOf } from '../constants'

const tl = useTimelineStore()
const entry = computed(() => tl.reader?.entry || null)
const catName = computed(() => {
  const id = entry.value?.category_id
  return tl.categories.find((c) => c.id === id)?.name || '未分类'
})
const tagsText = computed(() => {
  const t = tl.reader?.tags?.map((x) => '#' + x.name).join(' ')
  return t || '—'
})
</script>
