import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useEditorStore } from './stores/editor'
import { useUiStore } from './stores/ui'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

/* 编辑器退出守卫（计划 §2.3）：离开 /write 前 flush 待写变更，
   写库失败则阻止离开并给出重试 */
router.beforeEach(async (to, from) => {
  const ed = useEditorStore()
  if (from.path === '/write' && to.path !== '/write' && ed.active) {
    let ok = await ed.flush()
    if (!ok) {
      const ui = useUiStore()
      const retry = await ui.askConfirm({
        title: '保存失败',
        body: (ed.saveError || '未知错误') + '\n\n重试保存并离开？',
        confirmText: '重试并离开'
      })
      if (retry) ok = await ed.flush()
      if (!ok) return false
    }
    ed.closeSilent()
  }
  return true
})
