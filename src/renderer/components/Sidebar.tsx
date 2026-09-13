import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { useAppStore, buildNoteTree, isNotebookLocked } from '../store/app'
import { NoteTreeNode, Note, Notebook } from '@shared/types'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, FileText,
  Trash2, Edit3, FilePlus, FolderPlus, FileCode2, FileType2, Heading1,
  FileDown, FileCode, Globe, Link2, Paperclip, Palette, History, ArrowRightLeft,
  Lock, Unlock, Clock, Upload, Bot, Table2
} from 'lucide-react'
import { MatIcon } from './MatIcon'
import { IonIcon } from './IonIcon'
import { toast } from './Toast'
import { confirm } from './ConfirmDialog'
import { IconPicker } from './IconPicker'
import { PasswordDialog } from './PasswordDialog'
import { richTextJsonToHtml } from './Preview'

/** 笔记本图标：从 DB 图标名渲染 MatIcon / IonIcon 组件。
 *  - mat:icon_name (轮廓) 或 mat:icon_name:fill (填充)
 *  - io:icon-name (Ionicons)
 *  - 没设图标 → 展开用 FolderOpen，折叠用 Folder
 */
function renderNotebookIcon(iconName: string | null | undefined, isExpanded: boolean) {
  if (!iconName) {
    return isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
  }
  if (iconName.startsWith('io:')) {
    return <IonIcon name={iconName.slice(3)} size={14} />
  }
  if (iconName.startsWith('mat:')) {
    const rest = iconName.slice(4)
    const filled = rest.endsWith(':fill')
    const name = filled ? rest.slice(0, -5) : rest
    return <MatIcon name={name} size={14} filled={filled} />
  }
  return isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
}

/** Markdown 笔记图标：纯字符 "M"，无外壳
 *  stroke 风格，视觉上跟 lucide Globe 一致（24x24 / 2px stroke / 无填充）
 */
function MarkdownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Markdown"
    >
      {/* M：左竖、中间 V、右竖 */}
      <path d="M5 6 L5 18" />
      <path d="M5 6 L12 14" />
      <path d="M12 14 L19 6" />
      <path d="M19 6 L19 18" />
    </svg>
  )
}

/** 代码笔记图标：纯字符 "</>"，无外壳
 *  stroke 风格，视觉上跟 lucide Globe 一致
 */
function CodeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Code"
    >
      {/* < */}
      <path d="M8 6 L2 12 L8 18" />
      {/* > */}
      <path d="M16 6 L22 12 L16 18" />
      {/* / */}
      <path d="M15 4 L9 20" />
    </svg>
  )
}

/** 富文本笔记图标：纯字符 "T"，无外壳（stroke 风格） */
function RichTextIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Rich text"
    >
      {/* T：顶横 + 中竖 */}
      <path d="M4 6 L20 6" />
      <path d="M12 6 L12 19" />
    </svg>
  )
}

