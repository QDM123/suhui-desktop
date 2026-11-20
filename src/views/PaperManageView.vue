<template>
  <div class="view" style="max-width:640px;margin:0 auto;width:100%;">
    <div class="view-head">
      <button class="tool-btn" title="返回" @click="router.push('/settings')">‹</button>
      <h1>信纸 DIY</h1>
      <span class="sub">上传图片或参数生成自定义信纸，编辑日记时可选</span>
    </div>

    <!-- 上传图片 -->
    <div class="set-group">
      <div class="set-row">
        <span>🖼️</span>
        <span class="grow">上传图片作信纸<div class="s">选择本地图片，铺满整页（建议浅色/低对比图片，正文更清晰）</div></span>
        <input v-model="imgName" class="mgmt-input" placeholder="名称（可选）">
        <button class="btn sm" @click="addImage">选择图片…</button>
      </div>
    </div>

    <!-- 参数生成 -->
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">参数生成</div>
      <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">
        <div class="gen-preview" :style="previewStyle"></div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <input v-model="genName" class="mgmt-input" style="flex:1" placeholder="信纸名称">
            <button class="btn sm" :disabled="!genName.trim()" @click="saveGen">保存</button>
          </div>
          <div style="display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--text-secondary);">
            <label>底色 <input type="color" v-model="genBase"></label>
            <label>纹理色 <input type="color" v-model="genPatternColor"></label>
          </div>
          <div class="chip-row">
            <span v-for="p in PATTERNS" :key="p.v" class="chip" :class="{ on: genPattern === p.v }"
                  @click="genPattern = p.v">{{ p.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 我的信纸 -->
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;letter-spacing:1px;">
      我的信纸 · {{ ps.customs.length }} 款（{{ BUILTIN_COUNT }} 款内置可在编辑器「⋯」中选用）
    </div>
    <div class="set-group">
      <div v-for="c in ps.customs" :key="c.id" class="set-row">
        <div class="mini-thumb" :class="ps.resolve(`custom:${c.id}`).cls" :style="ps.resolve(`custom:${c.id}`).style"></div>
        <span class="grow">{{ c.name }}<div class="s">{{ c.kind === 'image' ? '图片信纸' : '参数生成' }}</div></span>
        <button class="btn sm danger" @click="remove(c)">删除</button>
      </div>
      <div v-if="!ps.customs.length" class="empty" style="padding:30px;">还没有自定义信纸</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePaperStore } from '../stores/papers'
import { useUiStore } from '../stores/ui'
import { BUILTIN_PAPERS } from '../constants'

const router = useRouter()
const ps = usePaperStore()
const ui = useUiStore()

const BUILTIN_COUNT = BUILTIN_PAPERS.length
const PATTERNS = [
  { v: 'none', label: '纯色' },
  { v: 'lines', label: '横线' },
  { v: 'dots', label: '圆点' },
  { v: 'grid', label: '方格' }
]

const imgName = ref('')
const genName = ref('')
const genBase = ref('#fffdf8')
const genPatternColor = ref('#00a99d')
const genPattern = ref('lines')

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
const previewStyle = computed(() => {
  const pc = hexToRgba(genPatternColor.value, 0.16)
  const s = { backgroundColor: genBase.value, backgroundImage: 'none' }
  if (genPattern.value === 'lines') {
    s.backgroundImage = `repeating-linear-gradient(transparent, transparent 14px, ${pc} 14px 15px)`
  } else if (genPattern.value === 'dots') {
    s.backgroundImage = `radial-gradient(${pc} 1.2px, transparent 1.2px)`
    s.backgroundSize = '12px 12px'
  } else if (genPattern.value === 'grid') {
    s.backgroundImage =
      `repeating-linear-gradient(0deg, transparent, transparent 14px, ${pc} 14px 15px),` +
      `repeating-linear-gradient(90deg, transparent, transparent 14px, ${pc} 14px 15px)`
  }
  return s
})

async function addImage() {
  try {
    const r = await window.api.papers.addImage(imgName.value.trim() || null)
    if (r.canceled) return
    imgName.value = ''
    ui.showToast('信纸已添加')
    await ps.load(true)
  } catch (e) {
    ui.showToast(e?.message || '添加失败')
  }
}

async function saveGen() {
  if (!genName.value.trim()) return
  try {
    await window.api.papers.addGen(genName.value.trim(), {
      base: genBase.value,
      pattern: genPattern.value,
      patternColor: genPatternColor.value
    })
    genName.value = ''
    ui.showToast('信纸已保存')
    await ps.load(true)
  } catch (e) {
    ui.showToast(e?.message || '保存失败')
  }
}

async function remove(c) {
  const okAsk = await ui.askConfirm({
    title: '删除信纸',
    body: `确定删除「${c.name}」？\n正在使用它的日记将回退为默认信纸。`,
    confirmText: '删除',
    danger: true
  })
  if (!okAsk) return
  await ps.remove(c.id)
  ui.showToast('已删除')
}

onMounted(() => ps.load(true))
</script>

<style>
.mini-thumb{width:44px;height:58px;border-radius:5px;background-size:cover;flex:none;box-shadow:var(--shadow);}
.gen-preview{width:120px;height:160px;border-radius:9px;box-shadow:var(--shadow);flex:none;border:1px solid var(--line);}
.gen-preview input, .set-row input[type="color"]{cursor:pointer;}
</style>
