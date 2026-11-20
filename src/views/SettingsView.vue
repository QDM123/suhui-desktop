<template>
  <div class="view" style="max-width:640px;">
    <div class="view-head"><h1>设置</h1></div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">记录</div>
    <div class="set-group">
      <div class="set-row" style="cursor:pointer" @click="router.push('/categories')">
        <span>🏷️</span><span class="grow">分类管理<div class="s">新增 / 改名 / 换色 / 删除（非空分类的日记移入「生活」）</div></span>
        <span style="color:var(--text-secondary)">›</span>
      </div>
      <div class="set-row" style="cursor:pointer" @click="router.push('/tags')">
        <span>#️⃣</span><span class="grow">标签管理<div class="s">重命名 / 合并 / 删除孤儿标签</div></span>
        <span style="color:var(--text-secondary)">›</span>
      </div>
    </div>
    <div class="empty" style="padding:36px 0 0;">主题外观、提醒、备份等将在后续阶段（Phase 6 / 8）实装</div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
