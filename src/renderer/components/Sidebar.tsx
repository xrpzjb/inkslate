import { useState, useMemo, useRef, useEffect } from 'react'
import { useAppStore, buildNoteTree } from '../store/app'
import { NoteTreeNode, Note } from '@shared/types'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, FileText,
  Trash2, Edit3, FilePlus, FolderPlus, FileCode2, FileType2, Heading1,
  FileDown, FileCode, Globe, Inbox
} from 'lucide-react'

/** Markdown 专属图标：圆角文件壳 + M↓ 标识
 *  lucide-react 没有现成 md 图标，用官方 Mark 的简化版（更贴近 GitHub/VSCode 的视觉惯例）
 */
function MarkdownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Markdown"
    >
      <path d="M3.5 1.5h5.379a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061v6.379a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H11.5a1 1 0 0 0 1-1V6.621a.5.5 0 0 0-.146-.354L9.232 3.146A.5.5 0 0 0 8.879 3H3.5z" />
      <path d="M3.85 11V6.2h1.2l1.45 1.78L7.95 6.2h1.2V11H7.95V8.32L6.5 9.94 5.05 8.32V11H3.85zm7.55 0l-1.7-2.1h1.2V6.2h1.6v2.7h1.2L11.4 11z" />
    </svg>
  )
}

/** 代码笔记专属图标：圆角文件壳 + </> 标识
 *  跟 MarkdownIcon 同款文件壳，里面换成 </>，跟 MD 一眼区分（同时跟 lucide 所有 </> 风格也都不一样）
 */
function CodeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Code"
    >
      {/* 文件壳 */}
      <path d="M3.5 1.5h5.379a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061v6.379a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H11.5a1 1 0 0 0 1-1V6.621a.5.5 0 0 0-.146-.354L9.232 3.146A.5.5 0 0 0 8.879 3H3.5z" />
      {/* <  */}
      <path d="M6.1 6.4L4.5 8l1.6 1.6a.6.6 0 0 1-.85.85l-2.1-2.1a.6.6 0 0 1 0-.85l2.1-2.1a.6.6 0 0 1 .85.85z" />
      {/* >  */}
      <path d="M9.9 6.4L11.5 8l-1.6 1.6a.6.6 0 0 0 .85.85l2.1-2.1a.6.6 0 0 0 0-.85l-2.1-2.1a.6.6 0 0 0-.85.85z" />
      {/* / */}
      <path d="M8.95 4.5a.5.5 0 0 0-.6.3l-1.6 6.4a.5.5 0 0 0 .95.3l1.6-6.4a.5.5 0 0 0-.3-.6z" />
    </svg>
  )
}

