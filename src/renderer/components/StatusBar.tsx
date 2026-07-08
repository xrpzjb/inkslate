import { useAppStore } from '../store/app'
import { getThemeLabel } from '@shared/themeLabels'
import { Cloud, CloudOff, CheckCircle2, AlertCircle, Loader2, Save, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, FileText } from 'lucide-react'

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

  const renderSyncIcon = () => {
    switch (syncStatus.state) {
      case 'syncing':
        return <Loader2 size={12} className="spin" />
      case 'success':
        return <CheckCircle2 size={12} color="#4caf50" />
      case 'error':
        return <AlertCircle size={12} color="#f44336" />
      case 'offline':
        return <CloudOff size={12} />
      case 'unconfigured':
        return <CloudOff size={12} />
      default:
        return <Cloud size={12} />
    }
  }

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
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {renderSyncIcon()}
          {syncStatus.message ?? (syncStatus.state === 'idle' ? '就绪' : '')}
        </span>
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
      <style>{`
        .statusbar-btn:hover {
          background: var(--bg-hover) !important;
          color: var(--text-primary) !important;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}