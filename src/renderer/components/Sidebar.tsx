import { useState, useMemo, useRef, useEffect } from 'react'
import { useAppStore, buildNoteTree } from '../store/app'
import { NoteTreeNode, Note, Notebook } from '@shared/types'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, FileText,
  Trash2, Edit3, FilePlus, FolderPlus, FileCode2, FileType2, Heading1,
  FileDown, FileCode, Globe, Link2, Paperclip, Palette, History, ArrowRightLeft
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import * as PhosphorIcons from '@phosphor-icons/react'
import { toast } from './Toast'
import { confirm } from './ConfirmDialog'
import { IconPicker } from './IconPicker'

/** 笔记本图标：把 DB 里存的图标名（字符串）查表渲染成 lucide / phosphor 组件。
 *  - 没设图标 → 展开用 FolderOpen，折叠用 Folder
 *  - 设了图标但找不到对应组件 → 兜底用 Folder
 *  - 以 ph: 开头的图标名从 Phosphor Icons 查找，支持实心填充图标
 */
function renderNotebookIcon(iconName: string | null | undefined, isExpanded: boolean) {
  if (!iconName) {
    return isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
  }
  if (iconName.startsWith('ph:')) {
    const Icon = (PhosphorIcons as any)[iconName.slice(3)]
    if (Icon) return <Icon size={14} weight="fill" />
  }
  const Icon = (LucideIcons as any)[iconName]
  if (Icon) return <Icon size={14} />
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
  // 笔记本图标选择器：null 时不显示，否则 { notebookId, position }
  const [iconPicker, setIconPicker] = useState<{ notebookId: string; currentIcon: string | null; position: { top: number; left: number } } | null>(null)
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
    const nbs = storeNotebooksRef.current
    if (nbs.length > 0) return nbs[0].id
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

    const sourcePath = await window.inkslateApi.file.openDialog({
      title: '选择要导入的文件',
      properties: ['openFile']
    })
    if (!sourcePath) return

    // 文件名（含扩展名）直接作为 title —— 用户在 Layout 看到的就是真实文件名
    const title = sourcePath.split(/[\\/]/).pop() || '未命名文件'

    // 先创建 note 拿到 noteId，再调 fileNote.create 复制文件
    const note = await window.inkslateApi.notes.create(title, targetNotebookId, targetParentId, undefined, 'file')
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
   *  抓取当前预览区的 innerHTML，连同标题一起传给主进程，
   *  主进程用隐藏 BrowserWindow 加载纯净 HTML 后 printToPDF。 */
  const handleExportPdf = async (nodeId: string) => {
    closeContextMenu()
    try {
      if (selectedNoteId !== nodeId) {
        await selectNote(nodeId)
        // 等 React 把新笔记的预览渲染出来
        await new Promise(r => setTimeout(r, 300))
      }
      const note = notes.find(n => n.id === nodeId)
      const title = note?.title || '未命名笔记'
      // 抓预览区已经渲染好的 HTML（带 mermaid / katex 渲染结果）
      const inner = document.querySelector('.preview .preview-inner') as HTMLElement | null
      const html = inner ? inner.innerHTML : ''
      const ok = await window.inkslateApi.file.exportPdf({ title, html })
      if (!ok) console.log('PDF 导出已取消')
    } catch (e) {
      console.error('PDF 导出失败:', e)
      toast.error('PDF 导出失败：' + (e as Error).message)
    }
  }

  const renderNode = (node: NoteTreeNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.id)
    const isSelected = selectedNoteId === node.id || selectedNotebookId === node.id
    const isRenaming = renaming?.id === node.id

    if (node.type === 'notebook') {
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
        <div key={node.id} style={{ position: 'relative' }}>
          <div
            className={`tree-row ${isSelected ? 'selected' : ''}`}
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
                {showTreeCount && <span className="tree-count">{node.children.length}</span>}
              </>
            )}
          </div>
          {isDragOver && <div style={dropLineStyle} />}
          {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      )
    }

    // ===== 笔记节点 =====
    const noteFormat = notes.find(n => n.id === node.id)?.format
    const formatInfo = {
      markdown: { Icon: MarkdownIcon, color: '#7d8590', title: 'Markdown' },
      html: { Icon: Globe, color: '#e67e22', title: 'HTML' },
      richtext: { Icon: RichTextIcon, color: '#9b59b6', title: '富文本' },
      code: { Icon: CodeIcon, color: '#4a90e2', title: '代码' },
      url: { Icon: Link2, color: '#0ea5e9', title: '网址' },
      file: { Icon: Paperclip, color: '#16a34a', title: '文件' }
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
      <div key={node.id} style={{ position: 'relative' }}>
        <div
          className={`tree-row ${isSelected ? 'selected' : ''}`}
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
              {showTreeCount && <span className="tree-count">{node.children.length}</span>}
            </>
          )}
        </div>
        {isDragOver && <div style={dropLineStyle} />}
                {hasChildren && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    )
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
            <MenuItem icon={<Globe size={14} />} label="网址笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              setUrlDialog({ notebookId: nbId, parentId: target.parentId, name: '', value: 'https://' })
            }} />
            <MenuItem icon={<Paperclip size={14} />} label="文件笔记" onClick={handleCreateFileNote} />
            <MenuItem icon={<FileText size={14} />} label="Markdown 笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名笔记', nbId, target.parentId, undefined, 'markdown')
              setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <MenuItem icon={<FileCode2 size={14} />} label="HTML 笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名 HTML', nbId, target.parentId, undefined, 'html')
              setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <MenuItem icon={<FileType2 size={14} />} label="富文本笔记" onClick={async () => {
              closeContextMenu()
              const target = resolveTarget(contextMenu.node)
              const nbId = target.notebookId || await ensureNotebook()
              const note = await createNote('未命名富文本', nbId, target.parentId, undefined, 'richtext')
              setRenaming({ id: note.id, type: 'note', value: note.title })
            }} />
            <SubMenuItem icon={<CodeIcon size={14} />} label="代码笔记" parentRef={contextMenuRef}>
              {(['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'cpp', 'csharp', 'html', 'css', 'json', 'sql', 'shell', 'plaintext'] as const).map(lang => (
                <MenuItem key={lang} icon={<FileCode2 size={14} />} label={lang} onClick={async () => {
                  closeContextMenu()
                  const target = resolveTarget(contextMenu.node)
                  const nbId = target.notebookId || await ensureNotebook()
                  const note = await createNote(`${lang} 代码片段`, nbId, target.parentId, undefined, 'code', lang)
                  setRenaming({ id: note.id, type: 'note', value: note.title })
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

              {contextMenu.node.type === 'notebook' && (
                <MenuItem
                  icon={<Palette size={14} />}
                  label="更换图标..."
                  onClick={(e) => {
                    const anchor = e.currentTarget as HTMLElement
                    const rect = anchor.getBoundingClientRect()
                    const nb = contextMenu.node!
                    setContextMenu(null)
                    setIconPicker({
                      notebookId: nb.id,
                      currentIcon: nb.icon ?? null,
                      position: { top: rect.top, left: rect.right + 6 }
                    })
                  }}
                />
              )}

              {contextMenu.node.type === 'note' && (
                <>
                  <div style={{ height: 6 }} />
                  <MenuItem icon={<FileCode size={14} />} label="导出为 HTML..." onClick={() => handleExportHtml(contextMenu.node!.id)} />
                  <MenuItem icon={<FileDown size={14} />} label="导出为 PDF..." onClick={() => handleExportPdf(contextMenu.node!.id)} />

                  <div style={{ height: 6 }} />
                  {showGitHistory(contextMenu.node) && (
                    <MenuItem
                      icon={<Clock size={14} />}
                      label="Git 历史快照"
                      onClick={() => {
                        const nodeId = contextMenu.node!.id
                        const nodeType = contextMenu.node!.type
                        setContextMenu(null)
                        setGitHistory({ noteId: nodeType === 'note' ? nodeId : undefined, notebookId: nodeType === 'notebook' ? nodeId : undefined })
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
          position={iconPicker.position}
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
        .tree-row.selected {
          background-color: var(--bg-primary);
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
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
      const note = notes.find(n => n.id === node.id)
      const noteFormat = note?.format || 'markdown'
      const formatColors: Record<string, string> = { markdown: '#7d8590', html: '#e67e22', richtext: '#9b59b6', code: '#4a90e2', url: '#0ea5e9', file: '#16a34a' }
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
          {isFolder ? <Folder size={13} color="var(--text-secondary)" /> : <MoveNoteIcon format={noteFormat} size={13} color={fc} />}
          {node.name || '(未命名)'}
        </div>
      )
      result.push(...renderTree(node.children, depth + 1))
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
