import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../store/app'
import { getThemeLabel } from '@shared/themeLabels'
import { Cloud, CloudOff, CloudUpload, Loader2, CheckCircle2, AlertCircle, Save, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, FileText, GitBranch, Upload, Download, RefreshCw, Settings } from 'lucide-react'
import { alert } from './AlertDialog'

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 把时间戳格式化成 YYYY-MM-DD HH:mm */
function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 把时间戳格式化成"X 分钟前" */
function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

/**
 * 同步状态：6 个用户能感知的视觉态
 *
 *  - pending    待同步：本地有变更未推
 *  - syncing    同步中（瞬时）
 *  - success    同步成功（瞬时，2.5s 后自动回到 idle）
 *  - error      同步失败（粘性，下一次操作前一直显示）
 *  - unconfigured  未配置 Git
 *  - idle       已连接，无待同步
 */
type SyncVisual = 'pending' | 'syncing' | 'success' | 'error' | 'unconfigured' | 'idle'

function pickSyncVisual(s: { state: string; pendingFiles?: number }): SyncVisual {
  if (s.state === 'unconfigured') return 'unconfigured'
  if (s.state === 'syncing') return 'syncing'
  if (s.state === 'success') return 'success'
  if (s.state === 'error') return 'error'
  if ((s.pendingFiles ?? 0) > 0) return 'pending'
  return 'idle'
}

/** 把状态翻成给用户看的中文短句（紧凑版，给 StatusBar 用） */
function syncLabelCompact(v: SyncVisual, pendingFiles?: number): string {
  switch (v) {
    case 'pending': return pendingFiles ? `待同步 ${pendingFiles} 项` : '待同步'
    case 'syncing': return '同步中…'
    case 'success': return '已同步'
    case 'error': return '同步失败'
    case 'unconfigured': return '未配置'
    default: return '已连接'
  }
}

