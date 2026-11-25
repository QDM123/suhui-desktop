<template>
  <div class="view" style="max-width:760px;margin:0 auto;width:100%;">
    <div class="view-head">
      <button class="tool-btn" title="返回" @click="back">‹</button>
      <h1>备份</h1>
      <span class="sub">{{ st.dir || '未设置镜像目录' }}</span>
    </div>

    <!-- 未开启：引导配置 -->
    <div v-if="!st.enabled" class="card bk-empty">
      <b>备份未开启</b><br>
      选择一个镜像目录后，溯洄会把数据库、照片与信纸自动同步到那里，始终保持一份最新副本。<br>
      <span class="dim">建议放在另一块磁盘或云同步文件夹（同一块盘上的两个目录无法防磁盘损坏）。</span>
      <div style="margin-top:16px;">
        <button class="btn sm" :disabled="busy" @click="chooseDir">选择目录并开启</button>
      </div>
    </div>

    <template v-else>
      <!-- 状态条 -->
      <div class="bk-stats">
        <div class="bk-st hl"><span class="k">状态</span><b>已开启</b></div>
        <div class="bk-st"><span class="k">最后同步</span><b>{{ st.lastSync ? fmtAgo(st.lastSync) : '尚未同步' }}</b></div>
        <div class="bk-st"><span class="k">占用空间</span><b>{{ fmtSize(st.totalSize) }}</b></div>
        <span class="grow"></span>
        <button class="btn sm" :disabled="busy" @click="syncNow">{{ busy ? '同步中…' : '立即同步' }}</button>
      </div>

      <!-- 已同步内容 -->
      <div class="bk-list">
        <div class="bk-row">
          <span class="tm">数据库</span>
          <span class="grow dim">suhui.db（文字内容）</span>
          <span class="sz">{{ fmtSize(st.dbSize) }}</span>
        </div>
        <div class="bk-row">
          <span class="tm">照片</span>
          <span class="grow dim">media/</span>
          <span class="sz">{{ st.mediaCount }} 个文件</span>
        </div>
        <div class="bk-row">
          <span class="tm">信纸</span>
          <span class="grow dim">papers/</span>
          <span class="sz">{{ st.papersCount }} 个文件</span>
        </div>
      </div>

      <div v-if="st.error" class="bk-error">⚠ {{ st.error }}</div>

      <!-- 操作 -->
      <div class="bk-actions">
        <button class="btn sm plain" :disabled="busy" @click="verify">校验</button>
        <button class="btn sm plain" :disabled="busy" @click="openDir">打开目录</button>
        <button class="btn sm ghost" :disabled="busy" @click="restore">从镜像恢复</button>
      </div>

      <p class="bk-tip">
        💡 每次修改后约 2 秒自动同步，关闭应用前会再落盘一次。镜像只保留最新一份副本：主目录删除照片时镜像同步删除；
        与主目录内容不一致时可用「校验」检查。
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../stores/ui'
import type { MirrorStatus } from '../types/domain'

const router = useRouter()
const ui = useUiStore()
const busy = ref(false)
const st = reactive<MirrorStatus>({
  enabled: false, dir: '', lastSync: null,
  dbSize: 0, mediaCount: 0, papersCount: 0, totalSize: 0, error: null
})

let timer: number | null = null

/* 从哪进入回哪：无来源时回设置 */
function back() { router.push((router.options.history.state.back as string | null) || '/settings') }

function fmtSize(n: number): string {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前'
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前'
  return Math.floor(s / 86400) + ' 天前'
}

async function load() {
  Object.assign(st, await window.api.mirror.status())
}

async function chooseDir() {
  if (busy.value) return
  const r = await window.api.mirror.chooseDir()
  if ('canceled' in r) return
  busy.value = true
  try {
    const s = await window.api.mirror.setSettings({ dir: r.path, enabled: true })
    if (!s.ok) { ui.showToast(s.error); return }
    ui.showToast('已开启备份，正在同步…')
    await load()
  } finally {
    busy.value = false
  }
}

async function syncNow() {
  if (busy.value) return
  busy.value = true
  ui.showToast('正在同步…')
  try {
    const r = await window.api.mirror.syncNow()
    ui.showToast(r.ok ? '同步完成' : (r.error || '同步失败'))
    await load()
  } finally {
    busy.value = false
  }
}

async function verify() {
  if (busy.value) return
  busy.value = true
  try {
    const v = await window.api.mirror.verify()
    if (v.ok) {
      ui.showToast(`校验通过：${v.entries} 篇日记、${v.media} 条照片记录、${v.files} 个照片文件`)
    } else {
      ui.askConfirm({ title: '备份校验未通过', body: v.error, cancelText: '关闭' })
    }
  } finally {
    busy.value = false
  }
}

async function restore() {
  if (busy.value) return
  busy.value = true
  try {
    const v = await window.api.mirror.verify()
    if (!v.ok) {
      ui.askConfirm({ title: '备份无效', body: v.error, cancelText: '关闭' })
      return
    }
    const okAsk = await ui.askConfirm({
      title: '从镜像恢复',
      body: `镜像目录包含 ${v.entries} 篇日记、${v.media} 条照片记录。\n\n恢复将覆盖当前全部数据，确定吗？`,
      confirmText: '恢复',
      danger: true
    })
    if (!okAsk) return
    ui.showToast('正在恢复，应用即将重启…')
    await new Promise((r) => setTimeout(r, 600))
    await window.api.mirror.restore()
  } finally {
    busy.value = false
  }
}

function openDir() { window.api.mirror.openDir() }

onMounted(async () => {
  await load()
  timer = window.setInterval(() => { void load() }, 5000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style>
/* 镜像备份 */
.bk-stats{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.bk-st{display:flex;align-items:baseline;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px;}
.bk-st .k{font-size:12px;color:var(--text-secondary);}
.bk-st b{font-size:15px;color:var(--text-main);}
.bk-st.hl{border-color:var(--accent);}
.bk-st.hl b{color:var(--accent);}
.bk-list{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px;}
.bk-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);}
.bk-row:last-child{border-bottom:0;}
.bk-row .tm{font-size:13px;color:var(--text-main);min-width:72px;flex:none;}
.bk-row .dim{font-size:12.5px;color:var(--text-secondary);}
.bk-row .sz{flex:none;font-size:12px;color:var(--text-secondary);font-variant-numeric:tabular-nums;}
.bk-empty{text-align:center;padding:36px 16px;color:var(--text-secondary);line-height:1.9;}
.bk-empty b{color:var(--text-main);font-size:14px;}
.bk-empty .dim{font-size:12px;}
.bk-error{margin-top:12px;font-size:12.5px;color:#c0392b;background:color-mix(in srgb,#c0392b 8%,transparent);border:1px solid color-mix(in srgb,#c0392b 35%,transparent);border-radius:8px;padding:8px 12px;}
.bk-actions{display:flex;gap:8px;margin-top:14px;}
.bk-tip{font-size:12px;color:var(--text-secondary);line-height:1.8;margin:14px 2px 0;}
</style>
