import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, isNotebookLocked } from './store/app'
import { appThemes } from './themes'
import { Layout } from './components/Layout'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { RecycleBinSettingsDialog } from './components/RecycleBinSettingsDialog'
import { GitSettingsDialog } from './components/GitSettingsDialog'
import { ToastContainer, toast } from './components/Toast'
import { ConfirmDialogManager } from './components/ConfirmDialog'
import { SshConfirmManager } from './components/SshConfirmManager'
import { AlertDialogManager, alert } from './components/AlertDialog'
import { UrlNoteDialog } from './components/UrlNoteDialog'
import { FlashThoughtDialog } from './components/FlashThoughtDialog'
import { HistoryPanel } from './components/gitHistory/HistoryPanel'
import { PasswordDialog } from './components/PasswordDialog'
import { useState } from 'react'
import { FlashThought } from '@shared/types'

/**
 * 拉取/同步成功后，把"当前打开的标签页"的内容刷新为磁盘上的最新版本。
 *
 * 背景：pull 会更新磁盘文件并重建 notes 数组，但当前激活标签的 currentNote
 * 是独立引用的旧对象，编辑器/预览不会自动刷新 → 用户看到"B 端没有 A 端的更新"。
 * 这里从刷新后的 notes 里取最新内容写回 currentNote，打开中的标签立即显示远端内容。
 */
function refreshOpenNoteFromPulledData(): void {
  const state = useAppStore.getState()
  const cur = state.currentNote
  if (!cur) return
  const fresh = state.notes.find(n => n.id === cur.id)
  if (!fresh) return
  // 内容/标题没变就不动，避免无谓刷新打断正在编辑的本地草稿
  if (fresh.content === cur.content && fresh.title === cur.title) return
  state.updateCurrentNoteDraft({ content: fresh.content, title: fresh.title })
}

/**
 * 同步/拉取/推送前，先把当前打开的笔记落盘。
 *
 * 竞态根因：pull 把 A 端内容落到磁盘后，编辑器内存里仍是旧内容，若 autosave 在
 * pull → commitAll 的窗口写回文件，commitAll+push 会把旧内容推上远程覆盖 A 的更新。
 * 这里在同步开始前先把当前编辑落盘（合并冲突由 pull 的 theirs 优先处理），
 * 配合编辑器在 syncing 期间禁写，彻底关掉这个窗口。
 */