export function StatusBar() {
  const syncStatus = useAppStore(s => s.syncStatus)
  const theme = useAppStore(s => s.theme)
  const notes = useAppStore(s => s.notes)
  const currentNote = useAppStore(s => s.currentNote)
  const saveStatus = useAppStore(s => s.saveStatus)
  const sidebarVisible = useAppStore(s => s.sidebarVisible)
  const previewVisible = useAppStore(s => s.previewVisible)
  const editorVisible = useAppStore(s => s.editorVisible)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const togglePreview = useAppStore(s => s.togglePreview)
  const toggleEditor = useAppStore(s => s.toggleEditor)

  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false)
  const syncBtnRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const visual = pickSyncVisual(syncStatus)
  const label = syncLabelCompact(visual, syncStatus.pendingFiles)

  // success 状态自动回退（2.5s）
  useEffect(() => {
    if (syncStatus.state !== 'success') return
    const t = setTimeout(() => {
      const pending = (syncStatus.pendingFiles ?? 0) > 0
      useAppStore.getState().setSyncStatus({
        ...syncStatus,
        state: pending ? 'pending' : 'idle',
        message: pending ? `待同步 ${syncStatus.pendingFiles} 项` : '就绪'
      })
    }, 2500)
    return () => clearTimeout(t)
  }, [syncStatus])

  // 点击外面 / Esc 关闭 popover
  useEffect(() => {
    if (!syncPopoverOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (syncBtnRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setSyncPopoverOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSyncPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [syncPopoverOpen])

  // 右下角的侧栏/编辑器/预览切换按钮：只有 markdown/html 笔记才需要
  // —— code/url/file/richtext 笔记的布局是固定的（editor/preview 二选一强制），
  //    切换按钮点了会乱布局；保留侧栏切换对这几种笔记意义也不大
  const showLayoutToggles = currentNote?.format === 'markdown' || currentNote?.format === 'html'

  const btnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: 3,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    padding: 0
  } as const

  // 同步区域样式：根据状态上色
  const syncColor = (
    visual === 'pending' ? '#f59e0b' :
    visual === 'syncing' ? 'var(--text-tertiary)' :
    visual === 'success' ? '#22c55e' :
    visual === 'error' ? '#ef4444' :
    visual === 'unconfigured' ? 'var(--text-tertiary)' :
    'var(--text-tertiary)'
  )

  const handleSyncClick = () => {
    // error 时优先展示详情（用户最关心为什么失败）
    if (visual === 'error' && syncStatus.detail) {
      alert({ title: '同步失败详情', message: syncStatus.detail })
      return
    }
    // 其他状态：开/关 popover
    setSyncPopoverOpen(o => !o)
  }

  const clickMenu = (id: string) => window.inkslateApi.clickMenu(id)

  // popover 位置：在 sync 按钮正上方，避免被 StatusBar 切掉
  const popoverPos = (): React.CSSProperties | undefined => {
    const btn = syncBtnRef.current
    if (!btn) return undefined
    const rect = btn.getBoundingClientRect()
    return {
      position: 'fixed',
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
      zIndex: 99999
    }
  }

  return (
    <div style={{
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      borderTop: '1px solid var(--border-color)',
      background: 'var(--bg-tertiary)',
      fontSize: 11,
      color: 'var(--text-tertiary)',
      userSelect: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <FileText size={11} />
          笔记 {notes.length} 条
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Save size={11} />
          {saveStatus.saving
            ? '保存中...'
            : saveStatus.lastSaved
              ? `已保存于 ${formatTime(saveStatus.lastSaved)}`
              : ''}
        </span>
        {currentNote && (
          <>
            <span title="创建时间" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              创建: {formatDateTime(currentNote.createdAt)}
            </span>
            <span title="最后更新时间" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              更新: {formatDateTime(currentNote.updatedAt)}
            </span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>主题: {getThemeLabel(theme)}</span>
        {/* 同步状态指示器：可点击查看详情/触发操作 */}
        <span
          ref={syncBtnRef}
          title={
            visual === 'error' && syncStatus.detail
              ? `同步失败：${syncStatus.detail}`
              : syncStatus.lastSyncAt
                ? `${label} · 上次同步：${formatTimeAgo(syncStatus.lastSyncAt)}`
                : label
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            color: syncColor,
            fontWeight: visual === 'pending' || visual === 'error' ? 600 : 400
          }}
          onClick={handleSyncClick}
        >
          {visual === 'syncing' && <Loader2 size={12} className="spin" />}
          {visual === 'success' && <CheckCircle2 size={12} color="#22c55e" />}
          {visual === 'error' && <AlertCircle size={12} color="#ef4444" />}
          {visual === 'pending' && <CloudUpload size={12} color="#f59e0b" />}
          {visual === 'unconfigured' && <CloudOff size={12} />}
          {visual === 'idle' && <Cloud size={12} />}
          <span>{label}</span>
          {visual !== 'unconfigured' && syncStatus.pendingFiles && visual !== 'syncing' && visual !== 'success' ? (
            <span style={{
              background: '#f59e0b',
              color: '#fff',
              borderRadius: 8,
              padding: '0 5px',
              fontSize: 10,
              lineHeight: '14px',
              minWidth: 14,
              textAlign: 'center'
            }}>{syncStatus.pendingFiles > 99 ? '99+' : syncStatus.pendingFiles}</span>
          ) : null}
        </span>
        {/* Git 同步入口按钮 */}
        <button
          className="statusbar-btn"
          style={btnStyle}
          title="Git 同步设置"
          onClick={() => window.dispatchEvent(new CustomEvent('inkslate:open-git-settings'))}
        >
          <GitBranch size={12} />
        </button>
        {showLayoutToggles && (
          <>
            <div style={{ width: 1, height: 14, background: 'var(--border-color)', margin: '0 4px' }} />
            <button
              className="statusbar-btn"
              style={btnStyle}
              onClick={toggleSidebar}
              title={sidebarVisible ? '隐藏侧栏' : '显示侧栏'}
            >
              {sidebarVisible ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
            </button>
            <button
              className="statusbar-btn"
              style={btnStyle}
              onClick={toggleEditor}
              title={editorVisible ? '隐藏编辑器' : '显示编辑器'}
            >
              {editorVisible ? <PanelRightClose size={13} /> : <PanelLeftOpen size={13} />}
            </button>
            <button
              className="statusbar-btn"
              style={btnStyle}
              onClick={togglePreview}
              title={previewVisible ? '隐藏预览' : '显示预览'}
            >
              {previewVisible ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            </button>
          </>
        )}
      </div>

      {/* 同步 popover：详情 + 操作按钮 */}
      {syncPopoverOpen && syncBtnRef.current && createPortal(
        <div
          ref={popoverRef}
          className="statusbar-sync-popover"
          style={popoverPos()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={`statusbar-sync-summary sync-state-${visual}`}>
            {visual === 'syncing' && <Loader2 size={14} className="spin" />}
            {visual === 'success' && <CheckCircle2 size={14} color="#22c55e" />}
            {visual === 'error' && <AlertCircle size={14} color="#ef4444" />}
            {visual === 'pending' && <CloudUpload size={14} color="#f59e0b" />}
            {visual === 'unconfigured' && <CloudOff size={14} />}
            {visual === 'idle' && <Cloud size={14} />}
            <span className="statusbar-sync-summary-label">{label}</span>
          </div>
          {syncStatus.lastSyncAt ? (
            <div className="statusbar-sync-meta">
              上次同步：{formatTimeAgo(syncStatus.lastSyncAt)}
            </div>
          ) : null}
          {visual === 'error' && syncStatus.detail ? (
            <div className="statusbar-sync-error-detail">
              <AlertCircle size={11} />
              <span>{syncStatus.detail.length > 100 ? syncStatus.detail.slice(0, 100) + '…' : syncStatus.detail}</span>
            </div>
          ) : null}
          <div className="statusbar-sync-sep" />
          <div
            className="statusbar-sync-item"
            onClick={() => { setSyncPopoverOpen(false); clickMenu('git-sync') }}
          >
            <RefreshCw size={13} />
            <span>同步（先拉后推）</span>
            <span className="statusbar-sync-hint">Ctrl+Shift+Y</span>
          </div>
          <div
            className="statusbar-sync-item"
            onClick={() => { setSyncPopoverOpen(false); clickMenu('git-pull') }}
          >
            <Download size={13} />
            <span>仅拉取</span>
            <span className="statusbar-sync-hint">Ctrl+Shift+D</span>
          </div>
          <div
            className="statusbar-sync-item"
            onClick={() => { setSyncPopoverOpen(false); clickMenu('git-push') }}
          >
            <Upload size={13} />
            <span>仅推送</span>
            <span className="statusbar-sync-hint">Ctrl+Shift+S</span>
          </div>
          <div className="statusbar-sync-sep" />
          <div
            className="statusbar-sync-item"
            onClick={() => { setSyncPopoverOpen(false); window.dispatchEvent(new CustomEvent('inkslate:open-git-settings')) }}
          >
            <Settings size={13} />
            <span>Git 同步设置…</span>
          </div>
        </div>,
        document.body
      )}

      <style>{statusbarCss}</style>
    </div>
  )
}

const statusbarCss = `
  .statusbar-btn:hover {
    background: var(--bg-hover) !important;
    color: var(--text-primary) !important;
  }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* 同步 popover */
  .statusbar-sync-popover {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    padding: 4px;
    min-width: 220px;
    font-size: 12px;
    color: var(--text-primary);
    animation: statusbarSyncFadeIn 0.12s ease;
  }
  @keyframes statusbarSyncFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .statusbar-sync-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 4px;
    font-weight: 500;
  }
  .statusbar-sync-summary.sync-state-pending { background: rgba(245, 158, 11, 0.08); color: #f59e0b; }
  .statusbar-sync-summary.sync-state-syncing { background: var(--bg-tertiary); color: var(--text-primary); }
  .statusbar-sync-summary.sync-state-success { background: rgba(34, 197, 94, 0.08); color: #22c55e; }
  .statusbar-sync-summary.sync-state-error   { background: rgba(239, 68, 68, 0.08);  color: #ef4444; }
  .statusbar-sync-summary.sync-state-unconfigured { background: var(--bg-tertiary); color: var(--text-tertiary); }
  .statusbar-sync-summary.sync-state-idle    { background: var(--bg-tertiary); color: var(--text-secondary); }
  .statusbar-sync-meta {
    padding: 4px 10px 8px;
    color: var(--text-tertiary);
    font-size: 11px;
  }
  .statusbar-sync-error-detail {
    padding: 6px 10px;
    margin: 0 6px 6px;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 4px;
    color: #ef4444;
    font-size: 11px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    word-break: break-all;
  }
  .statusbar-sync-sep {
    height: 1px;
    background: var(--border-color);
    margin: 4px 0;
  }
  .statusbar-sync-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-primary);
  }
  .statusbar-sync-item:hover {
    background: var(--bg-hover);
  }
  .statusbar-sync-hint {
    margin-left: auto;
    color: var(--text-tertiary);
    font-size: 10px;
    font-family: ui-monospace, monospace;
  }
`