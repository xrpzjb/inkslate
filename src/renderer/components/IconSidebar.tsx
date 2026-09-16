import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  FilePlus, Trash2, Search,
  Cloud, CloudOff, CloudUpload, Loader2,
  Palette,
  PanelLeftClose, PanelLeftOpen,
  Check, Upload, Download, Settings,
  AlertCircle, RefreshCw, FolderPlus, Lightbulb
} from 'lucide-react'
import { useAppStore } from '../store/app'
import { THEME_LABELS } from '../../shared/themeLabels'
import { appThemes } from '../themes'
import './IconSidebar.css'

/** 菜单数据结构（与 TitleBar 共用） */
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

/**
 * 同步状态：5 个用户能感知的视觉态 + 1 个瞬时态
 *
 *  - connected  连接正常：远端可达，最近一次同步成功
 *  - offline    连接异常：网络/认证失败，无法到达远端
 *  - pending    待同步：本地有变更未推
 *  - syncing    同步中（瞬时）
 *  - success    同步成功（瞬时，2.5s 后自动回到 connected/pending）
 *  - error      同步失败（粘性，下一次操作前一直显示）
 */
type SyncVisual = 'connected' | 'offline' | 'pending' | 'syncing' | 'success' | 'error' | 'unconfigured'

function pickSyncVisual(s: { state: string; pendingFiles?: number; lastSyncAt?: number }): SyncVisual {
  if (s.state === 'offline') return 'offline'
  if (s.state === 'unconfigured') return 'unconfigured'
  if (s.state === 'syncing') return 'syncing'
  if (s.state === 'success') return 'success'
  if (s.state === 'error') return 'error'
  // idle: 看 pendingFiles
  if ((s.pendingFiles ?? 0) > 0) return 'pending'
  return 'connected'
}

/** 把 sync 状态变成给用户看的中文短句 */
function syncLabel(v: SyncVisual): string {
  return {
    connected: '已连接',
    offline: '连接异常',
    pending: '待同步',
    syncing: '同步中…',
    success: '同步成功',
    error: '同步失败',
    unconfigured: '未配置'
  }[v]
}

/**
 * 左侧竖向图标菜单
 *
 *  - ➕ 新建     (popover: MD/HTML/富文本/Code 格式)
 *  - 💾 保存
 *  - 🗑 回收站
 *  - ☁ 同步     (status-aware 图标 + popover: 推送 / 拉取 / 设置)
 *  - 🎨 主题     (popover: 主题列表)
 *  - ⌨ 快捷键
 *  - ⓘ 关于
 *  - ◀/▶        切换笔记本树状图
 */
