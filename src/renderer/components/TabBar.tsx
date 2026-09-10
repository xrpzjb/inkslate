import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Link2, Paperclip, Globe, ChevronDown } from 'lucide-react'
import { useAppStore } from '../store/app'
import './TabBar.css'

function MarkdownIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6 L5 18" />
      <path d="M5 6 L12 14" />
      <path d="M12 14 L19 6" />
      <path d="M19 6 L19 18" />
    </svg>
  )
}

function CodeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6 L2 12 L8 18" />
      <path d="M16 6 L22 12 L16 18" />
      <path d="M15 4 L9 20" />
    </svg>
  )
}

function RichTextIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6 L20 6" />
      <path d="M12 6 L12 19" />
    </svg>
  )
}

function TableIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 10 L21 10" />
      <path d="M3 15 L21 15" />
      <path d="M9 4 L9 20" />
    </svg>
  )
}

function TabFormatIcon({ format, size = 13 }: { format: string; size?: number }) {
  switch (format) {
    case 'markdown': return <MarkdownIcon size={size} />
    case 'code':     return <CodeIcon size={size} />
    case 'richtext': return <RichTextIcon size={size} />
    case 'url':     return <Link2 size={size} />
    case 'file':     return <Paperclip size={size} />
    case 'html':     return <Globe size={size} />
    case 'spreadsheet': return <TableIcon size={size} />
    default:         return <MarkdownIcon size={size} />
  }
}

const FORMAT_COLORS: Record<string, string> = {
  markdown: '#7d8590',
  html:     '#e67e22',
  richtext: '#9b59b6',
  code:     '#4a90e2',
  url:      '#0ea5e9',
  file:     '#16a34a',
  spreadsheet: '#0d9488',
}

