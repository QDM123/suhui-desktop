<template>
  <div class="view" style="max-width:640px;">
    <div class="view-head"><h1>设置</h1></div>

    <!-- 主题外观 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">主题外观</div>
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div class="theme-grid">
        <div
          v-for="t in THEMES"
          :key="t.key"
          class="theme-swatch"
          :class="{ on: app.theme === t.key && !app.night }"
          :style="{ background: t.color }"
          @click="app.setTheme(t.key)"
        ><span>{{ t.name }}</span></div>
      </div>
      <div class="set-row" style="border-bottom:0;padding:12px 4px 0;">
        <span>🌙</span>
        <span class="grow">夜间模式<div class="s">全局深色配色，编辑与阅读信笺切换为夜间纸</div></span>
        <span class="switch" :class="{ on: app.night }" @click="app.setNight(!app.night)"></span>
      </div>
    </div>

    <!-- 记录 -->
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

    <!-- 偏好 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">偏好</div>
    <div class="set-group">
      <div class="set-row">
        <span>🔔</span>
        <span class="grow">提醒写日记<div class="s">本地定时提醒（Phase 8 实装，当前为占位）</div></span>
        <span class="switch" style="opacity:.4;cursor:not-allowed"></span>
      </div>
    </div>

    <!-- 数据 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">数据</div>
    <div class="set-group">
      <div class="set-row">
        <span>📂</span>
        <span class="grow">数据目录<div class="s">{{ dataDir || '…' }}</div></span>
        <button class="btn sm plain" @click="openDataDir">打开目录</button>
      </div>
    </div>

    <!-- 关于 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">关于</div>
    <div class="set-group">
      <div class="set-row"><span>📖</span><span class="grow">溯洄 · 桌面版<div class="s">个人本地日记应用</div></span><span style="color:var(--text-secondary)">v{{ version }}</span></div>
      <div class="set-row" style="cursor:default">
        <span>🧭</span>
        <span class="grow">规格说明<div class="s">交互规格参考公开行为研究（个人学习用途），界面与素材均为独立实现</div></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { THEMES } from '../constants'

const router = useRouter()
const app = useAppStore()
const dataDir = ref('')
const version = ref('')

onMounted(async () => {
  dataDir.value = await window.api.app.dataDir()
  version.value = await window.api.app.version()
})

function openDataDir() {
  window.api.app.openDataDir()
}
</script>