export function IconSidebar() {
  const theme = useAppStore(s => s.theme)
  const setTheme = useAppStore(s => s.setTheme)
  const updateSettings = useAppStore(s => s.updateSettings)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const sidebarVisible = useAppStore(s => s.sidebarVisible)
  const syncStatus = useAppStore(s => s.syncStatus)

  const [popover, setPopover] = useState<null | 'new' | 'sync' | 'theme' | 'menu'>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 监听外部搜索事件（工具栏搜索按钮触发）
  useEffect(() => {
    const handler = () => setSearchOpen(true)
    window.addEventListener('inkslate:open-search', handler)
    return () => window.removeEventListener('inkslate:open-search', handler)
  }, [])
  const newBtnRef = useRef<HTMLButtonElement>(null)
  const syncBtnRef = useRef<HTMLButtonElement>(null)
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const logoBtnRef = useRef<HTMLButtonElement>(null)

  // ===== 顶部菜单（来自 TitleBar 逻辑） =====
  const [menus, setMenus] = useState<MenuData[]>([])
  const [menuOpenIndex, setMenuOpenIndex] = useState<number | null>(null)
  const [menuPath, setMenuPath] = useState<MenuPathItem[]>([])
  const menuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = () => {
      window.inkslateApi.getMenuData().then((data) => setMenus(data || []))
    }
    load()
    const cleanup = window.inkslateApi.onMenu((event) => {
      if (event === 'menu-rebuild') load()
    })
    return () => cleanup()
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setMenuOpenIndex(null)
        setMenuPath([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpenIndex(null)
    setMenuPath([])
    setPopover(null)
  }, [])

  const scheduleMenuClose = useCallback(() => {
    if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current)
    menuCloseTimer.current = setTimeout(() => {
      setMenuOpenIndex(null)
      setMenuPath([])
    }, 150)
  }, [])

  const onMenuItemClick = useCallback((item: MenuItem) => {
    if (item.type === 'separator' || item.disabled) return
    if (item.submenu && item.submenu.length > 0) return
    if (item.id) {
      window.inkslateApi.clickMenu(item.id, item.arg)
    }
    closeMenu()
  }, [closeMenu])

  const currentMenuItems: MenuItem[] = (() => {
    if (menuOpenIndex === null) return []
    return menus[menuOpenIndex]?.submenu || []
  })()

  const handleLogoClick = () => {
    if (popover === 'menu') {
      setPopover(null)
    } else {
      setPopover('menu')
    }
  }

  // ===== 成功状态自动回退（2.5s） =====
  useEffect(() => {
    if (syncStatus.state !== 'success') return
    const t = setTimeout(() => {
      const pending = (syncStatus.pendingFiles ?? 0) > 0
      useAppStore.getState().setSyncStatus({
        ...syncStatus,
        state: pending ? 'pending' : 'idle',
        message: pending ? '待同步' : '就绪'
      })
    }, 2500)
    return () => clearTimeout(t)
  }, [syncStatus])

  // 点外面 / Esc 关闭 popover
  useEffect(() => {
    if (!popover) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      const popEl = document.querySelector('.icon-sidebar-popover')
      if (popEl?.contains(e.target as Node)) return
      setPopover(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [popover])

  const clickMenu = (id: string, arg?: any) => {
    window.inkslateApi.clickMenu(id, arg)
  }

  // ===== 新建：子菜单 =====
  const handleNewFormat = (format: string, language?: string) => {
    setPopover(null)
    const id = language
      ? `new-code-${language === 'plaintext' ? 'md' : language}`
      : `new-${format}`
    clickMenu(id, { format, language })
  }

  const newItems: Array<
    | { kind: 'sep' }
    | { kind: 'item'; id: string; label: string; hint?: string; onClick: () => void }
  > = [
    {
      kind: 'item', id: 'new-notebook', label: '新建笔记本',
      onClick: () => {
        setPopover(null)
        clickMenu('new-notebook')
      }
    },
    { kind: 'sep' },
    {
      kind: 'item', id: 'new-url', label: '网址笔记',
      onClick: () => {
        setPopover(null)
        window.dispatchEvent(new CustomEvent('inkslate:new-url-note'))
      }
    },
    {
      kind: 'item', id: 'new-file', label: '文件笔记',
      onClick: () => {
        setPopover(null)
        window.dispatchEvent(new CustomEvent('inkslate:new-file-note'))
      }
    },
    { kind: 'sep' },
    { kind: 'item', id: 'new-md', label: 'Markdown 笔记', hint: 'Ctrl+N', onClick: () => handleNewFormat('markdown') },
    { kind: 'item', id: 'new-spreadsheet', label: '智能表格', onClick: () => handleNewFormat('spreadsheet') },
    { kind: 'item', id: 'new-html', label: 'HTML 笔记', hint: 'Ctrl+Shift+H', onClick: () => handleNewFormat('html') },
    { kind: 'item', id: 'new-richtext', label: '富文本笔记', hint: 'Ctrl+Shift+R', onClick: () => handleNewFormat('richtext') },
    { kind: 'sep' },
    { kind: 'item', id: 'new-code-js', label: 'JavaScript', onClick: () => handleNewFormat('code', 'javascript') },
    { kind: 'item', id: 'new-code-ts', label: 'TypeScript', onClick: () => handleNewFormat('code', 'typescript') },
    { kind: 'item', id: 'new-code-py', label: 'Python', onClick: () => handleNewFormat('code', 'python') },
    { kind: 'item', id: 'new-code-java', label: 'Java', onClick: () => handleNewFormat('code', 'java') },
    { kind: 'item', id: 'new-code-go', label: 'Go', onClick: () => handleNewFormat('code', 'go') },
    { kind: 'item', id: 'new-code-rust', label: 'Rust', onClick: () => handleNewFormat('code', 'rust') },
    { kind: 'item', id: 'new-code-cpp', label: 'C++', onClick: () => handleNewFormat('code', 'cpp') },
    { kind: 'item', id: 'new-code-cs', label: 'C#', onClick: () => handleNewFormat('code', 'csharp') },
    { kind: 'item', id: 'new-code-html', label: 'HTML', onClick: () => handleNewFormat('code', 'html') },
    { kind: 'item', id: 'new-code-css', label: 'CSS', onClick: () => handleNewFormat('code', 'css') },
    { kind: 'item', id: 'new-code-json', label: 'JSON', onClick: () => handleNewFormat('code', 'json') },
    { kind: 'item', id: 'new-code-sql', label: 'SQL', onClick: () => handleNewFormat('code', 'sql') },
    { kind: 'item', id: 'new-code-shell', label: 'Shell', onClick: () => handleNewFormat('code', 'shell') },
    { kind: 'item', id: 'new-code-md', label: '纯文本', onClick: () => handleNewFormat('code', 'plaintext') }
  ]



  // ===== 同步：子菜单 =====
  const syncItems = [
    {
      kind: 'item' as const, id: 'sync', label: '同步（先拉后推）',
      icon: <RefreshCw size={13} />, hint: 'Ctrl+Shift+Y',
      onClick: () => { setPopover(null); clickMenu('git-sync') }
    },
    {
      kind: 'item' as const, id: 'sync-push', label: '仅推送到 Git',
      icon: <Upload size={13} />, hint: 'Ctrl+Shift+S',
      onClick: () => { setPopover(null); clickMenu('git-push') }
    },
    {
      kind: 'item' as const, id: 'sync-pull', label: '仅从 Git 拉取',
      icon: <Download size={13} />, hint: 'Ctrl+Shift+D',
      onClick: () => { setPopover(null); clickMenu('git-pull') }
    },
    { kind: 'sep' as const },
    {
      kind: 'item' as const, id: 'sync-settings', label: 'Git 同步设置...',
      icon: <Settings size={13} />,
      onClick: () => { setPopover(null); clickMenu('git-settings') }
    }
  ]

  // ===== 主题：子菜单 =====
  const handlePickTheme = (id: string) => {
    setPopover(null)
    setTheme(id as any)
    updateSettings({ theme: id as any })
    window.inkslateApi.notifyThemeChanged(id)
  }
  const themeIds = Object.keys(appThemes) as Array<keyof typeof appThemes>
  const themeItems: Array<
    | { kind: 'sep' }
    | { kind: 'item'; id: string; label: string; active: boolean; onClick: () => void }
  > = [
    ...themeIds.map(id => ({
      kind: 'item' as const,
      id: `theme-${id}`,
      label: THEME_LABELS[id as keyof typeof THEME_LABELS] ?? id,
      active: theme === id,
      onClick: () => handlePickTheme(id)
    })),
    { kind: 'sep' },
    {
      kind: 'item' as const,
      id: 'theme-auto',
      label: THEME_LABELS.auto,
      active: theme === 'auto',
      onClick: () => handlePickTheme('auto')
    }
  ]

  // ===== 同步状态可视化 =====
  const visual = pickSyncVisual(syncStatus)
  const syncTip = `同步：${syncLabel(visual)}`

  return (
    <>
      <nav className="icon-sidebar" ref={rootRef}>
        {/* ===== Group: 搜索 ===== */}
        <button
          className={'icon-sidebar-btn' + (searchOpen ? ' active' : '')}
          onClick={() => setSearchOpen(true)}
          title="搜索"
        >
          <Search size={20} />
        </button>

        {/* ===== Group: 创建 ===== */}
        <button
          ref={newBtnRef}
          className={'icon-sidebar-btn' + (popover === 'new' ? ' active' : '')}
          onClick={() => setPopover(popover === 'new' ? null : 'new')}
          title="新建笔记"
        >
          <FilePlus size={20} />
        </button>

        <button
          className="icon-sidebar-btn"
          onClick={() => clickMenu('open-flash-thoughts')}
          title="闪念"
        >
          <Lightbulb size={20} />
        </button>

        {/* ===== Group: 文件（已移除保存按钮，自动保存即可） ===== */}

        {/* ===== Group: 同步（status-aware） ===== */}
        <button
          ref={syncBtnRef}
          className={
            'icon-sidebar-btn'
            + ' icon-sidebar-sync'
            + ` sync-state-${visual}`
            + (popover === 'sync' ? ' active' : '')
          }
          onClick={() => setPopover(popover === 'sync' ? null : 'sync')}
          title={syncTip}
        >
          <SyncIcon visual={visual} />
{/* 暂不显示具体待同步项数，仅靠图标颜色区分状态 */}
          {visual === 'error' ? (
            <span className="icon-sidebar-dot icon-sidebar-dot-error" />
          ) : null}
        </button>

        {/* ===== Group: 视图 ===== */}
        <button
          ref={themeBtnRef}
          className={'icon-sidebar-btn' + (popover === 'theme' ? ' active' : '')}
          onClick={() => setPopover(popover === 'theme' ? null : 'theme')}
          title="主题"
        >
<Palette size={20} />
        </button>

        <div className="icon-sidebar-spacer" />

        {/* ===== 底部：回收站 ===== */}
        <button
          className="icon-sidebar-btn"
          onClick={() => clickMenu('open-recycle-bin')}
          title="回收站"
        >
          <Trash2 size={20} />
        </button>

        {/* ===== Group: 帮助 ===== */}
        <button
          className="icon-sidebar-btn"
          onClick={() => clickMenu('settings')}
          title="设置"
        >
          <Settings size={20} />
        </button>

        {/* ===== 底部：切换树状图 ===== */}
        <button
          className={'icon-sidebar-btn' + (!sidebarVisible ? ' active' : '')}
          onClick={toggleSidebar}
          title={sidebarVisible ? '隐藏笔记本树 (Ctrl+B)' : '显示笔记本树 (Ctrl+B)'}
        >
          {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </nav>

      {/* ===== Popovers（portal 到 body） ===== */}
      {popover === 'new' && newBtnRef.current && createPortal(
        <div
          className="icon-sidebar-popover"
          style={popoverPos(newBtnRef.current)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {newItems.map((it, idx) =>
            it.kind === 'sep'
              ? <div key={`sep-${idx}`} className="icon-sidebar-popover-sep" />
              : (
                <div
                  key={it.id}
                  className="icon-sidebar-popover-item"
                  onClick={it.onClick}
                >
                  <span>{it.label}</span>
                  {it.hint && <span className="icon-sidebar-popover-hint">{it.hint}</span>}
                </div>
              )
          )}
        </div>,
        document.body
      )}

      {popover === 'sync' && syncBtnRef.current && createPortal(
        <div
          className="icon-sidebar-popover icon-sidebar-popover-sync"
          style={popoverPos(syncBtnRef.current)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 顶部：状态摘要 */}
          <div className={`icon-sidebar-sync-summary sync-state-${visual}`}>
            <SyncIcon visual={visual} size={14} />
            <span className="icon-sidebar-sync-summary-label">{syncLabel(visual)}</span>
{/* 暂不显示具体待同步项数 */}
          </div>
          {syncStatus.lastSyncAt ? (
            <div className="icon-sidebar-sync-meta">
              上次同步：{formatTimeAgo(syncStatus.lastSyncAt)}
            </div>
          ) : null}
          {visual === 'error' && syncStatus.detail ? (
            <div className="icon-sidebar-sync-error-detail">
              <AlertCircle size={11} />
              <span>{truncate(syncStatus.detail, 80)}</span>
            </div>
          ) : null}
          <div className="icon-sidebar-popover-sep" />
          {syncItems.map((it, idx) =>
            it.kind === 'sep'
              ? <div key={`sep-${idx}`} className="icon-sidebar-popover-sep" />
              : (
                <div
                  key={it.id}
                  className="icon-sidebar-popover-item"
                  onClick={it.onClick}
                >
                  <span className="icon-sidebar-popover-item-inner">
                    {it.icon}
                    {it.label}
                  </span>
                  {it.hint && <span className="icon-sidebar-popover-hint">{it.hint}</span>}
                </div>
              )
          )}
        </div>,
        document.body
      )}

      {popover === 'theme' && themeBtnRef.current && createPortal(
        <div
          className="icon-sidebar-popover"
          style={popoverPos(themeBtnRef.current)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {themeItems.map((it, idx) =>
            it.kind === 'sep'
              ? <div key={`sep-${idx}`} className="icon-sidebar-popover-sep" />
              :               (
                <div
                  key={it.id}
                  className={'icon-sidebar-popover-item' + (it.active ? ' active' : '')}
                  onClick={it.onClick}
                >
                  {/* 文字在左、check 在右（radio 列表常见布局，更整齐） */}
                  <span className="icon-sidebar-popover-item-inner">
                    {it.label}
                  </span>
                  {it.active
                    ? <Check size={13} className="icon-sidebar-popover-check" />
                    : <span className="icon-sidebar-popover-check-spacer" />}
                </div>
              )
          )}
        </div>,
        document.body
      )}

      {/* ===== 顶部 Logo 菜单（多级下拉） ===== */}
      {popover === 'menu' && logoBtnRef.current && createPortal(
        <div
          className="icon-sidebar-popover"
          style={popoverPos(logoBtnRef.current)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menus.map((m, menuIdx) => (
            <div key={menuIdx}>
              {m.label ? (
                <div
                  className="icon-sidebar-popover-item"
                  style={{ fontWeight: 600, color: 'var(--text-secondary)', cursor: 'default' }}
                >
                  {m.label}
                </div>
              ) : null}
              {m.submenu?.map((item, itemIdx) => (
                item.type === 'separator'
                  ? <div key={`sep-${itemIdx}`} className="icon-sidebar-popover-sep" />
                  : <MenuPopoverItem
                      key={item.id || itemIdx}
                      item={item}
                      onClick={() => onMenuItemClick(item)}
                      onMouseEnterSub={(hasSub: boolean) => {
                        if (hasSub) {
                          setMenuPath([{ menuIndex: menuIdx, itemIndex: itemIdx }])
                        } else {
                          setMenuPath([])
                        }
                      }}
                      hasSubmenu={!!(item.submenu && item.submenu.length > 0)}
                      isActive={menuPath[0]?.menuIndex === menuIdx && menuPath[0]?.itemIndex === itemIdx}
                    />
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}

      {searchOpen && createPortal(
        <SearchDialog onClose={() => setSearchOpen(false)} />,
        document.body
      )}
    </>
  )
}

/** 菜单项组件 */
function MenuPopoverItem({
  item, onClick, onMouseEnterSub, hasSubmenu, isActive
}: {
  item: MenuItem
  onClick: () => void
  onMouseEnterSub: (hasSub: boolean) => void
  hasSubmenu: boolean
  isActive: boolean
}) {
  const [showSub, setShowSub] = useState(false)

  return (
    <div
      className={`icon-sidebar-popover-item${item.disabled ? ' disabled' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        if (item.disabled) return
        if (hasSubmenu) {
          setShowSub(true)
          onMouseEnterSub(true)
        } else {
          onClick()
        }
      }}
      onMouseEnter={() => {
        if (hasSubmenu) {
          setShowSub(true)
          onMouseEnterSub(true)
        }
      }}
      onMouseLeave={() => {
        if (hasSubmenu) {
          setShowSub(false)
          onMouseEnterSub(false)
        }
      }}
    >
      <span className="icon-sidebar-popover-item-inner">
        {item.type === 'radio' && (
          <span className="icon-sidebar-radio">
            {item.checked ? '●' : '○'}
          </span>
        )}
        {item.label}
      </span>
      {item.accelerator && <span className="icon-sidebar-popover-hint">{item.accelerator}</span>}
      {hasSubmenu && <span className="icon-sidebar-arrow">▶</span>}
    </div>
  )
}

/** 软件 Logo SVG 图标：墨与石板」 */
function InkslateLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* 石板背景：圆角矩形，模拟笔记本/石板 */}
      <rect x="2" y="2" width="20" height="20" rx="4" fill="var(--accent-color)" fillOpacity="0.15" />
      <rect x="2" y="2" width="20" height="20" rx="4" stroke="var(--accent-color)" strokeWidth="1.5" strokeOpacity="0.6" />

      {/* 左侧竖线：笔记本装订边 */}
      <line x1="6" y1="6" x2="6" y2="18" stroke="var(--accent-color)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />

      {/* 横线1 */}
      <line x1="9" y1="9" x2="18" y2="9" stroke="var(--accent-color)" strokeWidth="1.2" strokeLinecap="round" />
      {/* 横线2 */}
      <line x1="9" y1="12.5" x2="15" y2="12.5" stroke="var(--accent-color)" strokeWidth="1.2" strokeLinecap="round" />
      {/* 横线3 */}
      <line x1="9" y1="16" x2="13" y2="16" stroke="var(--accent-color)" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />

      {/* 右下角墨迹点 */}
      <circle cx="18.5" cy="17.5" r="1.5" fill="var(--accent-color)" fillOpacity="0.4" />
    </svg>
  )
}

/** 同步图标按状态切换 */
function SyncIcon({ visual, size = 20 }: { visual: SyncVisual; size?: number }) {
  const cls = visual === 'syncing' ? 'spin' : undefined
  if (visual === 'syncing') return <Loader2 size={size} className={cls} />
  if (visual === 'offline') return <CloudOff size={size} />
  if (visual === 'pending') return <CloudUpload size={size} />
  if (visual === 'success') return <Cloud size={size} />
  if (visual === 'error') return <Cloud size={size} />
  if (visual === 'unconfigured') return <CloudOff size={size} />
  return <Cloud size={size} />
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

/** popover 位置：紧贴按钮右侧，垂直对齐 */
function popoverPos(btn: HTMLElement): React.CSSProperties {
  const rect = btn.getBoundingClientRect()
  return {
    position: 'fixed',
    top: rect.top,
    left: rect.right + 4
  }
}

/** 搜索弹框 */
function SearchDialog({ onClose }: { onClose: () => void }) {
  const notes = useAppStore(s => s.notes)
  const selectNote = useAppStore(s => s.selectNote)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const lower = query.trim().toLowerCase()
  const results = lower
    ? notes
        .filter(n => !n.isDeleted && (n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)))
        .slice(0, 50)
    : []

  const highlight = (text: string) => {
    if (!lower) return text
    const idx = text.toLowerCase().indexOf(lower)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + lower.length)}</mark>
        {text.slice(idx + lower.length)}
      </>
    )
  }

  const snippet = (text: string, maxLen = 120) => {
    const idx = text.toLowerCase().indexOf(lower)
    if (idx < 0) return text.slice(0, maxLen)
    const start = Math.max(0, idx - 40)
    const end = Math.min(text.length, idx + lower.length + 40)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < text.length ? '…' : ''
    return prefix + text.slice(start, end) + suffix
  }

  const handleClick = async (id: string) => {
    await selectNote(id)
    onClose()
  }

  return (
    <div className="search-dialog-overlay" onMouseDown={onClose}>
      <div className={'search-dialog' + (lower ? ' search-dialog-expanded' : '')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="search-dialog-input-row">
          <Search size={16} className="search-dialog-input-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记标题或内容…"
            className="search-dialog-input"
          />
        </div>
        {lower && (
          <div className="search-dialog-results">
            {results.length === 0 && (
              <div className="search-dialog-empty">未找到匹配的笔记</div>
            )}
            {results.map(note => (
              <div key={note.id} className="search-dialog-item" onClick={() => handleClick(note.id)}>
                <div className="search-dialog-item-title">{highlight(note.title || '未命名')}</div>
                <div className="search-dialog-item-snippet">{highlight(snippet(note.content))}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