export function Sidebar() {
  const notebooks = useAppStore(s => s.notebooks)
  const notes = useAppStore(s => s.notes)
  const selectedNoteId = useAppStore(s => s.selectedNoteId)
  const selectedNotebookId = useAppStore(s => s.selectedNotebookId)
  const selectNote = useAppStore(s => s.selectNote)
  const selectNotebook = useAppStore(s => s.selectNotebook)
  const createNote = useAppStore(s => s.createNote)
  const createNotebook = useAppStore(s => s.createNotebook)
  const renameNotebook = useAppStore(s => s.renameNotebook)
  const renameNote = useAppStore(s => s.renameNote)
  const deleteNotebook = useAppStore(s => s.deleteNotebook)
  const deleteNote = useAppStore(s => s.deleteNote)
  const reorderNotes = useAppStore(s => s.reorderNotes)
  const reorderNotebooks = useAppStore(s => s.reorderNotebooks)
  const moveNote = useAppStore(s => s.moveNote)
  const moveNotebook = useAppStore(s => s.moveNotebook)
  const viewMode = useAppStore(s => s.viewMode)
  const setViewMode = useAppStore(s => s.setViewMode)
  const recycleBinCount = useAppStore(s => s.recycleBinCount)
  const loadRecycleBin = useAppStore(s => s.loadRecycleBin)
  const showTreeCount = useAppStore(s => s.settings?.showTreeCount !== false)
  // 点击去抖：防止快速点击触发多个并发 selectNote 请求
  const selectNoteTimer = useRef<NodeJS.Timeout | null>(null)

  // ============ 拖动排序 ============
  // 简化设计：笔记本和笔记拖动都视为"同级排序"。笔记本顶级拖到另一个笔记本下 → 不支持
  // （要做跨 parent 拖动需要把 NoteTreeNode 的 parentId 改了，那是另一个特性）。
  // 当前支持：
  //   1. 拖动笔记本 → 同 parentId 下重排
  //   2. 拖动笔记 → 拖到目标笔记本下的某个位置
  //   3. 拖动时目标位置的上半部分 = 之前；下半部分 = 之后

  const [dragOverInfo, setDragOverInfo] = useState<{
    targetId: string
    position: 'before' | 'after'
  } | null>(null)
  const draggingRef = useRef<{ id: string; type: 'notebook' | 'note' } | null>(null)
  const tree = useMemo(() => buildNoteTree(notebooks, notes), [notebooks, notes])
  // expanded 状态：初始用 store 里的 expandedNotebooks（持久化的用户偏好），
  // 还没加载好时（store 是空数组）就用 notebooks 全部展开作为兜底
  const storedExpanded = useAppStore(s => s.expandedNotebooks)
  const setExpandedNotebook = useAppStore(s => s.setExpandedNotebook)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(storedExpanded.length > 0 ? storedExpanded : notebooks.map(n => n.id))
  )
  // 当 store.expandedNotebooks 加载完成后（首次 loadSettings 完毕），同步到本地
  // —— 此时不要"重置"成空集，只有 storedExpanded 非空时用
  const syncedFromStoreRef = useRef(false)
  useEffect(() => {
    if (!syncedFromStoreRef.current && storedExpanded.length > 0) {
      setExpanded(new Set(storedExpanded))
      syncedFromStoreRef.current = true
    }
  }, [storedExpanded])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: NoteTreeNode | null } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu) return
    const onDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [contextMenu])

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`
    }
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`
    }
  }, [contextMenu])
  // 笔记本图标选择器：null 时不显示，否则 { notebookId, position }
  const [iconPicker, setIconPicker] = useState<{ notebookId: string; currentIcon: string | null } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; type: 'notebook' | 'note'; value: string } | null>(null)
  // 新建网址笔记：自定义 modal（Electron renderer 不支持 window.prompt）
  const [urlDialog, setUrlDialog] = useState<{
    notebookId: string
    parentId: string | null
    name: string
    value: string
  } | null>(null)
  // 移动弹框
  const [moveDialog, setMoveDialog] = useState<{
    nodeId: string
    nodeType: 'notebook' | 'note'
    nodeName: string
  } | null>(null)
  // 密码弹框
  const [passwordDialog, setPasswordDialog] = useState<{
    notebookId: string
    notebookName: string
    mode: 'set' | 'remove' | 'unlock'
  } | null>(null)
  // PDF 导出水印输入弹框
  const [pdfExportDialog, setPdfExportDialog] = useState<{ nodeId: string; value: string } | null>(null)

  useEffect(() => {
    if (!selectedNoteId) return
    const note = notes.find(n => n.id === selectedNoteId)
    if (!note) return
    // 沿 parentId 链向上找所有笔记本，全部展开。
    // 注意：note 的 parentId 可能是父 note（嵌套笔记），需要跳到 notebookId；笔记本的 parentId 可能是父笔记本。
    const toExpand = new Set<string>()
    let cursor: string | null = note.parentId ?? note.notebookId
    // 防止意外循环
    const seen = new Set<string>()
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor)
      // cursor 可能是 notebook id 也可能是 note id
      const parentNotebook = notebooks.find(n => n.id === cursor)
      if (parentNotebook) {
        toExpand.add(parentNotebook.id)
        cursor = parentNotebook.parentId
        continue
      }
      const parentNote = notes.find(n => n.id === cursor)
      if (parentNote) {
        // 父 note 没有 chevron（不需展开），但要继续向上找
        cursor = parentNote.parentId ?? parentNote.notebookId
        continue
      }
      // 找不到就停
      break
    }
    if (toExpand.size > 0) {
      setExpanded(prev => {
        const next = new Set(prev)
        let changed = false
        for (const id of toExpand) {
          if (!next.has(id)) {
            next.add(id)
            // 持久化（每个新展开的 id 触发一次 store update，可接受）
            setExpandedNotebook(id, true)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
    // 选中变化时关闭重命名（防止输入框卡在另一行）
    setRenaming(prev => (prev && prev.id !== selectedNoteId ? null : prev))
  }, [selectedNoteId, notes, notebooks])

  // 同步 renaming 到 ref，供 commitRename 异步读取最新值
  const renamingRef = useRef<typeof renaming>(null)
  useEffect(() => {
    renamingRef.current = renaming
  }, [renaming])

  // 监听「定位当前笔记」事件：展开所属笔记本及其所有祖先 → 滚动到该笔记行
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const noteId = detail?.noteId
      if (!noteId) return
      const note = notes.find(n => n.id === noteId)
      if (!note) return
      // 展开所属笔记本及全部祖先（嵌套树全收起时也能逐级张开）
      const nbId = note.notebookId
      if (nbId) {
        setExpanded(prev => {
          const next = new Set(prev)
          const seen = new Set<string>()
          let cur: string | null = nbId
          while (cur && !seen.has(cur)) {
            seen.add(cur)
            next.add(cur)
            setExpandedNotebook(cur, true)
            cur = notebooks.find(n => n.id === cur)?.parentId ?? null
          }
          return next
        })
      }
      // 等展开渲染完成后滚动定位（多次 rAF，避免 React 还没提交时元素不存在）
      let tries = 0
      const tryScroll = () => {
        const el = document.querySelector(`[data-note-id="${noteId}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        else if (++tries < 10) requestAnimationFrame(tryScroll)
      }
      requestAnimationFrame(tryScroll)
    }
    window.addEventListener('inkslate:sidebar-locate-note', handler)
    return () => window.removeEventListener('inkslate:sidebar-locate-note', handler)
  }, [notes, notebooks, expanded])

  // 监听「定位到某个节点」事件（面包屑逐级点击）：笔记本 → 展开其所有祖先并滚动；笔记 → 展开所属笔记本并滚动
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const id = detail?.id as string | undefined
      const type = detail?.type as 'notebook' | 'note' | undefined
      if (!id) return

      if (type === 'notebook') {
        // 展开自身及所有祖先笔记本
        setExpanded(prev => {
          const next = new Set(prev)
          const seen = new Set<string>()
          let cur: string | null = id
          while (cur && !seen.has(cur)) {
            seen.add(cur)
            next.add(cur)
            setExpandedNotebook(cur, true)
            cur = notebooks.find(n => n.id === cur)?.parentId ?? null
          }
          return next
        })
        let tries = 0
        const tryScroll = () => {
          const el = document.querySelector(`[data-notebook-id="${id}"]`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          else if (++tries < 10) requestAnimationFrame(tryScroll)
        }
        requestAnimationFrame(tryScroll)
        return
      }

      // 笔记：展开所属笔记本及全部祖先后滚动到该行
      const note = notes.find(n => n.id === id)
      if (!note) return
      const nbId = note.notebookId
      if (nbId) {
        setExpanded(prev => {
          const next = new Set(prev)
          const seen = new Set<string>()
          let cur: string | null = nbId
          while (cur && !seen.has(cur)) {
            seen.add(cur)
            next.add(cur)
            setExpandedNotebook(cur, true)
            cur = notebooks.find(n => n.id === cur)?.parentId ?? null
          }
          return next
        })
      }
      let tries = 0
      const tryScroll = () => {
        const el = document.querySelector(`[data-note-id="${id}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        else if (++tries < 10) requestAnimationFrame(tryScroll)
      }
      requestAnimationFrame(tryScroll)
    }
    window.addEventListener('inkslate:sidebar-locate-node', handler)
    return () => window.removeEventListener('inkslate:sidebar-locate-node', handler)
  }, [notes, notebooks, expanded])

  // 监听「展开/折叠全部」事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const shouldExpand = detail?.expanded
      const allIds = notebooks.map(n => n.id)
      setExpanded(shouldExpand ? new Set(allIds) : new Set())
      // 持久化
      const next = shouldExpand ? allIds : []
      window.inkslateApi.settings.update({ expandedNotebooks: next }).catch(() => {})
    }
    window.addEventListener('inkslate:sidebar-expand-all', handler)
    return () => window.removeEventListener('inkslate:sidebar-expand-all', handler)
  }, [notebooks])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      const willBeExpanded = !next.has(id)
      if (willBeExpanded) next.add(id)
      else next.delete(id)
      // 同步到 store + 持久化
      setExpandedNotebook(id, willBeExpanded)
      return next
    })
  }

  const handleContextMenu = (e: React.MouseEvent, node: NoteTreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const closeContextMenu = () => setContextMenu(null)

  const ensureNotebook = async (): Promise<string> => {
    if (notebooks.length > 0) return notebooks[0].id
    const nb = await createNotebook('我的笔记', null)
    return nb.id
  }

  const resolveTarget = (node: NoteTreeNode | null): { notebookId: string; parentId: string | null } => {
    if (!node) return { notebookId: '', parentId: null }
    if (node.type === 'notebook') return { notebookId: node.id, parentId: null }
    const nbId = notes.find(n => n.id === node.id)?.notebookId ?? notebooks[0]?.id ?? ''
    return { notebookId: nbId, parentId: node.id }
  }

  const handleNewNotebook = async (parentId: string | null) => {
    closeContextMenu()
    const nb = await createNotebook('新建笔记本', parentId)
    setRenaming({ id: nb.id, type: 'notebook', value: nb.name })
  }

  const handleRename = (node: NoteTreeNode) => {
    closeContextMenu()
    setRenaming({ id: node.id, type: node.type, value: node.name })
  }

  const commitRename = async () => {
    // 用 ref 读最新值，避免闭包里 renaming 已经过期
    const current = renamingRef.current
    if (!current) return
    renamingRef.current = null
    setRenaming(null)
    if (!current.value.trim()) return
    if (current.type === 'notebook') {
      await renameNotebook(current.id, current.value.trim())
    } else {
      await renameNote(current.id, current.value.trim())
    }
  }

  const cancelRename = () => {
    renamingRef.current = null
    setRenaming(null)
  }

  // 确认创建网址笔记
  const confirmCreateUrl = async () => {
    if (!urlDialog) return
    const rawUrl = urlDialog.value.trim()
    if (!rawUrl) return
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl
    // 简单合法性校验
    try { new URL(normalized) } catch { return }
    // 优先用用户输入的名称；未填则回退 hostname+path
    const nameInput = urlDialog.name.trim()
    let title = '未命名网址'
    try {
      const u = new URL(normalized)
      title = nameInput || (u.hostname + (u.pathname !== '/' ? u.pathname : ''))
    } catch {}
    const ctx = urlDialog
    setUrlDialog(null)
    await createNote(title, ctx.notebookId, ctx.parentId, undefined, 'url', undefined, normalized)
  }

  // ============ 拖动排序 handlers ============
  const handleDragStart = (e: React.DragEvent, node: NoteTreeNode) => {
    draggingRef.current = { id: node.id, type: node.type }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id) // 必填，否则 Firefox 不触发 drop
  }

  // 创建文件笔记：弹文件选择框，文件名作为 title，复制源文件到 app data
  const handleCreateFileNote = async () => {
    closeContextMenu()
    const node = contextMenu?.node
    if (!node) return
    const targetNotebookId = node.type === 'notebook'
      ? node.id
      : (notes.find(n => n.id === node.id)?.notebookId ?? notebooks[0]?.id ?? '')
    const targetParentId = node.type === 'notebook' ? null : node.id
    if (!targetNotebookId) return

    const [sourcePath] = await window.inkslateApi.file.openDialog({
      title: '选择要导入的文件',
      properties: ['openFile']
    })
    if (!sourcePath) return

    // 文件名（含扩展名）直接作为 title —— 用户在 Layout 看到的就是真实文件名
    const title = sourcePath.split(/[\\/]/).pop() || '未命名文件'

    // 先创建 note 拿到 noteId，再调 fileNote.create 复制文件
    // （走 store.createNote：加密笔记本会先弹密码框，取消则返回 null）
    const note = await createNote(title, targetNotebookId, targetParentId, undefined, 'file')
    if (!note) return
    try {
      const fileInfo = await window.inkslateApi.fileNote.create(note.id, sourcePath)
      if (!fileInfo) {
        toast.error('文件导入失败：无法读取源文件')
        return
      }
      // 重新拉取 note 列表 + 选中刚创建的笔记（让 currentNote 带上 file 信息）
      await useAppStore.getState().loadNotes()
      await useAppStore.getState().selectNote(note.id)
    } catch (e) {
      toast.error('文件导入失败：' + (e as Error).message)
    }
  }

  const handleImportFiles = async () => {
    closeContextMenu()
    const node = contextMenu?.node
    if (!node) return
    const target = resolveTarget(node)
    if (!target.notebookId) {
      toast.error('请先创建笔记本')
      return
    }
    // 目标笔记本处于加密锁定状态：先输入密码，否则导入的笔记无法加密（会被主进程拒绝）
    if (await isNotebookLocked(target.notebookId)) {
      const ok = await useAppStore.getState().requestNotebookUnlock(target.notebookId)
      if (!ok) return
    }

    let paths: string[]
    try {
      paths = await window.inkslateApi.file.openDialog({
        title: '选择要导入的 Markdown / HTML 文件',
        filters: [{ name: 'Markdown / HTML', extensions: ['md', 'html', 'htm'] }],
        properties: ['openFile', 'multiSelections']
      })
      if (!paths || paths.length === 0) return
    } catch (e) {
      console.error('打开文件对话框失败:', e)
      toast.error('文件对话框打开失败，请重启应用后重试')
      return
    }

    let imported = 0
    for (const filePath of paths) {
      try {
        const content = await window.inkslateApi.file.readText(filePath)
        if (!content || content.trim() === '') continue

        const fileName = filePath.split(/[\\/]/).pop() || '未命名'
        const ext = fileName.split('.').pop()?.toLowerCase()
        const format: 'markdown' | 'html' = ext === 'html' || ext === 'htm' ? 'html' : 'markdown'

        let title: string
        if (format === 'markdown') {
          const match = content.match(/^#\s+(.+)/m)
          title = match ? match[1].trim() : fileName.replace(/\.(?:md|markdown)$/i, '')
        } else {
          const match = content.match(/<title>([\s\S]*?)<\/title>/i)
          title = match ? match[1].trim() : fileName.replace(/\.html?$/i, '')
        }

        const note = await window.inkslateApi.notes.create(title, target.notebookId, target.parentId, undefined, format)
        await window.inkslateApi.notes.update(note.id, { content } as Partial<Note>)
        imported++
      } catch (e) {
        console.error('导入文件失败:', filePath, e)
      }
    }

    await useAppStore.getState().loadNotes()
    if (imported > 0) {
      toast.success(`已导入 ${imported} 个文件`)
    } else {
      toast.error('没有文件被导入')
    }
  }

  const handleDragOver = (e: React.DragEvent, node: NoteTreeNode) => {
    const dragging = draggingRef.current
    if (!dragging) return
    if (dragging.id === node.id) return // 自己拖自己不算
    e.preventDefault() // 必须 preventDefault 才能 drop（即使后面 reject，也允许 drop 触发让 handler 清状态）

    // 笔记本只能和笔记本一起排，笔记只能和笔记一起排（不同级不能混排）
    if (dragging.type !== node.type) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const position = e.clientY < midpoint ? 'before' : 'after'
    if (dragOverInfo?.targetId !== node.id || dragOverInfo.position !== position) {
      setDragOverInfo({ targetId: node.id, position })
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // dragleave 在子元素上也会触发，加一个简单的延迟清空逻辑
    // 不在这里清，靠下一次 dragover 更新或 drop 触发清空
  }

  const handleDrop = async (e: React.DragEvent, target: NoteTreeNode) => {
    e.preventDefault()
    const dragging = draggingRef.current
    setDragOverInfo(null)
    if (!dragging) return
    if (dragging.id === target.id) return
    if (dragging.type !== target.type) return

    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const position = e.clientY < midpoint ? 'before' : 'after'

    if (dragging.type === 'notebook') {
      // 同 parentId 下重排
      const sameParent = notebooks.filter(nb => nb.parentId === target.parentId)
      const ordered = sameParent.map(nb => nb.id)
      const fromIdx = ordered.indexOf(dragging.id)
      let toIdx = ordered.indexOf(target.id)
      if (position === 'after') toIdx += 1
      if (fromIdx < 0 || toIdx < 0) {
        console.warn('[sidebar] drop: bad index', { fromIdx, toIdx, ordered, dragging: dragging.id, target: target.id })
        return
      }
      // 把 fromIdx 移到 toIdx
      ordered.splice(fromIdx, 1)
      ordered.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, dragging.id)
      console.log('[sidebar] reorderNotebooks:', target.parentId, ordered)
      try {
        await reorderNotebooks(target.parentId, ordered)
        console.log('[sidebar] reorderNotebooks OK')
      } catch (err) {
        console.error('[sidebar] reorderNotebooks failed:', err)
      }
    } else {
      // 笔记：拖到目标笔记的笔记本下
      // 注意：不能简单地按目标笔记本下的所有笔记重排——拖动的笔记可能不在那个 notebook 下
      // 简化：先把拖动的笔记移到目标 notebook（如果不同），再重排
      // 这里先只做同 notebook 内的重排
      const targetNote = notes.find(n => n.id === target.id)
      if (!targetNote) {
        console.warn('[sidebar] drop: target note not found', target.id)
        return
      }
      const sameNotebook = notes.filter(n => n.notebookId === targetNote.notebookId)
      const ordered = sameNotebook.map(n => n.id)
      const fromIdx = ordered.indexOf(dragging.id)
      let toIdx = ordered.indexOf(target.id)
      if (fromIdx < 0) {
        // 拖动的笔记不在目标 notebook 下 —— 暂不支持跨笔记本移动
        console.warn('[sidebar] drop: note not in target notebook', { dragging: dragging.id, targetNb: targetNote.notebookId })
        return
      }
      if (position === 'after') toIdx += 1
      ordered.splice(fromIdx, 1)
      ordered.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, dragging.id)
      console.log('[sidebar] reorderNotes:', targetNote.notebookId, ordered)
      try {
        await reorderNotes(targetNote.notebookId, ordered)
        console.log('[sidebar] reorderNotes OK')
      } catch (err) {
        console.error('[sidebar] reorderNotes failed:', err)
      }
    }
  }

  const handleDragEnd = () => {
    draggingRef.current = null
    setDragOverInfo(null)
  }

  const handleDelete = async (node: NoteTreeNode) => {
    closeContextMenu()
    if (node.type === 'notebook') {
      // 收集笔记本及其所有子笔记本的 ID
      const collectIds = (n: NoteTreeNode): string[] => {
        const ids: string[] = [n.id]
        for (const child of n.children) {
          if (child.type === 'notebook') ids.push(...collectIds(child))
        }
        return ids
      }
      const nbIds = collectIds(node)
      const noteCount = notes.filter(n => nbIds.includes(n.notebookId)).length
      if (!await confirm({
        title: '删除笔记本',
        message: `将删除笔记本 "${node.name}" 及其下 ${noteCount} 条笔记。\n删除后可在回收站中恢复。\n\n请输入笔记本名称以确认操作：`,
        confirmText: '确认删除',
        danger: true,
        verifyText: node.name,
        verifyLabel: `输入 "${node.name}" 确认删除`
      })) return
      await deleteNotebook(node.id)
    } else {
      if (!await confirm({ message: `确认删除笔记 "${node.name}"？此操作不可撤销。`, danger: true })) return
      await deleteNote(node.id)
    }
  }

  /** 导出当前右键的笔记为 HTML 文件 */
  const handleExportHtml = async (nodeId: string) => {
    closeContextMenu()
    try {
      const note = await window.inkslateApi.notes.get(nodeId)
      if (!note) {
        toast.error('笔记不存在或已被删除')
        return
      }
      if (note.locked) {
        toast.error('该笔记已加密，请先打开并输入密码解锁后再导出')
        return
      }
      if (note.format === 'spreadsheet') {
        toast.error('该格式暂不支持导出为 HTML')
        return
      }
      const path = await window.inkslateApi.file.export('html')
      if (!path) return  // 用户取消
      const html = wrapNoteAsHtml(note)
      await window.inkslateApi.file.write(path, html)
    } catch (e) {
      console.error('HTML 导出失败:', e)
      toast.error('HTML 导出失败：' + (e as Error).message)
    }
  }

  /** 导出当前右键的笔记为 PDF 文件。
   *  markdown：抓预览区已渲染好的 innerHTML（带 mermaid / katex 渲染结果）；
   *  html / code / richtext：预览不在 .preview-inner 里（html 在 iframe、code 是独立 pre、
   *  richtext 无预览），直接用笔记原始内容生成，否则会导出空白 PDF。
   *  主进程用隐藏 BrowserWindow 加载纯净 HTML 后 printToPDF。
   *  先弹出水印输入框，确认后再真正导出。 */
  const handleExportPdf = (nodeId: string) => {
    closeContextMenu()
    setPdfExportDialog({ nodeId, value: '' })
  }

  const doExportPdf = async (nodeId: string, watermark: string) => {
    try {
      const targetNote = notes.find(n => n.id === nodeId)
      if (['spreadsheet', 'url', 'file'].includes(targetNote?.format ?? '')) {
        toast.error('该格式暂不支持导出为 PDF')
        return
      }
      if (targetNote?.locked) {
        toast.error('该笔记已加密，请先打开并输入密码解锁后再导出')
        return
      }
      if (selectedNoteId !== nodeId) {
        await selectNote(nodeId)
        // 等 React 把新笔记的预览渲染出来
        await new Promise(r => setTimeout(r, 300))
      }
      const note = notes.find(n => n.id === nodeId)
      const title = note?.title || '未命名笔记'
      let html = ''
      if (note?.format === 'html') {
        // HTML 笔记预览渲染在 iframe 里，主文档没有 .preview-inner。
        // 优先抓 iframe 实时内容（包含防抖未落库的最新编辑，sandbox allow-same-origin 可跨入），
        // 抓不到再回退笔记内容
        const iframe = document.querySelector('iframe[title="HTML Preview"]') as HTMLIFrameElement | null
        html = iframe?.contentDocument?.body?.innerHTML || note.content || ''
      } else if (note?.format === 'code') {
        // 代码笔记预览也是独立结构，转义后包 pre/code（PDF 模板里有代码块样式）
        const esc = (note.content ?? '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        html = `<pre><code>${esc}</code></pre>`
      } else if (note?.format === 'richtext') {
        // 富文本笔记没有预览区，把 JSON 转成 HTML 再导出
        html = richTextJsonToHtml(note.content ?? '')
      } else {
        // markdown：抓预览区已经渲染好的 HTML（带 mermaid / katex 渲染结果），
        // 但要去掉右侧悬浮目录按钮，避免它出现在导出的 PDF 里
        const inner = document.querySelector('.preview .preview-inner') as HTMLElement | null
        if (inner) {
          const clone = inner.cloneNode(true) as HTMLElement
          clone.querySelectorAll('.toc').forEach(el => el.remove())
          // 去掉搜索高亮标记，避免导出 PDF 里残留 <mark>
          clone.querySelectorAll('mark.preview-search-mark').forEach(m => {
            const parent = m.parentNode
            if (parent) {
              parent.replaceChild(document.createTextNode(m.textContent ?? ''), m)
              parent.normalize()
            }
          })
          // 代码块强制换行：PDF 里不能有横向滚动条。
          // 用 setProperty + 'important' 写内联样式（最高优先级），
          // 保证导出的内容一定折行显示，不受任何外部 CSS/缓存影响。
          clone.querySelectorAll('pre').forEach((el) => {
            const s = (el as HTMLElement).style
            s.setProperty('white-space', 'pre-wrap', 'important')
            s.setProperty('word-break', 'break-all', 'important')
            s.setProperty('overflow', 'visible', 'important')
          })
          html = clone.innerHTML
        }
      }
      if (!html.trim()) {
        toast.error('未找到可导出的内容')
        return
      }
      const ok = await window.inkslateApi.file.exportPdf({ title, html, watermark })
      if (!ok) console.log('PDF 导出已取消')
    } catch (e) {
      console.error('PDF 导出失败:', e)
      toast.error('PDF 导出失败：' + (e as Error).message)
    }
  }

  /** 导出当前右键的笔记为 Word 文档。
   *  把笔记原始内容发给主进程，主进程负责渲染 + 转换 + 保存 */
  const handleExportWord = async (nodeId: string) => {
    closeContextMenu()
    try {
      const note = await window.inkslateApi.notes.get(nodeId)
      if (!note) {
        toast.error('笔记不存在或已被删除')
        return
      }
      if (note.format === 'richtext' || note.format === 'url' || note.format === 'file' || note.format === 'spreadsheet') {
        toast.error('该格式暂不支持导出为 Word')
        return
      }
      if (note.locked) {
        toast.error('该笔记已加密，请先打开并输入密码解锁后再导出')
        return
      }
      const res = await window.inkslateApi.file.exportDocx({
        title: note.title,
        content: note.content,
        format: note.format,
        basePath: note.path,
        language: note.language
      })
      if (res.ok) toast.success('已导出 Word 文档')
      else if (res.message && res.message !== '已取消') toast.error('Word 导出失败：' + res.message)
    } catch (e) {
      console.error('Word 导出失败:', e)
      toast.error('Word 导出失败：' + (e as Error).message)
    }
  }

  const showGitHistory = (node: NoteTreeNode): boolean => {
    if (node.type !== 'note') return false
    const note = notes.find(n => n.id === node.id)
    if (!note) return false
    // 加密笔记未解锁时不提供历史快照：git 里的历史版本可能是加密前的明文
    if (note.locked) return false
    return !['url', 'file', 'spreadsheet'].includes(note.format) && !!(useAppStore.getState().settings?.gitSync?.configured)
  }

  const canAiWrite = (node: NoteTreeNode): boolean => {
    if (node.type !== 'note') return false
    const note = notes.find(n => n.id === node.id)
    if (!note) return false
    // 加密笔记未解锁时不提供 AI 写作（否则会拿密文去写作）
    if (note.locked) return false
    return !['url', 'file', 'spreadsheet'].includes(note.format)
  }

  /** 在 AI 写作面板中打开指定笔记：先选中（确保 currentNote 就绪），再打开面板 */
  const handleAiWrite = async (nodeId: string) => {
    closeContextMenu()
    try {
      if (selectedNoteId !== nodeId) {
        await selectNote(nodeId)
      }
    } catch (e) {
      console.error('[sidebar] selectNote for AI write failed:', e)
    }
    window.dispatchEvent(new CustomEvent('inkslate:open-ai-panel'))
  }

  /** 打开指定笔记的 Git 历史快照：先选中（HistoryPanel 读的是 currentNote），再打开面板 */
  const handleOpenHistory = async (nodeId: string) => {
    closeContextMenu()
    try {
      if (selectedNoteId !== nodeId) {
        await selectNote(nodeId)
      }
    } catch (e) {
      console.error('[sidebar] selectNote for git history failed:', e)
    }
    window.dispatchEvent(new CustomEvent('inkslate:open-history'))
  }

  const renderNode = (node: NoteTreeNode, depth: number = 0, parentSelected: boolean = false) => {
    const isExpanded = expanded.has(node.id)
    const isSelected = selectedNoteId === node.id || selectedNotebookId === node.id
    const isChildOfSelected = parentSelected && !isSelected
    const isRenaming = renaming?.id === node.id

    if (node.type === 'notebook') {
      const isDragOver = dragOverInfo?.targetId === node.id
      // 加密状态：locked=true 表示此刻打开需要输入密码（解锁后仍保留锁标记，只是变淡）
      const nbLocked = !!notebooks.find(n => n.id === node.id)?.locked
      const nbEncrypted = !!node.passwordProtected || nbLocked
      const dropLineStyle: React.CSSProperties = isDragOver
        ? {
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--accent-color)',
            pointerEvents: 'none',
            ...(dragOverInfo!.position === 'before' ? { top: -1 } : { bottom: -1 })
          }
        : {}
      return (
        <div key={node.id} className={isSelected ? 'tree-group-selected' : ''} style={{ position: 'relative' }}>
          <div
            className={`tree-row ${isSelected ? 'selected' : ''} ${isChildOfSelected ? 'child-of-selected' : ''}`}
            data-notebook-id={node.id}
            style={{ paddingLeft: 4 + depth * 10 }}
            onClick={() => { setRenaming(null); selectNotebook(node.id) }}
            onContextMenu={(e) => handleContextMenu(e, node)}
            onDoubleClick={() => handleRename(node)}
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
            onDragOver={(e) => handleDragOver(e, node)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node)}
            onDragEnd={handleDragEnd}
          >
            <span
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
              style={{ display: 'inline-flex', width: 14, cursor: 'pointer' }}
              title={isExpanded ? '折叠' : '展开'}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span style={{ marginRight: 4, display: 'inline-flex', color: 'var(--text-secondary)' }}>
              {renderNotebookIcon(node.icon, isExpanded)}
            </span>
            {isRenaming ? (
              <RenameInput
                value={renaming.value}
                onChange={(v) => setRenaming({ ...renaming, value: v })}
                onCommit={commitRename}
                onCancel={cancelRename}
              />
            ) : (
              <>
                <span className="tree-label">{node.name}</span>
                {nbEncrypted && (
                  <span
                    title={nbLocked ? '需要输入密码才能查看这个笔记本' : '受密码保护（本次运行已解锁）'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginLeft: 6,
                      color: nbLocked ? 'var(--accent-color)' : 'var(--text-tertiary)'
                    }}
                  >
                    <Lock size={11} />
                  </span>
                )}
                {showTreeCount && <span className="tree-count">{node.children.length}</span>}
              </>
            )}
          </div>
          {isDragOver && <div style={dropLineStyle} />}
          {isExpanded && node.children.map(child => renderNode(child, depth + 1, isSelected))}
        </div>
      )
    }

    // ===== 笔记节点 =====
    // 加密状态：locked=true 表示此刻打开需要输入密码（解锁后仍保留锁标记，只是变淡）
    const noteState = notes.find(n => n.id === node.id)
    const noteLocked = !!noteState?.locked
    const noteEncrypted = !!(noteState?.isEncrypted || noteState?.locked)
    const noteFormat = noteState?.format
    const formatInfo = {
      markdown: { Icon: MarkdownIcon, color: '#7d8590', title: 'Markdown' },
      html: { Icon: Globe, color: '#e67e22', title: 'HTML' },
      richtext: { Icon: RichTextIcon, color: '#9b59b6', title: '富文本' },
      code: { Icon: CodeIcon, color: '#4a90e2', title: '代码' },
      url: { Icon: Link2, color: '#0ea5e9', title: '网址' },
      file: { Icon: Paperclip, color: '#16a34a', title: '文件' },
      spreadsheet: { Icon: Table2, color: '#f59e0b', title: '智能表格' }
    }[noteFormat ?? 'markdown'] ?? { Icon: MarkdownIcon, color: 'var(--text-secondary)', title: '笔记' }
    const { Icon: FormatIcon, color: formatColor, title: formatTitle } = formatInfo
    const hasChildren = node.children.length > 0

    const isDragOver = dragOverInfo?.targetId === node.id
    const dropLineStyle: React.CSSProperties = isDragOver
      ? {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background: 'var(--accent-color)',
          pointerEvents: 'none',
          ...(dragOverInfo!.position === 'before' ? { top: -1 } : { bottom: -1 })
        }
      : {}
    return (
      <div key={node.id} className={isSelected ? 'tree-group-selected' : ''} style={{ position: 'relative' }}>
        <div
          className={`tree-row ${isSelected ? 'selected' : ''} ${isChildOfSelected ? 'child-of-selected' : ''}`}
          data-note-id={node.id}
          style={{ paddingLeft: 4 + depth * 10 }}
          onClick={() => {
            setRenaming(null)
            selectNotebook(null)
            if (selectNoteTimer.current) clearTimeout(selectNoteTimer.current)
            selectNoteTimer.current = setTimeout(() => {
              selectNoteTimer.current = null
              selectNote(node.id)
            }, 80)
          }}
          onContextMenu={(e) => handleContextMenu(e, node)}
          onDoubleClick={() => handleRename(node)}
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
          onDragEnd={handleDragEnd}
        >
                    <span
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleExpand(node.id) }}
            style={{ display: 'inline-flex', width: 14, color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            {hasChildren
              ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
              : null}
          </span>
          <span
            title={formatTitle}
            style={{ marginRight: 4, display: 'inline-flex', color: formatColor }}
          >
            <FormatIcon size={14} />
          </span>
          {isRenaming ? (
            <RenameInput
              value={renaming.value}
              onChange={(v) => setRenaming({ ...renaming, value: v })}
              onCommit={commitRename}
              onCancel={cancelRename}
            />
          ) : (
            <>
              <span className="tree-label">{node.name}</span>
              {noteEncrypted && (
                <span
                  title={noteLocked ? '需要输入密码才能打开这篇笔记' : '已加密（本次运行已解锁）'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginLeft: 6,
                    color: noteLocked ? 'var(--accent-color)' : 'var(--text-tertiary)'
                  }}
                >
                  <Lock size={11} />
                </span>
              )}
              {showTreeCount && <span className="tree-count">{node.children.length}</span>}
            </>
          )}
        </div>
        {isDragOver && <div style={dropLineStyle} />}
                {hasChildren && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  /**
   * 密码弹窗提交：
   * - set：先落盘当前草稿，再设置密码。设置完该子树立即进入锁定状态
   *   （主进程刻意不缓存密码），所以必须刷新笔记列表 + 重新选中当前笔记，
   *   让编辑器/预览立刻显示"已加密，请输入密码"。
   * - remove：解密后同样刷新，笔记恢复正常打开。
   * - unlock：仅缓存密码，刷新后即可查看。
   */
  const submitPassword = async (password: string) => {
    if (!passwordDialog) return { ok: false, message: '弹窗已关闭' }
    const { mode, notebookId } = passwordDialog
    let r: { ok: boolean; message: string }
    if (mode === 'set') {
      // 设置密码后未解锁状态下主进程会丢弃内容写入，先把当前草稿存下来
      const cur = useAppStore.getState().currentNote
      if (cur) {
        try { await useAppStore.getState().updateNote(cur.id, { content: cur.content, title: cur.title }) } catch {}
      }
      r = await window.inkslateApi.notebookPassword.set(notebookId, password)
    } else if (mode === 'remove') {
      r = await window.inkslateApi.notebookPassword.remove(notebookId, password)
    } else {
      r = await window.inkslateApi.notebookPassword.unlock(notebookId, password)
    }
    if (r.ok) {
      const store = useAppStore.getState()
      await store.loadNotebooks()
      await store.loadNotes()
      const cur = useAppStore.getState().currentNote
      if (cur) await useAppStore.getState().selectNote(cur.id)
      if (mode === 'set') toast.success('密码设置成功，该笔记本下的笔记已锁定')
      else if (mode === 'remove') toast.success('密码已移除')
    }
    return r
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 4px 0' }} onClick={closeContextMenu}>
        <div
          className="tree"
          style={{ padding: '0 0 4px 0', marginTop: -2, minHeight: '100%' }}
          onContextMenu={(e) => {
            // 右侧行级 handler 已 stopPropagation，到达此处的一定是空白区域
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY, node: null })
          }}
        >
          {tree.length === 0 ? (
            <div
              style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}
              onContextMenu={(e) => e.preventDefault()}
            >
              还没有笔记本
              <br />
              <span style={{ fontSize: 11, opacity: 0.7 }}>右键此处或菜单"文件"→"新建"</span>
            </div>
          ) : (
            tree.map(node => renderNode(node))
        )}
      </div>

            {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-md)',
            padding: '4px 0',
            zIndex: 1000,
            minWidth: 160
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <SubMenuItem
            icon={<FilePlus size={14} />}
            label="新建笔记"
            parentRef={contextMenuRef}
          >
            <MenuItem icon={<FileText size={14} />} label="Markdown 笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名笔记', nbId, target.parentId, undefined, 'markdown')
              if (note) setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <MenuItem icon={<Table2 size={14} />} label="智能表格" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名智能表格', nbId, target.parentId, undefined, 'spreadsheet')
              if (note) setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <MenuItem icon={<Globe size={14} />} label="网址笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              setUrlDialog({ notebookId: nbId, parentId: target.parentId, name: '', value: 'https://' })
            }} />
            <MenuItem icon={<Paperclip size={14} />} label="文件笔记" onClick={handleCreateFileNote} />
            <MenuItem icon={<FileCode2 size={14} />} label="HTML 笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名 HTML', nbId, target.parentId, undefined, 'html')
              if (note) setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <MenuItem icon={<FileType2 size={14} />} label="富文本笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名富文本', nbId, target.parentId, undefined, 'richtext')
              if (note) setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <SubMenuItem icon={<CodeIcon size={14} />} label="代码笔记" parentRef={contextMenuRef}>
              {(['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'cpp', 'csharp', 'html', 'css', 'json', 'sql', 'shell', 'plaintext'] as const).map(lang => (
                <MenuItem key={lang} icon={<FileCode2 size={14} />} label={lang} onClick={async () => {
                  closeContextMenu()
                  const target = resolveTarget(contextMenu.node)
                  const nbId = target.notebookId || await ensureNotebook()
                  const note = await createNote(`${lang} 代码片段`, nbId, target.parentId, undefined, 'code', lang)
                  if (note) setRenaming({ id: note.id, type: 'note', value: note.title })
                }} />
              ))}
            </SubMenuItem>
          </SubMenuItem>

          {contextMenu.node ? (
            <>
              <MenuItem icon={<FolderPlus size={14} />} label="新建子笔记本" onClick={() => handleNewNotebook(contextMenu.node!.id)} />

              <div style={{ height: 6 }} />

              <MenuItem icon={<Edit3 size={14} />} label="重命名" onClick={() => handleRename(contextMenu.node!)} />

              <MenuItem
                icon={<ArrowRightLeft size={14} />}
                label="移动"
                onClick={() => {
                  const node = contextMenu.node!
                  setContextMenu(null)
                  setMoveDialog({ nodeId: node.id, nodeType: node.type, nodeName: node.name })
                }}
              />

              <div style={{ height: 6 }} />
              <MenuItem icon={<Upload size={14} />} label="导入文件..." onClick={handleImportFiles} />

              {contextMenu.node.type === 'notebook' && (
                <>
                  <MenuItem
                    icon={<Palette size={14} />}
                    label="更换图标..."
                    onClick={() => {
                      const nb = contextMenu.node!
                      setContextMenu(null)
                      setIconPicker({
                        notebookId: nb.id,
                        currentIcon: nb.icon ?? null,
                      })
                    }}
                  />
                  {/* 已设密码的笔记本不再提供「设置密码」：改密码要先「移除密码」，
                      否则会出现"新密码能通过校验、内容还是旧密码加密的"错配 */}
                  {!contextMenu.node.passwordProtected && (
                    <MenuItem
                      icon={<Lock size={14} />}
                      label="设置密码"
                      onClick={() => {
                        const node = contextMenu.node!
                        setContextMenu(null)
                        setPasswordDialog({ notebookId: node.id, notebookName: node.name, mode: 'set' })
                      }}
                    />
                  )}
                  <MenuItem
                    icon={<Unlock size={14} />}
                    label="移除密码"
                    onClick={() => {
                      const node = contextMenu.node!
                      setContextMenu(null)
                      setPasswordDialog({ notebookId: node.id, notebookName: node.name, mode: 'remove' })
                    }}
                  />
                </>
              )}

              {contextMenu.node.type === 'note' && (
                <>
                  <div style={{ height: 6 }} />
                  {canAiWrite(contextMenu.node) && (
                    <MenuItem icon={<Bot size={14} />} label="AI 写作" onClick={() => handleAiWrite(contextMenu.node!.id)} />
                  )}

                  <div style={{ height: 6 }} />
                  <MenuItem icon={<FileCode size={14} />} label="导出为 HTML..." onClick={() => handleExportHtml(contextMenu.node!.id)} />
                  <MenuItem icon={<FileDown size={14} />} label="导出为 PDF..." onClick={() => handleExportPdf(contextMenu.node!.id)} />
                  <MenuItem icon={<FileText size={14} />} label="导出为 Word..." onClick={() => handleExportWord(contextMenu.node!.id)} />

                  <div style={{ height: 6 }} />
                  {showGitHistory(contextMenu.node) && (
                    <MenuItem
                      icon={<Clock size={14} />}
                      label="Git 历史快照"
                      onClick={() => {
                        const nodeId = contextMenu.node!.id
                        handleOpenHistory(nodeId)
                      }}
                    />
                  )}
                </>
              )}

              <div style={{ height: 6 }} />
              <MenuItem icon={<Trash2 size={14} />} label="删除" onClick={() => handleDelete(contextMenu.node!)} danger />
            </>
          ) : (
            <MenuItem icon={<FolderPlus size={14} />} label="新建笔记本" onClick={() => handleNewNotebook(null)} />
          )}
        </div>
      )}

      {/* 笔记本图标选择器（独立于 context menu，从 menu item 触发） */}
      {iconPicker && (
        <IconPicker
          notebookId={iconPicker.notebookId}
          currentIcon={iconPicker.currentIcon}
          onClose={() => setIconPicker(null)}
        />
      )}

      {/* 移动对话框：放到组件顶层，避免每个树节点都渲染一份 */}
      {moveDialog && (
        <MoveDialog
          nodeId={moveDialog.nodeId}
          nodeType={moveDialog.nodeType}
          nodeName={moveDialog.nodeName}
          notebooks={notebooks}
          notes={notes}
          onMove={(targetId) => {
            if (moveDialog.nodeType === 'note') {
              moveNote(moveDialog.nodeId, targetId)
            } else {
              moveNotebook(moveDialog.nodeId, targetId)
            }
            setMoveDialog(null)
          }}
          onClose={() => setMoveDialog(null)}
        />
      )}

      <style>{`
        .tree-row {
          display: flex;
          align-items: center;
          height: calc(var(--tree-font-size, 14px) + 16px);
          font-size: var(--tree-font-size, 14px);
          font-family: var(--tree-font, var(--font-family));
          color: var(--text-primary);
          cursor: pointer;
          user-select: none;
          gap: 4px;
        }
        .tree-row svg {
          width: 1em;
          height: 1em;
        }
        .tree-row:hover {
          background-color: var(--bg-hover);
        }
        .tree-group-selected {
          background-color: var(--bg-primary);
          box-shadow: 0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
          border-radius: 6px;
          /* 不用 margin，避免选中时整组偏移、笔记名称与同级不对齐 */
          position: relative;
          z-index: 1;
        }
        .tree-row.selected {
          background-color: transparent;
        }
        .tree-row.child-of-selected {
          background-color: transparent;
        }
        .tree-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tree-count {
          font-size: 10px;
          color: var(--text-tertiary);
          background: var(--bg-hover);
          border-radius: 8px;
          padding: 0 5px;
          line-height: 16px;
          min-width: 16px;
          text-align: center;
          flex-shrink: 0;
          margin-left: 6px;
          margin-right: 8px;
        }
      `}</style>
      </div>

      {/* 新建网址笔记的 URL 输入弹窗（Electron renderer 不支持 window.prompt） */}
      {urlDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setUrlDialog(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: 20,
              minWidth: 360,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>新建网址笔记</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>名称</div>
            <input
              autoFocus
              value={urlDialog.name}
              onChange={(e) => setUrlDialog({ ...urlDialog, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // 名称框回车：聚焦到 URL 框，让用户继续输入网址
                  const urlInput = (e.currentTarget as HTMLInputElement)
                    .parentElement?.parentElement?.querySelector<HTMLInputElement>('input[data-url-input="1"]')
                  if (urlInput) urlInput.focus()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setUrlDialog(null)
                }
              }}
              placeholder="笔记名称（留空则用网址域名）"
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, marginBottom: 4 }}>网址</div>
            <input
              data-url-input="1"
              value={urlDialog.value}
              onChange={(e) => setUrlDialog({ ...urlDialog, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmCreateUrl()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setUrlDialog(null)
                }
              }}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setUrlDialog(null)}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={confirmCreateUrl}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--accent-color)',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {pdfExportDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setPdfExportDialog(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              padding: 20,
              minWidth: 360,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>导出 PDF - 添加文字水印</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>水印文字（留空则不加水印）</div>
            <input
              autoFocus
              value={pdfExportDialog.value}
              onChange={(e) => setPdfExportDialog({ ...pdfExportDialog, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const { nodeId, value } = pdfExportDialog
                  setPdfExportDialog(null)
                  doExportPdf(nodeId, value.trim())
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setPdfExportDialog(null)
                }
              }}
              placeholder="例如：内部资料，请勿外传"
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setPdfExportDialog(null)}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const { nodeId, value } = pdfExportDialog
                  setPdfExportDialog(null)
                  doExportPdf(nodeId, value.trim())
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--accent-color)',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordDialog && (
        <PasswordDialog
          mode={passwordDialog.mode}
          notebookName={passwordDialog.notebookName}
          onSubmit={submitPassword}
          onClose={() => setPasswordDialog(null)}
        />
      )}
    </div>
  )
}

