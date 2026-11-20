<template>
  <div class="view" style="max-width:640px;margin:0 auto;width:100%;">
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
      <div class="set-row" style="cursor:pointer" @click="router.push('/papers')">
        <span>📜</span><span class="grow">信纸 DIY<div class="s">上传图片 / 参数生成自定义信纸，内置 15 款</div></span>
        <span style="color:var(--text-secondary)">›</span>
      </div>
    </div>

    <!-- 偏好 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">偏好</div>
    <div class="set-group">
      <div class="set-row">
        <span>🚀</span>
        <span class="grow">随系统启动<div class="s">开机自动打开溯洄，第一时间记录（安装版生效）</div></span>
        <span class="switch" :class="{ on: autostart }" @click="toggleAutostart"></span>
      </div>
      <div class="set-row">
        <span>🔔</span>
        <span class="grow">提醒写日记<div class="s">每天到点本地通知（应用运行时生效，未运行不提醒）</div></span>
        <span class="switch" :class="{ on: reminder.enabled }" @click="toggleReminder"></span>
      </div>
      <div v-if="reminder.enabled" class="set-row">
        <span>⏰</span>
        <span class="grow">提醒时间<div class="s">今天没有日记时才会提醒</div></span>
        <input type="time" :value="reminder.time" @change="setReminderTime($event.target.value)">
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
      <div class="set-row">
        <span>💾</span>
        <span class="grow">备份<div class="s">数据库 + 全部照片打包为 zip；每日首次启动自动快照（保留最近 7 份）</div></span>
        <button class="btn sm" :disabled="busy" @click="createBackup">立即备份</button>
      </div>
      <div class="set-row">
        <span>♻️</span>
        <span class="grow">从备份恢复<div class="s">选择备份 zip，覆盖当前全部数据后自动重启</div></span>
        <button class="btn sm ghost" :disabled="busy" @click="pickBackup">选择备份…</button>
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
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import { THEMES } from '../constants'

const router = useRouter()
const app = useAppStore()
const ui = useUiStore()
const dataDir = ref('')
const version = ref('')
const reminder = reactive({ enabled: false, time: '21:00' })
const autostart = ref(false)
const busy = ref(false)

async function loadAutostart() {
  const r = await window.api.app.autostart.get()
  autostart.value = r.enabled
}

async function toggleAutostart() {
  const next = !autostart.value
  const r = await window.api.app.autostart.set(next)
  if (r.ok) {
    autostart.value = r.enabled
    ui.showToast(r.enabled ? '将在开机时自动启动' : '已关闭开机启动')
  } else {
    ui.showToast('开发模式下不可用，安装打包版后生效')
  }
}

async function loadReminder() {
  const r = await window.api.reminder.get()
  reminder.enabled = r.enabled
  reminder.time = r.time
}

async function toggleReminder() {
  const next = !reminder.enabled
  if (next) {
    const r = await window.api.reminder.set({ enabled: true, time: reminder.time })
    if (r.ok) reminder.enabled = true
  } else {
    await window.api.reminder.set({ enabled: false, time: reminder.time })
    reminder.enabled = false
  }
}

async function setReminderTime(t) {
  if (!t) return
  reminder.time = t
  const r = await window.api.reminder.set({ enabled: reminder.enabled, time: t })
  if (r.ok) ui.showToast('提醒时间已设为 ' + t)
}

async function createBackup() {
  if (busy.value) return
  busy.value = true
  ui.showToast('正在备份…')
  try {
    const r = await window.api.backup.create()
    if (r.canceled) ui.showToast('已取消')
    else if (r.ok) ui.showToast('备份完成：' + r.path.split(/[\\/]/).pop())
    else ui.showToast(r.error || '备份失败')
  } catch (e) {
    ui.showToast('备份失败：' + (e?.message || e))
  } finally {
    busy.value = false
  }
}

async function pickBackup() {
  if (busy.value) return
  busy.value = true
  try {
    const r = await window.api.backup.pick()
    if (r.canceled) return
    if (!r.ok) {
      ui.askConfirm({ title: '备份无效', body: r.error, cancelText: '关闭' })
      return
    }
    const okAsk = await ui.askConfirm({
      title: '恢复备份',
      body: `该备份包含 ${r.entries} 篇日记、${r.media} 条照片记录。\n\n恢复将覆盖当前全部数据，确定吗？`,
      confirmText: '恢复',
      danger: true
    })
    if (!okAsk) return
    ui.showToast('正在恢复，应用即将重启…')
    await new Promise((res) => setTimeout(res, 600))
    await window.api.backup.restore(r.path)
  } finally {
    busy.value = false
  }
}

function openDataDir() {
  window.api.app.openDataDir()
}

onMounted(async () => {
  dataDir.value = await window.api.app.dataDir()
  version.value = await window.api.app.version()
  await loadReminder()
  await loadAutostart()
})
</script>

<style>
.set-row input[type="time"]{
  border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:12.5px;
  background:var(--card);color:var(--text-main);outline:none;
}
</style>