export function TabBar() {
  const openTabs = useAppStore(s => s.openTabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const notes = useAppStore(s => s.notes)
  const activateTab = useAppStore(s => s.activateTab)
  const closeTab = useAppStore(s => s.closeTab)
  const closeTabsExcept = useAppStore(s => s.closeTabsExcept)
  const reorderTabs = useAppStore(s => s.reorderTabs)

  const tabs = openTabs
    .map(id => notes.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n && !n.isDeleted)

  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const tabElsRef = useRef<(HTMLDivElement | null)[]>([])

  // 当前完全不在可视区内的标签（溢出到左右两侧之外的）
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const tabsSig = tabs.map(t => `${t.id}:${t.title}`).join('|')

  // 实测每个标签的可见性（ResizeObserver + scroll），准确决定「更多」是否显示
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    let raf = 0
    const calc = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const left = rect.left
      const right = rect.right
      const hidden: string[] = []
      for (let i = 0; i < tabs.length; i++) {
        const tabEl = tabElsRef.current[i]
        if (!tabEl) continue
        const r = tabEl.getBoundingClientRect()
        if (r.right <= left + 1 || r.left >= right - 1) hidden.push(tabs[i].id)
      }
      setHiddenIds(prev => prev.join(',') === hidden.join(',') ? prev : hidden)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(calc)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    tabElsRef.current.forEach(t => { if (t) ro.observe(t) })
    el.addEventListener('scroll', schedule, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('scroll', schedule)
    }
  }, [tabsSig])

  const hiddenTabs = tabs.filter(t => hiddenIds.includes(t.id))

  // 点外面关闭 more 列表
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: MouseEvent) => {
      if (moreRef.current?.contains(e.target as Node)) return
      setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  // 右键菜单：点击外部 / Esc 关闭
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: MouseEvent) => {
      const menuEl = document.querySelector('.tab-ctx-menu')
      if (menuEl && menuEl.contains(e.target as Node)) return
      setCtxMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  const handleClick = (id: string) => {
    if (id !== activeTabId) activateTab(id)
  }

  // 如果从树状图点击了被隐藏的标签，自动把它移到可见区域最右边
  useEffect(() => {
    if (!activeTabId || hiddenIds.length === 0) return
    if (!hiddenIds.includes(activeTabId)) return
    const visibleCount = tabs.length - hiddenIds.length
    const filtered = openTabs.filter(t => t !== activeTabId)
    const insertIdx = Math.max(0, Math.min(visibleCount - 1, filtered.length))
    const newTabs = [...filtered.slice(0, insertIdx), activeTabId, ...filtered.slice(insertIdx)]
    reorderTabs(newTabs)
  }, [activeTabId, hiddenIds.length])

  /** 点击「更多」里的标签：移到可见标签最右边 + 激活 + 关闭菜单 */
  const handleMoreTabClick = (id: string) => {
    setMoreOpen(false)
    // 把点击的 tab 插到可见区域最后一个位置（溢出区之前一位）
    const visibleCount = tabs.length - hiddenIds.length
    const filtered = openTabs.filter(t => t !== id)
    // 插到 visibleCount - 1 位置，使其成为最后一个可见标签
    const insertIdx = Math.max(0, Math.min(visibleCount - 1, filtered.length))
    const newTabs = [...filtered.slice(0, insertIdx), id, ...filtered.slice(insertIdx)]
    reorderTabs(newTabs)
    if (id !== activeTabId) activateTab(id)
  }

  const handleCtxMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMoreOpen(false)
    setCtxMenu({
      id,
      x: Math.min(e.clientX, window.innerWidth - 190),
      y: Math.min(e.clientY, window.innerHeight - 150)
    })
  }

  const handleMiddleClick = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(id)
    }
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!dragId || dragId === id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(id)
  }

  const handleDrop = (e: React.DragEvent, dropId: string) => {
    e.preventDefault()
    if (!dragId || dragId === dropId) return
    const fromIdx = openTabs.indexOf(dragId)
    const toIdx = openTabs.indexOf(dropId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...openTabs]
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, dragId)
    reorderTabs(next)
    setDragId(null)
    setDropTargetId(null)
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDropTargetId(null)
  }

  if (tabs.length === 0) return null

  const renderTab = (tab: typeof tabs[0], i: number, isOverflow = false) => {
    const isActive = tab.id === activeTabId
    const isDropTarget = dropTargetId === tab.id && dragId && dragId !== tab.id
    return (
      <div
        key={tab.id}
        data-tab-id={tab.id}
        ref={isOverflow ? undefined : (el) => { tabElsRef.current[i] = el }}
        className={
          'tab-item'
          + (isActive ? ' active' : '')
          + (isDropTarget ? ' drop-target' : '')
          + (dragId === tab.id ? ' dragging' : '')
        }
        onClick={() => handleClick(tab.id)}
        onMouseDown={(e) => handleMiddleClick(e, tab.id)}
        onContextMenu={(e) => handleCtxMenu(e, tab.id)}
        draggable
        onDragStart={(e) => handleDragStart(e, tab.id)}
        onDragOver={(e) => handleDragOver(e, tab.id)}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={(e) => handleDrop(e, tab.id)}
        onDragEnd={handleDragEnd}
        title={tab.title || '未命名'}
      >
        <span style={{ color: FORMAT_COLORS[tab.format] ?? '#7d8590', display: 'inline-flex', flexShrink: 0 }}>
          <TabFormatIcon format={tab.format} size={13} />
        </span>
        <span className="tab-title">{tab.title || '未命名'}</span>
        <button
          className="tab-close"
          onClick={(e) => {
            e.stopPropagation()
            closeTab(tab.id)
          }}
          title="关闭标签"
          tabIndex={-1}
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="tab-bar">
      <div className="tab-scroll" ref={barRef}>
        {tabs.map((tab, i) => renderTab(tab, i))}
      </div>
      {hiddenTabs.length > 0 && (
        <div ref={moreRef} className="tab-more-wrap">
          <div
            className={'tab-item tab-more' + (moreOpen ? ' active' : '')}
            onClick={(e) => {
              e.stopPropagation()
              setMoreOpen(!moreOpen)
            }}
            title="更多标签"
          >
            <ChevronDown size={14} />
          </div>
          {moreOpen && (
            <div className="tab-more-popover">
              {hiddenTabs.map((tab, i) => renderTab(tab, tabs.indexOf(tab), true))}
            </div>
          )}
        </div>
      )}
      {ctxMenu && createPortal(
        <div className="tab-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="tab-ctx-item" onClick={() => { closeTabsExcept(ctxMenu.id, 'left'); setCtxMenu(null) }}>
            关闭左侧
          </div>
          <div className="tab-ctx-item" onClick={() => { closeTabsExcept(ctxMenu.id, 'right'); setCtxMenu(null) }}>
            关闭右侧
          </div>
          <div className="tab-ctx-item" onClick={() => { closeTabsExcept(ctxMenu.id, 'other'); setCtxMenu(null) }}>
            关闭其他标签
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