function MoveNoteIcon({ format, size, color }: { format: string; size: number; color: string }) {
  switch (format) {
    case 'markdown': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 6 L5 18" /><path d="M5 6 L12 14" /><path d="M12 14 L19 6" /><path d="M19 6 L19 18" />
      </svg>)
    case 'code': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 6 L2 12 L8 18" /><path d="M16 6 L22 12 L16 18" /><path d="M15 4 L9 20" />
      </svg>)
    case 'richtext': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6 L20 6" /><path d="M12 6 L12 19" />
      </svg>)
    case 'html': return <Globe size={size} color={color} />
    case 'url': return <Link2 size={size} color={color} />
    case 'file': return <Paperclip size={size} color={color} />
    case 'spreadsheet': return <Table2 size={size} color={color} />
    default: return <FileText size={size} color={color} />
  }
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: (e: React.MouseEvent<HTMLDivElement>) => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        fontSize: 13,
        color: danger ? '#f44336' : 'var(--text-primary)',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  )
}

/**
 * 甯﹀瓙鑿滃崟鐨勮彍鍗曢」 - hover 寮瑰嚭鍙充晶瀛愯彍鍗?*/
function SubMenuItem({ icon, label, children, parentRef }: { icon: React.ReactNode; label: string; children: React.ReactNode; parentRef?: React.RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      // 优先贴到父菜单（contextMenu）的右边缘；没传就贴自己右边缘
      const parentRect = parentRef?.current?.getBoundingClientRect()
      const left = parentRect ? parentRect.right - 4 : rect.right
      setPos({ left, top: rect.top })
      setOpen(true)
    }
  }

  const handleLeave = () => {
    // 延迟关闭，给鼠标留时间从父菜单移到子菜单（子菜单是 fixed 定位，中间有间隙）
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
    }, 150)
  }

  useLayoutEffect(() => {
    if (!open || !subRef.current) return
    const menu = subRef.current
    const rect = menu.getBoundingClientRect()
    let newLeft = pos.left
    let newTop = pos.top
    if (rect.bottom > window.innerHeight) {
      newTop = Math.max(8, window.innerHeight - rect.height - 8)
    }
    if (rect.right > window.innerWidth) {
      newLeft = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (newLeft !== pos.left || newTop !== pos.top) {
      setPos({ left: newLeft, top: newTop })
    }
  }, [open, pos])

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        fontSize: 13,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        background: open ? 'var(--bg-hover)' : 'transparent'
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={12} color="var(--text-tertiary)" />
      {open && (
        <div
          ref={subRef}
          onMouseEnter={() => {
            if (closeTimer.current) {
              clearTimeout(closeTimer.current)
              closeTimer.current = null
            }
          }}
          onMouseLeave={handleLeave}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-md)',
            padding: '4px 0',
            minWidth: 180,
            zIndex: 1100
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** HTML 导出：把不同格式的笔记包成独立的 .html 文件 */
function wrapNoteAsHtml(note: Note): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const title = escape(note.title)

  // HTML 笔记：内容本身就是 HTML，直接套个外壳
  if (note.format === 'html') {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body>
${note.content}
</body>
</html>`
  }

  // 代码笔记：等宽字体包 <pre><code>
  if (note.format === 'code') {
    const lang = note.language ?? 'plaintext'
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #24292e; }
  h1 { border-bottom: 1px solid #e1e4e8; padding-bottom: 8px; }
  pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
  code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; }
</style>
</head>
<body>
<h1>${title}</h1>
<pre><code class="language-${lang}">${escape(note.content)}</code></pre>
</body>
</html>`
  }

  // Markdown 笔记：保留源文本（用户拿到 .html 后可用其他工具继续渲染）
  // 套上 GitHub 风格基础样式，让直接打开也能看
  if (note.format === 'markdown') {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #24292e; }
  h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
  h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 8px; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 6px; }
  pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
  code { background: rgba(27,31,35,0.06); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 4px solid #dfe2e5; color: #6a737d; margin: 0; padding: 0 16px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
  .raw { background: #f6f8fa; padding: 16px; border-radius: 6px; white-space: pre-wrap; word-wrap: break-word; font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 13px; }
  .meta { color: #6a737d; font-size: 12px; margin-bottom: 24px; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">Markdown 原文 · 由 墨与石板 导出</p>
<div class="raw">${escape(note.content)}</div>
</body>
</html>`
  }

  // 富文本 / 兜底：直接当 HTML 塞进 body
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body>
${note.content}
</body>
</html>`
}

/** 树节点重命名输入框：强制 focus + 全选 + 阻止事件冒泡 */
function RenameInput(props: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const { value, onChange, onCommit, onCancel } = props
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 下一帧再 focus，绕过 React 自动渲染期间的 focus 竞争
    const id = requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      // 阻止事件冒泡到外层 row 的 onClick（避免触发收起/选中/关闭重命名）
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ flex: 1, padding: '2px 4px', fontSize: 13, minWidth: 0 }}
    />
  )
}

/** 移动对话框：显示完整树状图，选择目标位置 */
function MoveDialog({ nodeId, nodeType, nodeName, notebooks, notes, onMove, onClose }: {
  nodeId: string
  nodeType: 'notebook' | 'note'
  nodeName: string
  notebooks: Notebook[]
  notes: Note[]
  onMove: (targetId: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const tree = useMemo(() => buildNoteTree(notebooks, notes), [notebooks, notes])
  // 折叠状态：默认全部收起（集合里有的 id 表示"已折叠"），点击展开/收起
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(notebooks.map(n => n.id)))
  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 收集要排除的节点（自身 + 子节点，防止循环）
  const excludeIds = useMemo(() => {
    const ids = new Set<string>([nodeId])
    const stack = [nodeId]
    while (stack.length > 0) {
      const id = stack.pop()!
      for (const n of notes) {
        if ((n.parentId === id || n.notebookId === id) && !ids.has(n.id)) {
          ids.add(n.id)
          stack.push(n.id)
        }
      }
      for (const nb of notebooks) {
        if (nb.parentId === id && !ids.has(nb.id)) {
          ids.add(nb.id)
          stack.push(nb.id)
        }
      }
    }
    return ids
  }, [nodeId, notes, notebooks])

  // 笔记本移动只能选笔记本，笔记移动两者都可
  const canSelect = (n: NoteTreeNode) => {
    if (nodeType === 'notebook' && n.type !== 'notebook') return false
    return true
  }

  const renderTree = (nodes: NoteTreeNode[], depth = 0): React.ReactNode[] => {
    const result: React.ReactNode[] = []
    for (const node of nodes) {
      if (!node || !node.id) continue
      if (excludeIds.has(node.id)) continue
      if (!canSelect(node)) {
        result.push(...renderTree(node.children, depth + 1))
        continue
      }
      const isFolder = node.type === 'notebook'
      const hasChildren = node.children.length > 0
      const isCollapsed = collapsed.has(node.id)
      const note = notes.find(n => n.id === node.id)
      const noteFormat = note?.format || 'markdown'
      const formatColors: Record<string, string> = { markdown: '#7d8590', html: '#e67e22', richtext: '#9b59b6', code: '#4a90e2', url: '#0ea5e9', file: '#16a34a', spreadsheet: '#f59e0b' }
      const fc = formatColors[noteFormat] || 'var(--text-secondary)'
      result.push(
        <div
          key={node.id}
          onClick={() => setSelected(node.id)}
          style={{
            padding: '5px 10px', paddingLeft: 12 + depth * 16, cursor: 'pointer',
            borderRadius: 4, fontSize: 13, color: 'var(--text-primary)',
            background: selected === node.id ? 'var(--accent-bg)' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          {isFolder ? (
            <span
              onClick={(e) => { e.stopPropagation(); toggleCollapsed(node.id) }}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0 }}
              title={isCollapsed ? '展开' : '收起'}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
          ) : (
            <span style={{ width: 12, flexShrink: 0 }} />
          )}
          {isFolder ? <Folder size={13} color="var(--text-secondary)" /> : <MoveNoteIcon format={noteFormat} size={13} color={fc} />}
          {node.name || '(未命名)'}
        </div>
      )
      if (hasChildren && !isCollapsed) {
        result.push(...renderTree(node.children, depth + 1))
      }
    }
    return result
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.22)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 8, padding: 16, width: 380,
        maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
          移动{nodeType === 'note' ? '笔记' : '笔记本'} "{nodeName || '(未命名)'}" 到
        </div>
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, minHeight: 120 }}>
          <div
            onClick={() => setSelected(null)}
            style={{
              padding: '5px 10px', cursor: 'pointer', borderRadius: 4, fontSize: 13,
              color: 'var(--text-primary)', background: selected === null ? 'var(--accent-bg)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4
            }}
          >
            <Folder size={13} color="var(--text-secondary)" />
            根目录
          </div>
          {renderTree(tree)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}>取消</button>
          <button
            onClick={() => {
              if (selected !== null) onMove(selected)
            }}
            disabled={selected === null}
            style={{
              padding: '6px 14px', borderRadius: 4, border: 'none',
              background: selected !== null ? 'var(--accent-color)' : 'var(--bg-hover)',
              color: selected !== null ? '#fff' : 'var(--text-tertiary)',
              fontSize: 13, cursor: selected !== null ? 'pointer' : 'not-allowed'
            }}
          >
            移动
          </button>
        </div>
      </div>
    </div>
  )
}
