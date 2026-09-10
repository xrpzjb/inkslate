import { useEffect, useState, useRef, useCallback } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'
import { useAppStore } from '../store/app'
import './TitleBar.css'

interface MenuItem {
  id?: string
  label?: string
  submenu?: MenuItem[]
  accelerator?: string
  disabled?: boolean
  type?: 'normal' | 'separator' | 'radio' | 'checkbox'
  checked?: boolean
  arg?: any
}

interface MenuData {
  label: string
  submenu: MenuItem[]
}

interface MenuPathItem {
  menuIndex: number
  itemIndex: number
}

/** 顶部菜单栏（macOS 风格）
 * - Esc 关闭、点击外部关闭、菜单间切换
 */
export function TitleBar() {
  const [menus, setMenus] = useState<MenuData[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [path, setPath] = useState<MenuPathItem[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const currentNoteTitle = useAppStore(s => s.currentNote?.title)

  useEffect(() => {
    window.inkslateApi.isMaximized?.().then(setIsMaximized)
    const cleanup = window.inkslateApi.onMaximizeChange?.(setIsMaximized)
    return () => { cleanup?.() }
  }, [])

  // 加载菜单数据
  useEffect(() => {
    const load = () => {
      window.inkslateApi.getMenuData().then((data) => setMenus(data || []))
    }
    load()
    // 主题切换时菜单会要求 rebuild
    const cleanup = window.inkslateApi.onMenu((event) => {
      if (event === 'menu-rebuild') load()
    })
    return () => cleanup()
  }, [])

  const theme = useThemeFromStore()
  useEffect(() => {
    window.inkslateApi.notifyThemeChanged(theme)
  }, [theme])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setOpenIndex(null)
        setPath([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenIndex(null)
        setPath([])
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const openMenu = useCallback((index: number) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpenIndex(index)
    setPath([])
  }, [])

  const closeAll = useCallback(() => {
    setOpenIndex(null)
    setPath([])
  }, [])

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpenIndex(null)
      setPath([])
    }, 150)
  }, [])

  const onItemClick = useCallback((item: MenuItem) => {
    console.log('[titlebar] click:', item.id, 'arg:', item.arg, 'disabled:', item.disabled)
    if (item.type === 'separator' || item.disabled) return
    if (item.submenu && item.submenu.length > 0) {
      // 有子菜单，由 onMouseEnter 处理展开
      return
    }
    if (item.id) {
      window.inkslateApi.clickMenu(item.id, item.arg)
    }
    closeAll()
  }, [closeAll])

  const onSubItemEnter = useCallback((itemIndex: number) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setPath([{ menuIndex: 0, itemIndex }])
  }, [])

  // 计算当前打开的子菜单项（嵌套的）
  const currentOpenItems: MenuItem[] = (() => {
    if (openIndex === null) return []
    return menus[openIndex]?.submenu || []
  })()

  // 渲染单层下拉
  const renderSubmenu = (items: MenuItem[], anchorIndex: number, depth: number) => {
    return (
      <div
        className="titlebar-dropdown"
        style={{ '--depth': depth } as any}
        onMouseEnter={() => {
          if (closeTimer.current) {
            clearTimeout(closeTimer.current)
            closeTimer.current = null
          }
        }}
        onMouseLeave={scheduleClose}
      >
        {items.map((item, idx) => {
          if (item.type === 'separator') {
            return <div key={idx} className="titlebar-sep" />
          }
          const hasSub = item.submenu && item.submenu.length > 0
          const isOnPath = path[depth]?.itemIndex === idx
          return (
            <div
              key={item.id || idx}
              className={
                'titlebar-item'
                + (hasSub ? ' has-submenu' : '')
                + (item.disabled ? ' disabled' : '')
                + (isOnPath ? ' active' : '')
                + (item.type === 'radio' ? ' is-radio' : '')
              }
              onMouseEnter={() => {
                if (hasSub) {
                  setPath((prev) => {
                    const next = prev.slice(0, depth)
                    next.push({ menuIndex: 0, itemIndex: idx })
                    return next
                  })
                } else {
                  setPath((prev) => prev.slice(0, depth))
                }
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (hasSub) {
                  setPath((prev) => {
                    const next = prev.slice(0, depth)
                    next.push({ menuIndex: 0, itemIndex: idx })
                    return next
                  })
                } else {
                  onItemClick(item)
                }
              }}
            >
              <span className="titlebar-item-label">
                {item.type === 'radio' && (
                  <span className="titlebar-radio">
                    {item.checked ? '●' : '○'}
                  </span>
                )}
                {item.label}
              </span>
              {item.accelerator && (
                <span className="titlebar-acc">{item.accelerator}</span>
              )}
              {hasSub && <span className="titlebar-arrow">▶</span>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="titlebar"
      onMouseLeave={scheduleClose}
    >
      {/* 可拖拽区域 */}
      <div className="titlebar-drag" />
      {/* Logo + 应用名 */}
      <div className="titlebar-brand">
        <img src="icon.png" alt="" className="titlebar-logo" />
        <span className="titlebar-brand-name">墨与石板</span>
      </div>
      {/* 当前笔记标题（居中） */}
      <div className="titlebar-note-title">
        {currentNoteTitle}
      </div>
      <div className="titlebar-spacer" />

      {/* 窗口控制按钮 */}
      <div className="titlebar-window-controls">
        <button className="titlebar-ctrl-btn" onClick={() => window.inkslateApi.minimize?.()} title="最小化">
          <Minus size={14} />
        </button>
        <button className="titlebar-ctrl-btn" onClick={() => window.inkslateApi.maximize?.()} title={isMaximized ? '还原' : '最大化'}>
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button className="titlebar-ctrl-btn titlebar-close-btn" onClick={() => window.inkslateApi.close?.()} title="关闭">
          <X size={14} />
        </button>
      </div>

      {openIndex !== null && (
        <>
          <div
            className="titlebar-dropdown-wrap"
            style={{ left: getFirstLevelLeft(openIndex) }}
            onMouseEnter={() => {
              if (closeTimer.current) {
                clearTimeout(closeTimer.current)
                closeTimer.current = null
              }
            }}
          >
            {renderSubmenu(currentOpenItems, openIndex, 0)}
            {path[0] !== undefined && currentOpenItems[path[0].itemIndex]?.submenu && (
              <div className="titlebar-submenu-wrap">
                {renderSubmenu(
                  currentOpenItems[path[0].itemIndex].submenu!,
                  path[0].itemIndex,
                  1
                )}
                {path[1] !== undefined && currentOpenItems[path[0].itemIndex].submenu![path[1].itemIndex]?.submenu && (
                  <div className="titlebar-submenu-wrap">
                    {renderSubmenu(
                      currentOpenItems[path[0].itemIndex].submenu![path[1].itemIndex].submenu!,
                      path[1].itemIndex,
                      2
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function getFirstLevelLeft(openIndex: number): number {
  const eachWidth = 60
  return openIndex * eachWidth
}

// 嗅探当前主题（用于通知主进程）
function useThemeFromStore(): string {
  const [t, setT] = useState('light')
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setT(document.documentElement.getAttribute('data-theme') || 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    setT(document.documentElement.getAttribute('data-theme') || 'light')
    return () => obs.disconnect()
  }, [])

  return t
}
