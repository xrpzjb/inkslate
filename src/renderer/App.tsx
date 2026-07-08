import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from './store/app'
import { appThemes } from './themes'
import { Layout } from './components/Layout'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { OssSettingsDialog } from './components/OssSettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { RecycleBinSettingsDialog } from './components/RecycleBinSettingsDialog'
import { useState } from 'react'

export default function App() {
  const theme = useAppStore(s => s.theme)
  const loadSettings = useAppStore(s => s.loadSettings)
  const loadNotebooks = useAppStore(s => s.loadNotebooks)
  const loadNotes = useAppStore(s => s.loadNotes)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const togglePreview = useAppStore(s => s.togglePreview)
  const toggleEditor = useAppStore(s => s.toggleEditor)
  const setTheme = useAppStore(s => s.setTheme)
  const setSyncStatus = useAppStore(s => s.setSyncStatus)
  const updateSettings = useAppStore(s => s.updateSettings)

  const [ossDialogOpen, setOssDialogOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [recycleBinSettingsOpen, setRecycleBinSettingsOpen] = useState(false)

  const loadRecycleBin = useAppStore(s => s.loadRecycleBin)
  const setViewMode = useAppStore(s => s.setViewMode)

  // 应用主题（auto 走 CSS 媒体查询，其他主题动态注入 CSS 变量）
  useEffect(() => {
    if (theme === 'auto') {
      document.documentElement.setAttribute('data-theme', 'auto')
      // auto 走 global.css 里的 [data-theme='auto'] 媒体查询
      return
    }
    const palette = appThemes[theme as keyof typeof appThemes]
    if (!palette) {
      document.documentElement.setAttribute('data-theme', theme)
      return
    }
    // 动态写 <style> 注入 CSS 变量
    const styleId = 'app-theme-vars'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    const lines = Object.entries(palette)
      .map(([k, v]) => `  --${k}: ${v};`)
      .join('\n')
    styleEl.textContent = `:root, [data-theme='${theme}'] {\n${lines}\n}`
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // 初始化加载
  useEffect(() => {
    (async () => {
      // 必须串行：loadSettings 拿到 lastSelectedNoteId 后，
      // 再加载 notebooks/notes/recycleBin，最后恢复选中的笔记
      await loadSettings()
      await Promise.all([loadNotebooks(), loadNotes(), loadRecycleBin()])
      // 恢复上次选中的笔记
      const lastId = useAppStore.getState().settings?.lastSelectedNoteId
      if (lastId) {
        const state = useAppStore.getState()
        const exists = state.notes.find(n => n.id === lastId)
        if (exists) {
          await state.selectNote(lastId)
        }
      }
    })()
  }, [])

  // 监听系统主题（仅在 theme === 'auto' 时生效）
  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      // 触发 CSS 重新计算
      document.documentElement.setAttribute('data-theme', 'auto')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // 菜单事件订阅
  useEffect(() => {
    const cleanup = window.inkslateApi.onMenu((event, ...args) => {
      const state = useAppStore.getState()
      switch (event) {
        case 'new-note': {
          const arg = args[0] as { format?: string; language?: string } | string | undefined
          const format = (typeof arg === 'object' ? arg?.format : arg) ?? 'markdown'
          const language = typeof arg === 'object' ? arg?.language : undefined
          const titleMap: Record<string, string> = {
            markdown: '未命名笔记',
            html: '未命名 HTML',
            richtext: '未命名富文本',
            code: language ? `${language} 代码片段` : '代码片段'
          }
          state.createNote(
            titleMap[format] ?? '未命名笔记',
            state.notebooks[0]?.id ?? '',
            null,
            undefined,
            format as any,
            language as any
          )
          break
        }
        case 'new-notebook':
          state.createNotebook('新笔记本', null)
          break
        case 'save':
          // 触发当前笔记保存
          if (state.currentNote) {
            window.dispatchEvent(new CustomEvent('inkslate:save-current'))
          }
          break
        case 'theme-change': {
          const next = args[0] as string
          console.log('[theme-change] received:', next, 'current:', state.theme)
          setTheme(next as any)
          updateSettings({ theme: next as any })
          // 通知主进程更新菜单单选状态
          window.inkslateApi.notifyThemeChanged(next)
          break
        }
        case 'toggle-sidebar':
          toggleSidebar()
          break
        case 'toggle-preview':
          togglePreview()
          break
        case 'oss-settings':
          setOssDialogOpen(true)
          break
        case 'show-shortcuts':
          setShortcutsOpen(true)
          break
        case 'open-recycle-bin':
          loadRecycleBin()
          setViewMode('recycle-bin')
          break
        case 'recycle-bin-settings':
          setRecycleBinSettingsOpen(true)
          break
        case 'empty-recycle-bin': {
          const empty = useAppStore.getState().emptyRecycleBin
          empty().then((r) => {
            alert(`已清理 ${r.notes} 条笔记 + ${r.notebooks} 个笔记本`)
          }).catch((e) => {
            alert('清空失败：' + (e as Error).message)
          })
          break
        }
        case 'reload':
          window.location.reload()
          break
        case 'devtools':
          window.inkslateApi.clickMenu('devtools')
          break
        case 'zoom': {
          const dir = args[0] as 'reset' | 'in' | 'out'
          const cur = parseFloat(document.body.style.zoom || '1')
          let next = cur
          if (dir === 'in') next = Math.min(2, cur + 0.1)
          else if (dir === 'out') next = Math.max(0.5, cur - 0.1)
          else next = 1
          document.body.style.zoom = String(next)
          break
        }
        case 'fullscreen':
          if (document.fullscreenElement) document.exitFullscreen()
          else document.documentElement.requestFullscreen()
          break
        case 'edit': {
          // 触发 CodeMirror / contentEditable 的撤销重做等
          const op = args[0] as string
          const target = document.activeElement as HTMLElement | null
          if (!target) break
          const cm = target.closest('.cm-editor') as any
          if (cm) {
            const view = cm.querySelector('.cm-content')
            if (view) {
              // 通过键盘事件触发 CM 内置快捷键
              const map: Record<string, string> = {
                undo: 'Mod-z', redo: 'Mod-Shift-z',
                cut: 'Mod-x', copy: 'Mod-c', paste: 'Mod-v', selectAll: 'Mod-a'
              }
              const key = map[op]
              if (key) {
                const ev = new KeyboardEvent('keydown', {
                  key: op === 'redo' ? 'z' : op[0],
                  ctrlKey: true, shiftKey: op === 'redo', bubbles: true
                })
                view.dispatchEvent(ev)
              }
            }
          } else {
            // 普通 textarea / contenteditable
            const cmd = op === 'undo' ? 'undo'
              : op === 'redo' ? 'redo'
              : op === 'cut' ? 'cut'
              : op === 'copy' ? 'copy'
              : op === 'paste' ? 'paste'
              : op === 'selectAll' ? 'selectAll'
              : null
            if (cmd) {
              try { document.execCommand(cmd, false) } catch {}
            }
          }
          break
        }
        case 'toggle-editor':
          toggleEditor()
          break
        // 其他事件由组件内部监听
      }
    })
    return cleanup
  }, [])

  // 键盘快捷键（Ctrl+P / Ctrl+Shift+E 等本地快捷键）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        togglePreview()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        toggleEditor()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePreview, toggleEditor])

  // 同步状态轮询：主进程通过 sendToRenderer IPC_CHANNELS.OSS_STATUS 推送会触发
  useEffect(() => {
    let lastStatus = ''
    const interval = setInterval(() => {
      const s = useAppStore.getState().syncStatus
      const sig = JSON.stringify(s)
      if (sig !== lastStatus) {
        lastStatus = sig
        setSyncStatus(s)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Layout />
      </div>
      <StatusBar />
            {ossDialogOpen && createPortal(
        <OssSettingsDialog onClose={() => setOssDialogOpen(false)} />,
        document.body
      )}
      {shortcutsOpen && createPortal(
        <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />,
        document.body
      )}
      {recycleBinSettingsOpen && createPortal(
        <RecycleBinSettingsDialog onClose={() => setRecycleBinSettingsOpen(false)} />,
        document.body
      )}
    </div>
  )
}
