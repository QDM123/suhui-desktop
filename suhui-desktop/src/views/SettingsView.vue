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
        <input type="time" :value="reminder.time" @change="setReminderTime($event)">
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
        <span>📥</span>
        <span class="grow">从 Markdown 导入<div class="s">按「## 日期」分节的 md 文件，图片随相对路径一起导入；已导入过的内容自动跳过</div></span>
        <button class="btn sm ghost" :disabled="busy" @click="pickImport">选择文件…</button>
      </div>
    </div>

    <!-- 备份 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">备份</div>
    <div class="set-group">
      <div class="set-row" style="cursor:pointer" @click="router.push('/backups')">
        <span>🗂</span><span class="grow">备份管理<div class="s">查看同步状态 / 校验 / 从镜像恢复</div></span>
        <span style="color:var(--text-secondary)">›</span>
      </div>
      <div class="set-row">
        <span>📁</span>
        <span class="grow">镜像目录<div class="s">{{ bk.dir || '未设置' }}</div></span>
        <button class="btn sm plain" @click="chooseBkDir">浏览</button>
      </div>
      <div class="set-row">
        <span>🔄</span>
        <span class="grow">自动镜像<div class="s">每次修改后约 2 秒同步一份最新副本到镜像目录（不产生压缩包）</div></span>
        <span class="switch" :class="{ on: bk.enabled }" @click="toggleEnabled"></span>
      </div>
      <div v-if="!bk.enabled" class="set-row" style="cursor:default">
        <span>⚠️</span>
        <span class="grow" style="color:var(--text-secondary);font-size:12.5px;">备份未开启：请先选择镜像目录并打开开关；镜像目录建议放在另一块磁盘或云同步文件夹</span>
      </div>
    </div>

    <!-- 关于 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">关于</div>
    <div class="set-group">
      <div class="set-row"><span>📖</span><span class="grow">溯洄 · 桌面版<div class="s">个人本地日记应用</div></span><span style="color:var(--text-secondary)">v{{ version }}</span></div>
      <div class="set-row" style="cursor:default">
        <span>💻</span>
        <span class="grow">系统环境<div class="s">{{ sysinfo.os }} · {{ sysinfo.arch }}</div></span>
        <span style="color:var(--text-secondary)">{{ sysinfo.installType }}</span>
      </div>
      <div class="set-row" style="cursor:default">
        <span>🧭</span>
        <span class="grow">规格说明<div class="s">交互规格参考公开行为研究（个人学习用途），界面与素材均为独立实现</div></span>
      </div>
    </div>

    <!-- 快捷键 -->
    <div style="font-size:12px;color:var(--text-secondary);margin:14px 0 8px;letter-spacing:1px;">快捷键</div>
    <div class="set-group">
      <div class="set-row" style="cursor:pointer" @click="router.push('/shortcuts')">
        <span>⌨️</span>
        <span class="grow">快捷键中心<div class="s">全部快捷键集中说明，与按键行为同源维护</div></span>
        <span style="color:var(--text-secondary)">›</span>
      </div>
      <div class="set-row" style="cursor:default">
        <span>💡</span>
        <span class="grow">随时速查<div class="s">任意页面按 F1 或 ? 呼出快捷键速查面板</div></span>
        <span style="color:var(--text-secondary)"><span class="kbd">F1</span> <span class="kbd">?</span></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
const sysinfo = reactive({ os: '', arch: '', installType: '' })

const reminder = reactive({ enabled: false, time: '21:00' })
const autostart = ref(false)
const busy = ref(false)

/* 镜像备份设置（目录 / 开关） */
const bk = reactive({ dir: '', enabled: false })

async function loadBk() {
  const s = await window.api.mirror.getSettings()
  Object.assign(bk, s)
}

async function chooseBkDir() {
  const r = await window.api.mirror.chooseDir()
  if ('canceled' in r) return
  const s = await window.api.mirror.setSettings({ dir: r.path, enabled: true })
  if (!s.ok) { ui.showToast(s.error); return }
  await loadBk()
  ui.showToast('备份已开启，正在同步到：' + r.path)
}

async function toggleEnabled() {
  if (!bk.enabled && !bk.dir) {
    await chooseBkDir()
    return
  }
  const next = !bk.enabled
  const s = await window.api.mirror.setSettings({ enabled: next })
  if (!s.ok) { ui.showToast(s.error); return }
  await loadBk()
  ui.showToast(next ? '已开启自动镜像' : '已关闭自动镜像')
}

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

async function setReminderTime(e: Event) {
  const t = (e.target as HTMLInputElement).value
  if (!t) return
  reminder.time = t
  const r = await window.api.reminder.set({ enabled: reminder.enabled, time: t })
  if (r.ok) ui.showToast('提醒时间已设为 ' + t)
}

async function pickImport() {
  if (busy.value) return
  busy.value = true
  try {
    const r = await window.api.import.pick()
    if ('canceled' in r) return
    if (!r.ok) {
      ui.askConfirm({ title: '无法导入', body: r.error, cancelText: '关闭' })
      return
    }
    const missingTip = r.missing ? `（其中 ${r.missing} 张缺失，将跳过）` : ''
    const okAsk = await ui.askConfirm({
      title: '导入 Markdown 日记',
      body: `该文件包含 ${r.entries} 篇日记、${r.images} 张图片${missingTip}。\n\n重复导入时相同内容会自动跳过，确定开始吗？`,
      confirmText: '导入'
    })
    if (!okAsk) return
    ui.showToast('正在导入…')
    const res = await window.api.import.run(r.path)
    if (res.ok) {
      const parts = [`导入完成：${res.imported} 篇、${res.imagesAdded} 张图片`]
      if (res.skippedDup) parts.push(`跳过重复 ${res.skippedDup} 篇`)
      if (res.imagesMissing) parts.push(`缺失图片 ${res.imagesMissing} 张`)
      ui.showToast(parts.join('，'))
    } else {
      ui.showToast(res.error || '导入失败')
    }
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
  Object.assign(sysinfo, await window.api.app.sysinfo())
  await loadReminder()
  await loadAutostart()
  await loadBk()
})
</script>

<style>
.set-row input[type="time"]{
  border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:12.5px;
  background:var(--card);color:var(--text-main);outline:none;
}
</style>
