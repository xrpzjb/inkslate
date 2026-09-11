import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/app'
import { Sidebar } from './Sidebar'
import { Editor, AIDialog } from './Editor'
import { Preview } from './Preview'
import { RecycleBinView } from './RecycleBinView'
import { FlashThoughtView } from './FlashThoughtView'
import { IconSidebar } from './IconSidebar'
import { TabBar } from './TabBar'
import { Crosshair, ChevronsDownUp, ChevronsUpDown, Home } from 'lucide-react'

import '../styles/layout.css'

/** 侧栏 / 编辑器 / 预览 之间的水平拖拽 resize */
function useHorizontalResize(
  dividerRef: React.RefObject<HTMLElement>,
  targetRef: React.RefObject<HTMLElement>,
  direction: 'right' | 'left',
  onCommit: (finalWidth: number) => void,
  minWidth: number = 160,
  maxWidth: number = 2000
) {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const onCommitRef = useRef(onCommit)
  const directionRef = useRef(direction)
  const minRef = useRef(minWidth)
  const maxRef = useRef(maxWidth)

  useEffect(() => { onCommitRef.current = onCommit })
  useEffect(() => { directionRef.current = direction })
  useEffect(() => { minRef.current = minWidth })
  useEffect(() => { maxRef.current = maxWidth })

  useEffect(() => {
    const divider = dividerRef.current
    const target = targetRef.current
    if (!divider || !target) return

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startWidthRef.current = target.offsetWidth
      document.body.style.userSelect = 'none'
      // 拖动期间把事件挂到 document 上，避免鼠标移出 divider 后收不到 move/up
      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
      try { divider.setPointerCapture(e.pointerId) } catch {}
    }

    const onPointerMove = (e: PointerEvent) => {
      if (startXRef.current === 0) return
      const delta = e.clientX - startXRef.current
      const effectiveDelta = directionRef.current === 'right' ? delta : -delta
      const newWidth = Math.max(minRef.current, Math.min(maxRef.current, startWidthRef.current + effectiveDelta))
      target.style.width = `${newWidth}px`
    }

    const onPointerUp = () => {
      if (startXRef.current === 0) return
      startXRef.current = 0
      const finalWidth = target.offsetWidth
      // 清掉 inline style，让 React state 接管（避免与 style={{ width }} 冲突）
      target.style.width = ''
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.userSelect = ''
      onCommitRef.current(finalWidth)
    }

    // 双击分隔条 → 重置回默认值（minWidth 之上、maxWidth 之下、中位数）。
    // —— 拖死之后的"逃生通道"，免得点右下角按钮不响应以为坏了
    const onDoubleClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const defaultWidth = Math.round((minRef.current + maxRef.current) / 4) // 偏小的默认值
      target.style.width = ''  // 清掉 inline style，让 React state 接管
      onCommitRef.current(defaultWidth)
    }

    divider.addEventListener('pointerdown', onPointerDown)
    divider.addEventListener('dblclick', onDoubleClick)

    return () => {
      divider.removeEventListener('pointerdown', onPointerDown)
      divider.removeEventListener('dblclick', onDoubleClick)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.userSelect = ''
    }
  }, [dividerRef, targetRef])
}