async function flushCurrentNoteBeforeSync(): Promise<void> {
  const state = useAppStore.getState()
  const cn = state.currentNote
  if (!cn) return
  // notes 数组是最近一次落盘的内容；currentNote 是编辑器实时草稿。
  // 仅当两者不一致（存在未保存编辑）才写盘，避免每次同步都制造 git 噪声。
  const saved = state.notes.find(n => n.id === cn.id)
  if (saved && saved.content === cn.content && saved.title === cn.title) return
  await state.updateNote(cn.id, { content: cn.content, title: cn.title }).catch(() => {})
}

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
  const refreshSyncStatus = useAppStore(s => s.refreshSyncStatus)
  /** 全局密码弹窗（新建笔记遇到加密笔记本时挂起，等这里输入密码） */
  const unlockPrompt = useAppStore(s => s.unlockPrompt)

  const [gitDialogOpen, setGitDialogOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [recycleBinSettingsOpen, setRecycleBinSettingsOpen] = useState(false)
  const [urlNoteDialogOpen, setUrlNoteDialogOpen] = useState(false)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)
  const [flashThoughtDialogOpen, setFlashThoughtDialogOpen] = useState(false)
  const [flashThoughtEditing, setFlashThoughtEditing] = useState<FlashThought | null>(null)

  const loadRecycleBin = useAppStore(s => s.loadRecycleBin)
  const loadFlashThoughts = useAppStore(s => s.loadFlashThoughts)
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

  // 监听"打开快捷键"自定义事件（设置面板跳转用）
  useEffect(() => {
    const handler = () => setShortcutsOpen(true)
    window.addEventListener('inkslate:open-shortcuts', handler)
    return () => window.removeEventListener('inkslate:open-shortcuts', handler)
  }, [])

  // 监听"打开关于"自定义事件
  useEffect(() => {
    const handler = () => setAboutOpen(true)
    window.addEventListener('inkslate:open-about', handler)
    return () => window.removeEventListener('inkslate:open-about', handler)
  }, [])

  // 初始化加载
  useEffect(() => {
    (async () => {
      // 必须串行：loadSettings 拿到 openTabs/activeTabId 后，
      // 再加载 notebooks/notes/recycleBin，最后恢复选中的笔记
      await loadSettings()
      // 恢复用户选择的全局字体
      {
        const s = useAppStore.getState().settings
        const { FONT_OPTIONS, applyFontToCSS, applyEditorWeightVar } = await import('./components/SettingsDialog')
        const applyCSSVar = (cssVar: string, fontValue: string | undefined) => {
          // 未设置（跟随默认）时不写变量；显式选过某一项就写入 —— 包含「系统默认」，
          // 与设置面板里切换时的行为保持一致，否则重启后编辑区域字体会退回等宽。
          if (!fontValue) return
          applyFontToCSS(cssVar, fontValue)
        }
        applyCSSVar('--font-family', s?.fontFamily)
        if (s?.fontFamily) {
          const opt = FONT_OPTIONS.find(o => o.value === s.fontFamily)
          if (opt?.mono) {
            document.documentElement.style.setProperty('--font-mono', opt.stack)
          }
        }
        applyCSSVar('--editor-font', s?.editorFontFamily)
        applyEditorWeightVar(s?.editorFontFamily, s?.fontFamily)
        applyCSSVar('--tree-font', s?.treeFontFamily)
        if (s?.treeFontSize) {
          document.documentElement.style.setProperty('--tree-font-size', `${s.treeFontSize}px`)
        }
      }
      await Promise.all([loadNotebooks(), loadNotes(), loadRecycleBin()])
      // 恢复多标签页：优先用 activeTabId；不在 openTabs 里则取第一个；都没有则用 lastSelectedNoteId
      const state = useAppStore.getState()
      const allNoteIds = new Set(state.notes.map(n => n.id))
      const openTabs = state.openTabs.filter(id => allNoteIds.has(id))
      const active = state.activeTabId && allNoteIds.has(state.activeTabId)
        ? state.activeTabId
        : (openTabs[0] || null)
      if (active) {
        // 把过滤后的 openTabs 写回去（剔除已被删除的）
        if (openTabs.join(',') !== state.openTabs.join(',')) {
          useAppStore.setState({ openTabs })
        }
        await state.selectNote(active)
      } else {
        // 没有可恢复的 tab → 用 lastSelectedNoteId 兜底
        const lastId = state.settings?.lastSelectedNoteId
        if (lastId && allNoteIds.has(lastId)) {
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
    // 监听自定义事件打开 Git 设置（StatusBar 按钮触发）
    const openGit = () => setGitDialogOpen(true)
    window.addEventListener('inkslate:open-git-settings', openGit)

    // 监听 IconSidebar 的新建网址/文件笔记事件
    const openUrlDialog = () => setUrlNoteDialogOpen(true)
    window.addEventListener('inkslate:new-url-note', openUrlDialog)

    const openHistory = () => setHistoryPanelOpen(true)
    window.addEventListener('inkslate:open-history', openHistory)

    const openFlashThoughtDialog = () => {
      setFlashThoughtEditing(null)
      setFlashThoughtDialogOpen(true)
    }
    window.addEventListener('inkslate:new-flash-thought', openFlashThoughtDialog)

    const editFlashThought = (e: Event) => {
      const ft = (e as CustomEvent).detail as FlashThought
      setFlashThoughtEditing(ft)
      setFlashThoughtDialogOpen(true)
    }
    window.addEventListener('inkslate:edit-flash-thought', editFlashThought)

    const handleFileNote = async () => {
      const [sourcePath] = await window.inkslateApi.file.openDialog({
        title: '选择要导入的文件',
        properties: ['openFile']
      })
      if (!sourcePath) return
      const state = useAppStore.getState()
      const notebookId = state.notebooks[0]?.id
      if (!notebookId) {
        toast.error('没有可用的笔记本，请先创建一个')
        return
      }
      // 文件名（**保留后缀**）作为 title —— Layout 那里有 fileName 字段会显示完整路径，
      // 这里 title 设成带后缀的文件名保证唯一且可读
      const title = sourcePath.split(/[\\/]/).pop() || '未命名文件'
      try {
        // 加密笔记本：先要密码，否则主进程会拒绝新建（没法加密新内容）
        if (await isNotebookLocked(notebookId)) {
          const ok = await useAppStore.getState().requestNotebookUnlock(notebookId)
          if (!ok) return
        }
        const note = await window.inkslateApi.notes.create(title, notebookId, null, undefined, 'file')
        const fileInfo = await window.inkslateApi.fileNote.create(note.id, sourcePath)
        if (!fileInfo) {
          toast.error('文件导入失败：无法读取源文件')
          return
        }
        await state.loadNotes()
        await state.selectNote(note.id)
        toast.success('文件笔记已导入')
      } catch (e) {
        toast.error('文件导入失败：' + (e as Error).message)
      }
    }
    window.addEventListener('inkslate:new-file-note', handleFileNote)

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
            spreadsheet: '未命名智能表格',
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
          // OSS 同步已废弃，重定向到 Git 同步设置
          setGitDialogOpen(true)
          break
        case 'git-settings':
          setGitDialogOpen(true)
          break
        case 'git-push':
          setSyncStatus({ state: 'syncing', message: '推送中...' })
          // 推送前落盘当前编辑，并把编辑器切到"同步中禁写"状态
          flushCurrentNoteBeforeSync().then(() => {
            window.inkslateApi.git.push(true).then(async r => {
              if (!r.ok) {
                const errMsg = r.message || '未知错误'
                setSyncStatus({ state: 'error', message: '推送失败', detail: errMsg })
                toast.error('推送失败：' + errMsg)
              } else {
                setSyncStatus({ state: 'success', message: '推送成功', lastSyncAt: Date.now() })
                toast.success('推送成功')
                // 主进程已写 lastSyncAt 到 settings；这里刷新 pendingFiles
                await refreshSyncStatus()
                // 把 lastSyncAt 也同步进本地 settings（UI 上其他组件可能用）
                const cur = useAppStore.getState().settings
                if (cur) useAppStore.setState({ settings: { ...cur, gitSync: { ...cur.gitSync, lastSyncAt: Date.now() } } })
              }
            }).catch(e => {
              const errMsg = e?.message ?? '未知错误'
              setSyncStatus({ state: 'error', message: '推送失败', detail: errMsg })
              toast.error('推送失败：' + errMsg)
            })
          })
          break
        case 'git-pull':
          setSyncStatus({ state: 'syncing', message: '拉取中...' })
          flushCurrentNoteBeforeSync().then(() => {
            window.inkslateApi.git.pull().then(async r => {
            if (!r.ok) {
              const errMsg = r.message || '未知错误'
              setSyncStatus({ state: 'error', message: '拉取失败', detail: errMsg })
              toast.error('拉取失败：' + errMsg)
            } else {
              // pull 阶段获取了新 commit 或 reconcile 重建了数据 → 刷新 UI
              if (r.updated || r.reconciled) {
                setSyncStatus({ state: 'success', message: '已更新', lastSyncAt: Date.now() })
                toast.success('已从远端更新')
                if (r.conflicts > 0) {
                  const names = r.conflictTitles?.length ? `：${r.conflictTitles.join('、')}` : ''
                  toast.info(`检测到 ${r.conflicts} 处冲突，本地版本已保留为「原名-001」副本笔记（与原笔记同目录、格式一致，智能表格副本可直接打开编辑对比），请手动删除不需要的一份${names}`, 6000)
                }
                await useAppStore.getState().loadNotebooks()
                await useAppStore.getState().loadNotes()
                refreshOpenNoteFromPulledData()
                await refreshSyncStatus()
                const cur = useAppStore.getState().settings
                if (cur) useAppStore.setState({ settings: { ...cur, gitSync: { ...cur.gitSync, lastSyncAt: Date.now() } } })
              } else {
                setSyncStatus({ state: 'success', message: '已是最新', lastSyncAt: Date.now() })
                toast.info('已是最新，无需更新')
                if (r.conflicts > 0) {
                  const names = r.conflictTitles?.length ? `：${r.conflictTitles.join('、')}` : ''
                  toast.info(`检测到 ${r.conflicts} 处冲突，本地版本已保留为「原名-001」副本笔记（与原笔记同目录、格式一致，智能表格副本可直接打开编辑对比），请手动删除不需要的一份${names}`, 6000)
                }
                await refreshSyncStatus()
                const cur = useAppStore.getState().settings
                if (cur) useAppStore.setState({ settings: { ...cur, gitSync: { ...cur.gitSync, lastSyncAt: Date.now() } } })
              }
            }
          }).catch(e => {
            const errMsg = e?.message ?? '未知错误'
            setSyncStatus({ state: 'error', message: '拉取失败', detail: errMsg })
            toast.error('拉取失败：' + errMsg)
          })
          })
          break
        case 'git-sync':
          // 一键同步：先 pull（拿 A 端的最新）再 push（把自己的变更 + 拉来的合并提交推上去）
          // 避免在 B 端直接 push 把 A 端的修改覆盖
          setSyncStatus({ state: 'syncing', message: '同步中...' })
          flushCurrentNoteBeforeSync().then(() => {
            window.inkslateApi.git.sync().then(async r => {
            if (!r.ok) {
              const errMsg = r.message || '未知错误'
              const phaseLabel = r.phase === 'commit' ? '提交'
                : r.phase === 'pull' ? '拉取'
                : r.phase === 'push' ? '推送'
                : ''
              setSyncStatus({
                state: 'error',
                message: phaseLabel ? `${phaseLabel}失败` : '同步失败',
                detail: errMsg
              })
              toast.error((phaseLabel ? `${phaseLabel}失败：${errMsg}` : `同步失败：${errMsg}`))
              // 即使失败也刷一下（让 pendingFiles 反映提交/拉取后的状态）
              await refreshSyncStatus()
            } else {
              setSyncStatus({ state: 'success', message: '同步成功', lastSyncAt: Date.now() })
              toast.success('同步成功')
              if (r.conflicts > 0) {
                const names = r.conflictTitles?.length ? `：${r.conflictTitles.join('、')}` : ''
                toast.info(`检测到 ${r.conflicts} 处冲突，本地版本已保留为「原名-001」副本笔记（与原笔记同目录、格式一致，智能表格副本可直接打开编辑对比），请手动删除不需要的一份${names}`, 6000)
              }
              // 如果 pull 阶段拉到了新数据，重建树
              if (r.pulled) {
                await useAppStore.getState().loadNotebooks()
                await useAppStore.getState().loadNotes()
                refreshOpenNoteFromPulledData()
              }
              // commit/push 完成 → pendingFiles 应为 0
              await refreshSyncStatus()
              // 同步 lastSyncAt 到本地 settings
              const cur = useAppStore.getState().settings
              if (cur) useAppStore.setState({ settings: { ...cur, gitSync: { ...cur.gitSync, lastSyncAt: Date.now() } } })
            }
          }).catch(async e => {
            const errMsg = e?.message ?? '未知错误'
            setSyncStatus({ state: 'error', message: '同步失败', detail: errMsg })
            toast.error('同步失败：' + errMsg)
            await refreshSyncStatus()
          })
          })
          break
        case 'show-shortcuts':
          setShortcutsOpen(true)
          break
        case 'show-settings':
          setSettingsOpen(true)
          break
        case 'show-about':
          setAboutOpen(true)
          break
        case 'open-recycle-bin':
          loadRecycleBin()
          setViewMode('recycle-bin')
          break
        case 'open-flash-thoughts':
          loadFlashThoughts()
          setViewMode('flash-thoughts')
          break
        case 'recycle-bin-settings':
          setRecycleBinSettingsOpen(true)
          break
        case 'empty-recycle-bin': {
          const empty = useAppStore.getState().emptyRecycleBin
          empty().then((r) => {
            toast.success(`已清理 ${r.notes} 条笔记 + ${r.notebooks} 个笔记本`)
          }).catch((e) => {
            toast.error('清空失败：' + (e as Error).message)
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
    return () => {
      window.removeEventListener('inkslate:open-git-settings', openGit)
      window.removeEventListener('inkslate:new-url-note', openUrlDialog)
      window.removeEventListener('inkslate:new-file-note', handleFileNote)
      window.removeEventListener('inkslate:open-history', openHistory)
      window.removeEventListener('inkslate:new-flash-thought', openFlashThoughtDialog)
      window.removeEventListener('inkslate:edit-flash-thought', editFlashThought)
      cleanup()
    }
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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('inkslate:open-search'))
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

  // 自动同步：每 5 分钟检测一次，有未同步数据时自动先拉后推
  useEffect(() => {
    const autoSync = async () => {
      try {
        const s = useAppStore.getState().settings
        if (!s?.gitSync?.configured || !s?.gitSync?.initialized) return
        await refreshSyncStatus()
        const status = useAppStore.getState().syncStatus
        const pending = status.pendingFiles ?? 0
        if (pending > 0 && status.state !== 'syncing') {
          setSyncStatus({ state: 'syncing', message: '自动同步中...', pendingFiles: pending })
          const r = await window.inkslateApi.git.sync()
          if (r.ok) {
            setSyncStatus({ state: 'success', message: r.message, lastSyncAt: Date.now() })
            // 自动同步拉到新数据（含删除墓碑）后同样要重载笔记树，否则要重启才显示
            if (r.pulled) {
              await useAppStore.getState().loadNotebooks()
              await useAppStore.getState().loadNotes()
              refreshOpenNoteFromPulledData()
            }
          } else {
            setSyncStatus({ state: 'error', message: '自动同步失败', detail: r.message })
          }
          await refreshSyncStatus()
        }
      } catch (e) {
        // 静默失败，下次周期重试
      }
    }
    autoSync() // 启动后立即检查一次
    const timer = setInterval(autoSync, 300_000) // 5 分钟
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Layout />
      </div>
      <StatusBar />
      <ToastContainer />
      <ConfirmDialogManager />
      <SshConfirmManager />
      <AlertDialogManager />
      {unlockPrompt && createPortal(
        <PasswordDialog
          mode="unlock"
          notebookName={unlockPrompt.notebookName}
          onSubmit={async (password) => {
            const r = await window.inkslateApi.notebookPassword.unlock(unlockPrompt.notebookId, password)
            // 校验通过：兑现挂起的操作（弹窗自己会在提示后关闭）
            if (r.ok) useAppStore.getState().resolveUnlockPrompt(true)
            return r
          }}
          onClose={() => useAppStore.getState().closeUnlockPrompt()}
        />,
        document.body
      )}
      {gitDialogOpen && createPortal(
        <GitSettingsDialog onClose={() => setGitDialogOpen(false)} />,
        document.body
      )}
      {shortcutsOpen && createPortal(
        <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />,
        document.body
      )}
      {settingsOpen && createPortal(
        <SettingsDialog onClose={() => setSettingsOpen(false)} />,
        document.body
      )}
      {aboutOpen && createPortal(
        <AboutDialog onClose={() => setAboutOpen(false)} />,
        document.body
      )}
      {recycleBinSettingsOpen && createPortal(
        <RecycleBinSettingsDialog onClose={() => setRecycleBinSettingsOpen(false)} />,
        document.body
      )}
      {urlNoteDialogOpen && createPortal(
        <UrlNoteDialog onClose={() => setUrlNoteDialogOpen(false)} />,
        document.body
      )}
      {flashThoughtDialogOpen && createPortal(
        <FlashThoughtDialog flashThought={flashThoughtEditing ?? undefined} onClose={() => { setFlashThoughtDialogOpen(false); setFlashThoughtEditing(null) }} />,
        document.body
      )}
      {historyPanelOpen && createPortal(
        (() => {
          const note = useAppStore.getState().currentNote
          if (!note || !['url', 'file'].includes(note.format))
            return (
              <HistoryPanel
                noteId={note?.id ?? ''}
                notePath={note?.path ?? ''}
                noteFormat={(note?.format as 'markdown' | 'html' | 'richtext' | 'code') ?? 'markdown'}
                currentContent={note?.content ?? ''}
                onClose={() => setHistoryPanelOpen(false)}
              />
            )
          // fallback（应该不会到这里）
          return null
        })(),
        document.body
      )}
    </div>
  )
}
