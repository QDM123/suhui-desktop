#!/usr/bin/env node
/* 溯洄桌面版 · 发布打包脚本
 *
 * 版本规则：{大版本}.{阶段}.{年份2位}{迭代3位}
 *   例：1.0.26101 = 大版本 1 / 阶段 0 / 26 年 / 第 1 次迭代（101 起，每次 +1，上限 999）
 *   跨年时迭代重置为 101（26105 → 27101）
 *
 * 版本号唯一源头是 package.json：electron-builder 产物命名与软件内
 * app.getVersion() 显示均读取此处，无需其他同步。
 *
 * 用法：npm run release
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROJ_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = path.join(PROJ_DIR, 'package.json')

function fail(msg, code = 1) {
  console.error(`\n✗ ${msg}`)
  process.exit(code)
}

/* ---------- 版本规则 ---------- */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d{2})(\d{3})$/

function parseVersion(v) {
  const m = VERSION_RE.exec(String(v).trim())
  if (!m) return null
  const iter = Number(m[4])
  if (iter < 101 || iter > 999) return null
  return { major: Number(m[1]), stage: Number(m[2]), year: Number(m[3]), iter }
}

function fmtVersion(v) {
  return `${v.major}.${v.stage}.${String(v.year).padStart(2, '0')}${String(v.iter).padStart(3, '0')}`
}

/* 逐段比较：a > b 返回 1，a < b 返回 -1，相等返回 0 */
function compareVersion(a, b) {
  for (const key of ['major', 'stage', 'year', 'iter']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1
  }
  return 0
}

/* 正式版自动迭代（cur 为 null 表示当前版本不合规，按首个版本起步） */
function nextOfficial(cur) {
  const nowYY = new Date().getFullYear() % 100
  if (!cur) return { major: 1, stage: 0, year: nowYY, iter: 101 }
  if (cur.year > nowYY) fail(`当前版本 v${fmtVersion(cur)} 的年份晚于今年（${nowYY}），请用选项 1 手动指定版本号`)
  if (cur.year < nowYY) return { major: cur.major, stage: cur.stage, year: nowYY, iter: 101 } // 跨年重置
  if (cur.iter >= 999) fail(`今年迭代已达上限 999，请用选项 1 手动指定版本号`)
  return { major: cur.major, stage: cur.stage, year: cur.year, iter: cur.iter + 1 }
}

/* ---------- git：只提交 package.json 版本变更 ---------- */
function commitVersion(ver) {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd: PROJ_DIR })
  if (root.status !== 0) {
    console.log('⚠ 未检测到 git 仓库，跳过版本提交（不影响打包）')
    return
  }
  const toplevel = root.stdout.trim()
  const relPath = path.relative(toplevel, PKG_PATH).replace(/\\/g, '/')
  const run = (args) => spawnSync('git', args, { stdio: 'inherit', cwd: toplevel })
  if (run(['add', relPath]).status !== 0 || run(['commit', '-m', `chore(release): v${ver}`]).status !== 0) {
    console.log('⚠ git 提交失败（不影响打包），请手动提交 suhui-desktop/package.json')
    return
  }
  console.log(`✓ 已提交版本变更：chore(release): v${ver}`)
}

/* ---------- 交互输入：队列式逐行读取，兼容 TTY 与管道输入 ---------- */
const rl = readline.createInterface({ input: process.stdin, terminal: false })
const lineQueue = []
const lineWaiters = []
rl.on('line', (line) => {
  const resolve = lineWaiters.shift()
  if (resolve) resolve(line)
  else lineQueue.push(line)
})
rl.on('close', () => {
  while (lineWaiters.length) lineWaiters.shift()(null) // stdin 结束：未应答的提问一律返回 null（视为取消）
})

/** 提问并等待一行输入；stdin 已结束时返回 null */
function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    if (lineQueue.length) { resolve(lineQueue.shift()); return }
    lineWaiters.push(resolve)
  })
}

/* ---------- 主流程 ---------- */
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
const curRaw = String(pkg.version)
const cur = parseVersion(curRaw)

console.log('==============================================')
console.log('        溯洄桌面版 · 发布打包')
console.log('==============================================')
console.log(`当前版本：v${curRaw}${cur ? '' : '（不符合版本规则）'}\n`)
console.log('  [1] 手动输入版本号打包（验证格式 + 必须大于当前版本）')
console.log('  [2] 发布正式版（小版本迭代 +1，跨年重置 101）')
console.log('  [3] 打临时版（版本号不变，重新打包）\n')

const choice = ((await ask('请选择 [1/2/3]: ')) ?? '').trim()
if (!['1', '2', '3'].includes(choice)) { rl.close(); fail('无效选项') }

let target
if (choice === '1') {
  for (;;) {
    const input = await ask('请输入版本号（如 1.0.26101）: ')
    if (input === null) { rl.close(); fail('已取消', 0) }
    const v = parseVersion(input.trim())
    if (!v) { console.log('  ✗ 格式不合法：应为 {大版本}.{阶段}.{年份2位}{迭代3位}，迭代范围 101-999'); continue }
    if (cur && compareVersion(v, cur) <= 0) { console.log(`  ✗ 新版本必须大于当前版本 v${curRaw}`); continue }
    target = v
    break
  }
} else if (choice === '2') {
  if (!cur) console.log('当前版本不符合规则，将按首个版本起步。')
  target = nextOfficial(cur)
}

const isTemp = choice === '3'
const newVer = isTemp ? curRaw : fmtVersion(target)

/* 二次确认 */
console.log('\n----------------------------------------------')
console.log(`  当前版本 : v${curRaw}`)
console.log(`  目标版本 : v${newVer}${isTemp ? '（临时版，版本号不变）' : ''}`)
if (isTemp && !cur) console.log('  ⚠ 当前版本号不符合版本规则，产物将沿用该版本号')
console.log(`  产物     : release/suhui-setup-${newVer}-x64.exe`)
if (!isTemp) console.log('  git      : 提交 package.json → chore(release): v' + newVer)
console.log('----------------------------------------------')
const confirm = ((await ask('确认打包? [y/N]: ')) ?? '').trim().toLowerCase()
rl.close()
if (confirm !== 'y') fail('已取消', 0)

/* 写入版本号 + git 提交 */
if (!isTemp) {
  pkg.version = newVer
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`\n✓ 已写入 package.json → v${newVer}`)
  commitVersion(newVer)
}

/* 打包（NSIS 安装包，同名产物直接覆盖） */
console.log('\n开始打包（dist:win）...\n')
const build = spawnSync('npm', ['run', 'dist:win'], { stdio: 'inherit', shell: true, cwd: PROJ_DIR })
if (build.status !== 0) fail('打包失败，请检查上方构建日志')

console.log('\n==============================================')
console.log(`✓ 打包完成：v${newVer}`)
console.log(`  release/suhui-setup-${newVer}-x64.exe`)
console.log('==============================================')
