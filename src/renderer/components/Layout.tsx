import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store/app'
import { Sidebar } from './Sidebar'
import { Editor, AIDialog } from './Editor'
import { Preview } from './Preview'
import { RecycleBinView } from './RecycleBinView'
import { FlashThoughtView } from './FlashThoughtView'
import { IconSidebar } from './IconSidebar'
import { TabBar } from './TabBar'
import { Search, X } from 'lucide-react'
import { Note } from '@shared/types'
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
  const refWidthDuringDrag = useRef(0)
  const onCommitRef = useRef(onCommit)

  useEffect(() => { onCommitRef.current = onCommit }, [onCommit])

  useEffect(() => {
    const divider = dividerRef.current
    const target = targetRef.current
    if (!divider || !target) return

    const onMouseDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startWidthRef.current = target.offsetWidth
      document.body.style.userSelect = 'none'
      divider.setPointerCapture(e.pointerId)
    }

    const onMouseMove = (e: PointerEvent) => {
      if (startXRef.current === 0) return
      const delta = e.clientX - startXRef.current
      const effectiveDelta = direction === 'right' ? delta : -delta
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + effectiveDelta))
      // 直接走 React state（通过 onCommitRef 的旁路 setState），
      // 不操作 DOM inline style，避免后续 toggleVisible 时 stale style 冲突
      // 拖动期间用一个临时 ref 持有最新值，pointerup 时再 commit
      if (refWidthDuringDrag.current !== newWidth) {
        refWidthDuringDrag.current = newWidth
        // 实时反馈：直接写 inline style 仍然 OK，但必须在 pointerup 时清掉
        target.style.width = `${newWidth}px`
      }
    }

    const onMouseUp = (e: PointerEvent) => {
      if (startXRef.current === 0) return
      startXRef.current = 0
      const finalWidth = refWidthDuringDrag.current
      // 清掉 inline style，让 React state 接管（避免与 style={{ width }} 冲突）
      target.style.width = ''
      onCommitRef.current(finalWidth)
      divider.releasePointerCapture(e.pointerId)
      document.body.style.userSelect = ''
    }

    // 双击分隔条 → 重置回默认值（minWidth 之上、maxWidth 之下、中位数）。
    // —— 拖死之后的"逃生通道"，免得点右下角按钮不响应以为坏了
    const onDoubleClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const defaultWidth = Math.round((minWidth + maxWidth) / 4) // 偏小的默认值
      target.style.width = ''  // 清掉 inline style，让 React state 接管
      onCommitRef.current(defaultWidth)
    }

    divider.addEventListener('pointerdown', onMouseDown)
    divider.addEventListener('pointermove', onMouseMove)
    divider.addEventListener('pointerup', onMouseUp)
    divider.addEventListener('dblclick', onDoubleClick)

    return () => {
      divider.removeEventListener('pointerdown', onMouseDown)
      divider.removeEventListener('pointermove', onMouseMove)
      divider.removeEventListener('pointerup', onMouseUp)
      divider.removeEventListener('dblclick', onDoubleClick)
    }
  }, [dividerRef, targetRef, direction, minWidth, maxWidth])
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

  // 搜索状态
  const notes = useAppStore(s => s.notes)
  const notebooks = useAppStore(s => s.notebooks)
  const selectNote = useAppStore(s => s.selectNote)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Note[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchPopupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchPopupRef.current && searchPopupRef.current.contains(e.target as Node)) return
      if (searchInputRef.current && searchInputRef.current.contains(e.target as Node)) return
      setSearchResults([])
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const doSearch = (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    const lower = q.trim().toLowerCase()
    setSearchResults(notes.filter(n =>
      n.title.toLowerCase().includes(lower) ||
      n.content.toLowerCase().includes(lower)
    ))
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearchQuery(q)
    doSearch(q)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setSearchQuery(''); setSearchResults([]); return }
    if (e.key === 'Enter') doSearch(searchQuery)
  }

  const handleResultClick = (noteId: string) => {
    setSearchQuery('')
    setSearchResults([])
    selectNote(noteId)
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
          layout: { ...settings.layout, sidebarWidth }
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

  return (
    <div className="layout-body" style={{ height: '100%', width: '100%' }}>
      <IconSidebar />
      <div
        ref={sidebarRef}
        className={`layout-sidebar ${!sidebarVisible && !aiPanelOpen ? 'collapsed' : ''}`}
        style={{ width: sidebarVisible ? sidebarWidth : 0 }}
      >
        <div className="panel-header" ref={sidebarHeaderRef} style={{ position: 'relative', padding: '4px 10px' }}>
          {/* 搜索框：直接作为 panel-header 内容，高度撑满 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', padding: '0 4px', flex: 1, height: 36, boxSizing: 'border-box' }}>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="快速搜索"
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                padding: '5px 0',
                fontSize: 13,
                color: 'var(--text-primary)',
                outline: 'none',
                minWidth: 0
              }}
            />
            {searchQuery ? (
              <X
                size={14}
                style={{ color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}
                onClick={() => { setSearchQuery(''); setSearchResults([]) }}
              />
            ) : (
              <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            )}
          </div>
          {/* 搜索结果弹窗：居中显示 */}
          {searchResults.length > 0 && (
            <div
              ref={searchPopupRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'calc(100% - 8px)',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                boxShadow: 'var(--shadow-md)',
                zIndex: 1000,
                maxHeight: 400,
                overflowY: 'auto',
                padding: '4px 0'
              }}
            >
              <div style={{ padding: '4px 10px 6px', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                快速搜索: {searchResults.length} 条结果
              </div>
              {searchResults.map(note => {
                const notebook = notebooks.find(nb => nb.id === note.notebookId)
                const formatColors: Record<string, string> = {
                  markdown: '#7d8590', html: '#e67e22', richtext: '#9b59b6',
                  code: '#4a90e2', url: '#0ea5e9', file: '#16a34a', spreadsheet: '#f59e0b'
                }
                // 提取内容匹配片段
                const q = searchQuery.trim()
                let snippet = ''
                if (note.content && q) {
                  const idx = note.content.toLowerCase().indexOf(q.toLowerCase())
                  if (idx >= 0) {
                    const start = Math.max(0, idx - 20)
                    const end = Math.min(note.content.length, idx + q.length + 40)
                    snippet = (start > 0 ? '…' : '') + note.content.slice(start, end).replace(/\n/g, ' ') + (end < note.content.length ? '…' : '')
                  }
                }
                return (
                  <div
                    key={note.id}
                    onClick={() => handleResultClick(note.id)}
                    style={{
                      padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                      color: 'var(--text-primary)', borderRadius: 4, margin: '0 4px',
                      display: 'flex', alignItems: 'flex-start', gap: 6, flexDirection: 'column'
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                      <span style={{ color: formatColors[note.format] ?? '#7d8590', flexShrink: 0, fontSize: 12 }}>●</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>{note.title}</span>
                      {notebook && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{notebook.name}</span>}
                    </div>
                    {snippet && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingLeft: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {snippet}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
