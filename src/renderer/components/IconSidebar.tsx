import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FilePlus, Trash2,
  Cloud, CloudOff, CloudUpload, Loader2,
  Palette, Keyboard, Info,
  PanelLeftClose, PanelLeftOpen,
  Check, Upload, Download, Settings,
  AlertCircle, RefreshCw
} from 'lucide-react'
import { useAppStore } from '../store/app'
import { THEME_LABELS } from '../../shared/themeLabels'
import { appThemes } from '../themes'
import './IconSidebar.css'

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

  const [popover, setPopover] = useState<null | 'new' | 'sync' | 'theme'>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const newBtnRef = useRef<HTMLButtonElement>(null)
  const syncBtnRef = useRef<HTMLButtonElement>(null)
  const themeBtnRef = useRef<HTMLButtonElement>(null)

  // success 状态自动回退（2.5s）
  useEffect(() => {
    if (syncStatus.state !== 'success') return
    const t = setTimeout(() => {
      // success → 根据 pendingFiles 决定回到 connected / pending
      const pending = (syncStatus.pendingFiles ?? 0) > 0
      useAppStore.getState().setSyncStatus({
        ...syncStatus,
        state: pending ? 'pending' : 'idle',
        message: pending ? `待同步 ${syncStatus.pendingFiles} 项` : '就绪'
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
      id: 'theme-solarized',
      label: THEME_LABELS.solarized,
      active: theme === 'solarized',
      onClick: () => handlePickTheme('solarized')
    },
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
  const syncTip = `同步：${syncLabel(visual)}${syncStatus.pendingFiles ? ` (${syncStatus.pendingFiles} 项)` : ''}`

  return (
    <>
      <nav className="icon-sidebar" ref={rootRef}>
        {/* ===== Group: 创建 ===== */}
        <button
          ref={newBtnRef}
          className={'icon-sidebar-btn' + (popover === 'new' ? ' active' : '')}
          onClick={() => setPopover(popover === 'new' ? null : 'new')}
          title="新建笔记"
        >
          <FilePlus size={20} />
        </button>

        <div className="icon-sidebar-sep" />

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
          {visual === 'pending' && syncStatus.pendingFiles ? (
            <span className="icon-sidebar-badge">
              {syncStatus.pendingFiles > 99 ? '99+' : syncStatus.pendingFiles}
            </span>
          ) : null}
          {visual === 'error' ? (
            <span className="icon-sidebar-dot icon-sidebar-dot-error" />
          ) : null}
        </button>

        <div className="icon-sidebar-sep" />

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

        <div className="icon-sidebar-sep" />

        {/* ===== Group: 帮助 ===== */}
        <button
          className="icon-sidebar-btn"
          onClick={() => clickMenu('shortcuts')}
          title="快捷键"
        >
          <Keyboard size={20} />
        </button>
        <button
          className="icon-sidebar-btn"
          onClick={() => clickMenu('about')}
          title="关于"
        >
          <Info size={20} />
        </button>

        <div className="icon-sidebar-sep" />

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
            {syncStatus.pendingFiles ? (
              <span className="icon-sidebar-sync-summary-pending">
                · 待同步 {syncStatus.pendingFiles} 项
              </span>
            ) : null}
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
                  <span className="icon-sidebar-popover-item-inner">{it.label}</span>
                  {it.active
                    ? <Check size={13} className="icon-sidebar-popover-check" />
                    : <span className="icon-sidebar-popover-check-spacer" />}
                </div>
              )
          )}
        </div>,
        document.body
      )}
    </>
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
