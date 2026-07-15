import { useRef, useState, useEffect } from 'react'
import { X, Link2, Paperclip, Globe } from 'lucide-react'
import { useAppStore } from '../store/app'
import './TabBar.css'

/** Markdown 笔记图标 */
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

/** 代码笔记图标 */
function CodeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6 L2 12 L8 18" />
      <path d="M16 6 L22 12 L16 18" />
      <path d="M15 4 L9 20" />
    </svg>
  )
}

/** 富文本笔记图标 */
function RichTextIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6 L20 6" />
      <path d="M12 6 L12 19" />
    </svg>
  )
}

/** 根据笔记格式返回对应图标组件 */
function TabFormatIcon({ format, size = 13 }: { format: string; size?: number }) {
  switch (format) {
    case 'markdown': return <MarkdownIcon size={size} />
    case 'code':     return <CodeIcon size={size} />
    case 'richtext': return <RichTextIcon size={size} />
    case 'url':     return <Link2 size={size} />
    case 'file':     return <Paperclip size={size} />
    case 'html':     return <Globe size={size} />
    default:         return <MarkdownIcon size={size} />
  }
}

/** 各格式图标颜色 */
const FORMAT_COLORS: Record<string, string> = {
  markdown: '#7d8590',
  html:     '#e67e22',
  richtext: '#9b59b6',
  code:     '#4a90e2',
  url:      '#0ea5e9',
  file:     '#16a34a',
}

export function TabBar() {
  const openTabs = useAppStore(s => s.openTabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const notes = useAppStore(s => s.notes)
  const activateTab = useAppStore(s => s.activateTab)
  const closeTab = useAppStore(s => s.closeTab)
  const reorderTabs = useAppStore(s => s.reorderTabs)

  const tabs = openTabs
    .map(id => notes.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n && !n.isDeleted)

  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // 激活标签变化时自动滚到可见
  useEffect(() => {
    if (!activeTabId || !scrollerRef.current) return
    const el = scrollerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement | null
    if (!el) return
    const parent = scrollerRef.current
    const elLeft = el.offsetLeft
    const elRight = elLeft + el.offsetWidth
    if (elLeft < parent.scrollLeft) {
      parent.scrollLeft = elLeft
    } else if (elRight > parent.scrollLeft + parent.clientWidth) {
      parent.scrollLeft = elRight - parent.clientWidth
    }
  }, [activeTabId, tabs.length])

  const handleClick = (id: string) => {
    if (id !== activeTabId) activateTab(id)
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
    // 必须 setData 才能在 Firefox 里 drag
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!dragId || dragId === id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(id)
  }

  const handleDragLeave = (id: string) => {
    if (dropTargetId === id) setDropTargetId(null)
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

  return (
    <div className="tab-bar" ref={scrollerRef}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        const isDropTarget = dropTargetId === tab.id && dragId && dragId !== tab.id
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={
              'tab-item'
              + (isActive ? ' active' : '')
              + (isDropTarget ? ' drop-target' : '')
              + (dragId === tab.id ? ' dragging' : '')
            }
            onClick={() => handleClick(tab.id)}
            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragLeave={() => handleDragLeave(tab.id)}
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
      })}
    </div>
  )
}