export function Layout() {
  const sidebarVisible = useAppStore(s => s.sidebarVisible)
  const previewVisible = useAppStore(s => s.previewVisible)
  const editorVisible = useAppStore(s => s.editorVisible)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const togglePreview = useAppStore(s => s.togglePreview)
  const toggleEditor = useAppStore(s => s.toggleEditor)
  const settings = useAppStore(s => s.settings)
  const currentNote = useAppStore(s => s.currentNote)
  const notes = useAppStore(s => s.notes)
  const notebooks = useAppStore(s => s.notebooks)
  const viewMode = useAppStore(s => s.viewMode)
  const isRecycleBin = viewMode === 'recycle-bin'
  const isFlashThoughts = viewMode === 'flash-thoughts'

  const [sidebarWidth, setSidebarWidth] = useState(settings?.layout.sidebarWidth ?? 260)

  // AI 侧栏面板
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiPanelConvs, setAiPanelConvs] = useState<Record<string, Array<{ role: 'user' | 'assistant'; content: string }>>>({})
  const prevSidebarVisible = useRef(sidebarVisible)
  // AI 对话持久化到本地数据库（ai_conversations 表，不参与 git 同步）：启动时按需读取，变更时防抖写入
  const aiConvsPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistAiConvs = useCallback((convs: Record<string, Array<{ role: 'user' | 'assistant'; content: string }>>) => {
    if (aiConvsPersistTimer.current) clearTimeout(aiConvsPersistTimer.current)
    aiConvsPersistTimer.current = setTimeout(() => {
      for (const [noteId, history] of Object.entries(convs)) {
        if (history.length > 0) window.inkslateApi.ai.setConversation(noteId, history).catch(() => {})
        else window.inkslateApi.ai.clearConversation(noteId).catch(() => {})
      }
    }, 400)
  }, [])
  // 切换笔记时从数据库恢复该笔记的对话（内存中没有才读，避免覆盖本会话变更）
  useEffect(() => {
    const noteId = currentNote?.id
    if (!noteId) return
    if (aiPanelConvs[noteId]) return
    let cancelled = false
    window.inkslateApi.ai.getConversation(noteId).then(saved => {
      if (cancelled || !saved || saved.length === 0) return
      setAiPanelConvs(prev => (prev[noteId] ? prev : { ...prev, [noteId]: saved }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [currentNote?.id])

  useEffect(() => {
    const onOpen = () => {
      prevSidebarVisible.current = sidebarVisible
      if (!sidebarVisible) toggleSidebar()
      if (sidebarWidth < 200) setSidebarWidth(260)
      setAiPanelOpen(true)
    }
    window.addEventListener('inkslate:open-ai-panel', onOpen)
    return () => window.removeEventListener('inkslate:open-ai-panel', onOpen)
  }, [sidebarVisible, sidebarWidth, toggleSidebar])
  const [previewWidth, setPreviewWidth] = useState(420)
  // 窗口宽度：用于动态计算 max 拖动上界，保证任何一栏都不会把其他挤到看不见
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const sidebarDividerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const previewDividerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // 侧栏工具栏
  const currentNoteId = useAppStore(s => s.selectedNoteId)

  const handleLocateNote = () => {
    if (currentNoteId) {
      window.dispatchEvent(new CustomEvent('inkslate:sidebar-locate-note', { detail: { noteId: currentNoteId } }))
    }
  }
  const handleCollapseAll = () => {
    window.dispatchEvent(new CustomEvent('inkslate:sidebar-expand-all', { detail: { expanded: false } }))
  }
  const handleExpandAll = () => {
    window.dispatchEvent(new CustomEvent('inkslate:sidebar-expand-all', { detail: { expanded: true } }))
  }

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isRichText = currentNote?.format === 'richtext'
  const isCode = currentNote?.format === 'code'
  const isSpreadsheet = currentNote?.format === 'spreadsheet'
  const effectivePreviewVisible = previewVisible && !isRichText && !isCode && !isSpreadsheet
  // url/file 笔记不渲染 Editor（见下方条件渲染），editor 这一列物理上为空。
  // 即便全局 editorVisible=true（上一个 md 笔记打开过），editor 也不占位。
  // 真正的"editor 是否占位"要参考这个。
  const isNoEditorFormat = currentNote?.format === 'url' || currentNote?.format === 'file'
  const editorEffectivelyVisible = editorVisible && !isNoEditorFormat

  // 拖动 max：保证编辑器至少有 240px 可见，预览至少有 200px 可见（隐藏时给 0）
  // —— 物理上"挤不掉"另一栏
  const sidebarMax = Math.max(160, windowWidth - (effectivePreviewVisible ? 200 : 0) - 240 - 22)
  const previewMax = Math.max(200, windowWidth - sidebarWidth - 240 - 22)

  useHorizontalResize(
    sidebarDividerRef,
    sidebarRef,
    'right',
    useCallback((w: number) => setSidebarWidth(w), []),
    160,
    sidebarMax
  )

  useHorizontalResize(
    previewDividerRef,
    previewRef,
    'left',
    useCallback((w: number) => setPreviewWidth(w), []),
    200,
    previewMax
  )

  const sidebarHeaderRef = useRef<HTMLDivElement>(null)
  const lastSavedWidth = useRef(sidebarWidth)
  useEffect(() => {
    if (lastSavedWidth.current !== sidebarWidth && settings) {
      const timer = setTimeout(() => {
        window.inkslateApi.settings.update({
          layout: { sidebarWidth }
        }).catch(() => {})
        lastSavedWidth.current = sidebarWidth
      }, 500) // 叉姈 500ms
      return () => clearTimeout(timer)
    }
  }, [sidebarWidth, settings])

  useEffect(() => {
    if (settings?.layout.sidebarWidth) {
      setSidebarWidth(settings.layout.sidebarWidth)
    }
  }, [settings])

  // 当前笔记的层级路径（笔记本 › 子笔记本 › 父笔记 › 当前笔记）
  // 与 buildNoteTree 一致：note 的 parentId 为空时视为挂在 notebookId 下
  // 每一项带上 id/type，供面包屑逐级点击定位
  type Crumb = { id: string; name: string; type: 'notebook' | 'note' }
  const breadcrumb = useMemo<Crumb[]>(() => {
    if (!currentNote) return []
    const nodeMap = new Map<string, { name: string; parentId: string | null; type: 'notebook' | 'note' }>()
    for (const nb of notebooks) nodeMap.set(nb.id, { name: nb.name, parentId: nb.parentId, type: 'notebook' })
    for (const n of notes) nodeMap.set(n.id, { name: n.title, parentId: n.parentId ?? n.notebookId, type: 'note' })
    const chain: Crumb[] = []
    const seen = new Set<string>()
    let cur: string | null = currentNote.id
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const node = nodeMap.get(cur)
      if (!node) break
      chain.unshift({ id: cur, name: node.name, type: node.type })
      cur = node.parentId
    }
    return chain
  }, [currentNote, notes, notebooks])

  // 逐级定位：点击面包屑某一段 → 在树中展开并滚动到该节点
  const locateNode = (id: string, type: 'notebook' | 'note') => {
    window.dispatchEvent(new CustomEvent('inkslate:sidebar-locate-node', { detail: { id, type } }))
  }

  return (
    <div className="layout-body" style={{ height: '100%', width: '100%' }}>
      <IconSidebar />
      <div
        ref={sidebarRef}
        className={`layout-sidebar ${!sidebarVisible && !aiPanelOpen ? 'collapsed' : ''}`}
        style={{ width: sidebarVisible ? sidebarWidth : 0 }}
      >
        <div className="panel-header" ref={sidebarHeaderRef} style={{ position: 'relative', padding: '2px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', height: '100%' }}>
            {/* 左侧：当前笔记所属层级路径（不含笔记自身名称），每一级都可单独点击定位 */}
            {breadcrumb.length > 1 ? (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: '0 2px',
                  color: 'var(--text-tertiary)',
                  fontSize: 12,
                  userSelect: 'none',
                  overflow: 'hidden'
                }}
              >
                <Home size={13} style={{ flexShrink: 0 }} />
                {breadcrumb.slice(0, -1).map((seg, i, arr) => (
                  <span key={seg.id} style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                    {i > 0 && <span style={{ margin: '0 2px', opacity: 0.5, flexShrink: 0 }}>›</span>}
                    <span
                      onClick={() => locateNode(seg.id, seg.type)}
                      title={`定位到「${seg.name}」`}
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        padding: '0 4px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: i === arr.length - 1 ? 'var(--text-secondary)' : 'inherit'
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {seg.name}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {/* 右侧：树状图工具 */}
            <button
              onClick={handleLocateNote}
              title="定位当前笔记"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Crosshair size={14} />
            </button>
            <button
              onClick={handleCollapseAll}
              title="折叠全部笔记本"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <ChevronsDownUp size={14} />
            </button>
            <button
              onClick={handleExpandAll}
              title="展开全部笔记本"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <ChevronsUpDown size={14} />
            </button>
          </div>
        </div>
        {aiPanelOpen ? (
          <AIDialog
            mode="panel"
            noteId={currentNote?.id ?? ''}
            noteTitle={currentNote?.title ?? ''}
            noteContent={currentNote?.content ?? ''}
            noteFormat={currentNote?.format ?? 'markdown'}
            history={currentNote?.id ? (aiPanelConvs[currentNote.id] || []) : []}
            onHistoryChange={(h) => {
              if (currentNote?.id) {
                setAiPanelConvs(prev => {
                  const next = { ...prev, [currentNote.id]: h }
                  persistAiConvs(next)
                  return next
                })
              }
            }}
            onClose={() => {
              setAiPanelOpen(false)
              if (!prevSidebarVisible.current) toggleSidebar()
            }}
            onReplace={(text) => {
              const cur = useAppStore.getState().currentNote
              if (cur) {
                useAppStore.getState().updateNote(cur.id, { content: text })
              }
              useAppStore.getState().updateCurrentNoteDraft({ content: text })
              window.dispatchEvent(new CustomEvent('inkslate:ai-replace', { detail: text }))
            }}
          />
        ) : sidebarVisible ? <Sidebar /> : null}
      </div>

            {(sidebarVisible || aiPanelOpen) && <div ref={sidebarDividerRef} className="layout-divider" />}

            {isRecycleBin ? (
              <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                <RecycleBinView />
              </div>
            ) : isFlashThoughts ? (
              <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                <FlashThoughtView />
              </div>
            ) : (
              <>
                {/* 多标签页：覆盖 editor + preview 两个面板共用的"顶部标题栏" */}
                <div style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <TabBar />
                  <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    <div
                      className={`layout-editor ${!editorVisible ? 'collapsed' : ''}`}
                      style={{
                        // url / file 笔记都不渲染 Editor，整列给 preview
                        width: (currentNote?.format === 'url' || currentNote?.format === 'file') ? 0 : (editorVisible ? 'auto' : 0),
                        flex: (currentNote?.format === 'url' || currentNote?.format === 'file') ? 'none' : (editorVisible ? 1 : 'none'),
                        display: (currentNote?.format === 'url' || currentNote?.format === 'file') ? 'none' : undefined
                      }}
                    >
                      {editorVisible && currentNote?.format !== 'url' && currentNote?.format !== 'file' && <Editor />}
                    </div>

                    <div
                      ref={previewDividerRef}
                      className="layout-divider right"
                      style={{
                        visibility: (effectivePreviewVisible && editorEffectivelyVisible) ? 'visible' : 'hidden',
                        pointerEvents: (effectivePreviewVisible && editorEffectivelyVisible) ? 'auto' : 'none'
                      }}
                    />

                    <div
                      ref={previewRef}
                      className={`layout-preview ${!effectivePreviewVisible ? 'collapsed' : ''}`}
                      style={{
                        // 关键设计：
                        //  - editor 实际占位 + preview 显示：preview 用 previewWidth，preview-divider 可拖
                        //  - editor 不占位（editorVisible=false 或 url/file 格式）+ preview 显示：
                        //    preview 用 flex: 1 接管右侧全部空间，左边界保持在 preview-divider 位置不动，
                        //    divider 不可拖（见上面 visibility 设置）
                        //  - preview 隐藏：preview width 0
                        // —— 修复：之前只看 editorVisible，导致 MD 打开 editor 后切到 url/file 标签，
                        //    preview 还卡在 previewWidth 不肯填满，右侧半屏空白
                        width: effectivePreviewVisible
                          ? (editorEffectivelyVisible ? previewWidth : 'auto')
                          : 0,
                        flex: effectivePreviewVisible ? (editorEffectivelyVisible ? 'none' : 1) : 'none',
                        minWidth: 0
                      }}
                    >
                      {effectivePreviewVisible && <Preview key={currentNote?.id} />}
                    </div>
                  </div>
                </div>
              </>
            )}
    </div>
  )
}