export function Sidebar() {
  const notebooks = useAppStore(s => s.notebooks)
  const notes = useAppStore(s => s.notes)
  const selectedNoteId = useAppStore(s => s.selectedNoteId)
  const selectNote = useAppStore(s => s.selectNote)
  const createNote = useAppStore(s => s.createNote)
  const createNotebook = useAppStore(s => s.createNotebook)
  const renameNotebook = useAppStore(s => s.renameNotebook)
  const renameNote = useAppStore(s => s.renameNote)
  const deleteNotebook = useAppStore(s => s.deleteNotebook)
  const deleteNote = useAppStore(s => s.deleteNote)
  const viewMode = useAppStore(s => s.viewMode)
  const setViewMode = useAppStore(s => s.setViewMode)
  const recycleBinCount = useAppStore(s => s.recycleBinCount)
  const loadRecycleBin = useAppStore(s => s.loadRecycleBin)

  const tree = useMemo(() => buildNoteTree(notebooks, notes), [notebooks, notes])
  const [expanded, setExpanded] = useState<Set<string>>(new Set(notebooks.map(n => n.id)))
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: NoteTreeNode } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; type: 'notebook' | 'note'; value: string } | null>(null)

  useEffect(() => {
    if (!selectedNoteId) return
    const note = notes.find(n => n.id === selectedNoteId)
    if (note?.parentId) {
      setExpanded(prev => {
        if (prev.has(note.parentId!)) return prev
        return new Set([...prev, note.parentId!])
      })
    }
    // 选中变化时关闭重命名（防止输入框卡在另一行）
    setRenaming(prev => (prev && prev.id !== selectedNoteId ? null : prev))
  }, [selectedNoteId])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleContextMenu = (e: React.MouseEvent, node: NoteTreeNode) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleNewNotebook = async (parentId: string | null) => {
    closeContextMenu()
    await createNotebook('鏂扮瑪璁版湰', parentId)
  }

  const handleRename = (node: NoteTreeNode) => {
    closeContextMenu()
    setRenaming({ id: node.id, type: node.type, value: node.name })
  }

  const commitRename = async () => {
    if (!renaming) return
    const { id, type, value } = renaming
    setRenaming(null)
    if (!value.trim()) return
    if (type === 'notebook') {
      await renameNotebook(id, value.trim())
    } else {
      await renameNote(id, value.trim())
    }
  }

  const handleDelete = async (node: NoteTreeNode) => {
    closeContextMenu()
    if (!confirm(`确认删除 "${node.name}"？此操作不可撤销。`)) return
    if (node.type === 'notebook') {
      await deleteNotebook(node.id)
    } else {
      await deleteNote(node.id)
    }
  }

  /** 导出当前右键的笔记为 HTML 文件 */
  const handleExportHtml = async (nodeId: string) => {
    closeContextMenu()
    try {
      const note = await window.inkslateApi.notes.get(nodeId)
      if (!note) {
        alert('笔记不存在或已被删除')
        return
      }
      const path = await window.inkslateApi.file.export('html')
      if (!path) return  // 用户取消
      const html = wrapNoteAsHtml(note)
      await window.inkslateApi.file.write(path, html)
    } catch (e) {
      console.error('HTML 导出失败:', e)
      alert('HTML 导出失败：' + (e as Error).message)
    }
  }

  /** 导出当前右键的笔记为 PDF 文件。
   *  printToPDF 抓的是当前 web contents，所以非当前笔记要先切过去再导出。 */
  const handleExportPdf = async (nodeId: string) => {
    closeContextMenu()
    try {
      if (selectedNoteId !== nodeId) {
        await selectNote(nodeId)
        // 等 React 把新笔记的预览渲染出来
        await new Promise(r => setTimeout(r, 200))
      }
      const ok = await window.inkslateApi.file.exportPdf()
      if (!ok) console.log('PDF 导出已取消')
    } catch (e) {
      console.error('PDF 导出失败:', e)
      alert('PDF 导出失败：' + (e as Error).message)
    }
  }

  const renderNode = (node: NoteTreeNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.id)
    const isSelected = selectedNoteId === node.id
    const isRenaming = renaming?.id === node.id

    if (node.type === 'notebook') {
      return (
        <div key={node.id}>
          <div
            className={`tree-row ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => { setRenaming(null); toggleExpand(node.id) }}
            onContextMenu={(e) => handleContextMenu(e, node)}
            onDoubleClick={() => handleRename(node)}
          >
            <span
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
              style={{ display: 'inline-flex', width: 16, cursor: 'pointer' }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span style={{ marginRight: 4, fontSize: 14 }}>
              {node.icon ?? (isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />)}
            </span>
            {isRenaming ? (
              <input
                autoFocus
                value={renaming.value}
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                style={{ flex: 1, padding: '2px 4px', fontSize: 13 }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tree-label">{node.name}</span>
            )}
          </div>
          {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      )
    }

    // 绗旇鑺傜偣
    const noteFormat = notes.find(n => n.id === node.id)?.format
    const formatInfo = {
      markdown: { Icon: MarkdownIcon, color: '#7d8590', title: 'Markdown' },
      html: { Icon: Globe, color: '#e67e22', title: 'HTML' },
      richtext: { Icon: FileType2, color: '#9b59b6', title: '富文本' },
      code: { Icon: CodeIcon, color: '#4a90e2', title: '代码' }
    }[noteFormat ?? 'markdown'] ?? { Icon: MarkdownIcon, color: 'var(--text-secondary)', title: '笔记' }
    const { Icon: FormatIcon, color: formatColor, title: formatTitle } = formatInfo
    const hasChildren = node.children.length > 0

    return (
      <div key={node.id}>
        <div
          className={`tree-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => { setRenaming(null); selectNote(node.id) }}
          onContextMenu={(e) => handleContextMenu(e, node)}
          onDoubleClick={() => handleRename(node)}
        >
                    <span
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleExpand(node.id) }}
            style={{ display: 'inline-flex', width: 16, color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            {hasChildren
              ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
              : null}
          </span>
          <span
            title={formatTitle}
            style={{ marginRight: 4, display: 'inline-flex', color: formatColor }}
          >
            <FormatIcon size={14} />
          </span>
          {isRenaming ? (
            <input
              autoFocus
              value={renaming.value}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(null)
              }}
              style={{ flex: 1, padding: '2px 4px', fontSize: 13 }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tree-label">{node.name}</span>
          )}
        </div>
                {hasChildren && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }} onClick={closeContextMenu}>
        <div className="tree" style={{ padding: '4px 0' }}>
          {tree.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
              还没有笔记本
              <br />
              <span style={{ fontSize: 11, opacity: 0.7 }}>右键或菜单"文件"→"新建"</span>
            </div>
          ) : (
            tree.map(node => renderNode(node))
        )}
      </div>

            {contextMenu && (
        <div
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
          >
            <MenuItem icon={<FileText size={14} />} label="Markdown 笔记" onClick={() => {
              closeContextMenu()
              const node = contextMenu.node
              if (node.type === 'notebook') {
                createNote('未命名笔记', node.id, null, undefined, 'markdown')
              } else {
                // 笔记下创建 → 作为子笔记嵌入
                const noteData = notes.find(n => n.id === node.id)
                createNote('未命名笔记', noteData?.notebookId ?? notebooks[0]?.id ?? '', node.id, undefined, 'markdown')
              }
            }} />
            <MenuItem icon={<FileCode2 size={14} />} label="HTML 笔记" onClick={() => {
              closeContextMenu()
              const node = contextMenu.node
              if (node.type === 'notebook') {
                createNote('未命名 HTML', node.id, null, undefined, 'html')
              } else {
                const noteData = notes.find(n => n.id === node.id)
                createNote('未命名 HTML', noteData?.notebookId ?? notebooks[0]?.id ?? '', node.id, undefined, 'html')
              }
            }} />
            <MenuItem icon={<FileType2 size={14} />} label="富文本笔记" onClick={() => {
              closeContextMenu()
              const node = contextMenu.node
              if (node.type === 'notebook') {
                createNote('未命名富文本', node.id, null, undefined, 'richtext')
              } else {
                const noteData = notes.find(n => n.id === node.id)
                createNote('未命名富文本', noteData?.notebookId ?? notebooks[0]?.id ?? '', node.id, undefined, 'richtext')
              }
            }} />
            <SubMenuItem icon={<CodeIcon size={14} />} label="代码笔记">
              {(['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'cpp', 'csharp', 'html', 'css', 'json', 'sql', 'shell', 'plaintext'] as const).map(lang => (
                <MenuItem key={lang} icon={<FileCode2 size={14} />} label={lang} onClick={() => {
                  closeContextMenu()
                  const node = contextMenu.node
                  const targetNotebookId = node.type === 'notebook'
                    ? node.id
                    : (notes.find(n => n.id === node.id)?.notebookId ?? notebooks[0]?.id ?? '')
                  const targetParentId = node.type === 'note' ? node.id : null
                  createNote(`${lang} 代码片段`, targetNotebookId, targetParentId, undefined, 'code', lang)
                }} />
              ))}
            </SubMenuItem>
          </SubMenuItem>

                    <MenuItem icon={<FolderPlus size={14} />} label="新建子笔记本" onClick={() => handleNewNotebook(contextMenu.node.id)} />

          <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

          <MenuItem icon={<Edit3 size={14} />} label="重命名" onClick={() => handleRename(contextMenu.node)} />

          {/* 导出仅对笔记有效；右键笔记本时不显示 */}
          {contextMenu.node.type === 'note' && (
            <>
              <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
              <MenuItem
                icon={<FileCode size={14} />}
                label="导出为 HTML..."
                onClick={() => handleExportHtml(contextMenu.node.id)}
              />
              <MenuItem
                icon={<FileDown size={14} />}
                label="导出为 PDF..."
                onClick={() => handleExportPdf(contextMenu.node.id)}
              />
            </>
          )}

          <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

          <MenuItem icon={<Trash2 size={14} />} label="删除" onClick={() => handleDelete(contextMenu.node)} danger />
        </div>
      )}

      <style>{`
        .tree-row {
          display: flex;
          align-items: center;
          height: 26px;
          font-size: 13px;
          color: var(--text-primary);
          cursor: pointer;
          user-select: none;
          gap: 4px;
        }
        .tree-row:hover {
          background-color: var(--bg-hover);
        }
        .tree-row.selected {
          background-color: var(--bg-active);
          color: var(--accent-color);
        }
        .tree-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
      </div>

      {/* 底部：回收站入口（带 badge） */}
      <div style={{
        borderTop: '1px solid var(--border-color)',
        flexShrink: 0,
        padding: '4px 0'
      }}>
        <div
          onClick={() => {
            if (viewMode !== 'recycle-bin') {
              loadRecycleBin()
              setViewMode('recycle-bin')
            } else {
              setViewMode('notes')
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 28,
            padding: '0 12px',
            gap: 8,
            cursor: 'pointer',
            color: viewMode === 'recycle-bin' ? 'var(--accent-color)' : 'var(--text-secondary)',
            background: viewMode === 'recycle-bin' ? 'var(--bg-active)' : 'transparent',
            fontSize: 12
          }}
          onMouseEnter={(e) => {
            if (viewMode !== 'recycle-bin') {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (viewMode !== 'recycle-bin') {
              e.currentTarget.style.background = 'transparent'
            }
          }}
        >
          <Inbox size={13} />
          <span style={{ flex: 1 }}>回收站</span>
          {recycleBinCount > 0 && (
            <span style={{
              fontSize: 10,
              background: viewMode === 'recycle-bin' ? 'var(--accent-color)' : 'var(--bg-tertiary)',
              color: viewMode === 'recycle-bin' ? '#fff' : 'var(--text-tertiary)',
              padding: '1px 6px',
              borderRadius: 8,
              fontWeight: 500
            }}>
              {recycleBinCount}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
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
function SubMenuItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ left: rect.right, top: rect.top })
      setOpen(true)
    }
  }

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setOpen(false)}
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
