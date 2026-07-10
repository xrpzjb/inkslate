import { useRef, useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/app'
import './TabBar.css'

/**
 * 多标签页：
 *  - 单击：激活该标签（如果不在 openTabs 里则先打开）
 *  - 关闭按钮 X：直接关闭（autoSave 已处理持久化）
 *  - 中键：关闭（VSCode 风格）
 *  - 拖拽：重排序
 *  - 超出宽度：横向滚动
 *
 * 显示笔记：title（fallback 为 '未命名'）
 * 标签上多余的"格式图标"暂不加，避免拥挤
 */
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