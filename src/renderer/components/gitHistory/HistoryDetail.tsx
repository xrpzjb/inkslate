import { useState } from 'react'
import { NoteFormat } from '@shared/types'
import { SnapshotView } from './SnapshotView'
import { DiffView } from './DiffView'

export function HistoryDetail({
  viewMode,
  setViewMode,
  snapshotContent,
  noteFormat,
  currentContent,
  loading,
  error,
  hasSelection,
  onRestore
}: {
  viewMode: 'snapshot' | 'diff'
  setViewMode: (m: 'snapshot' | 'diff') => void
  snapshotContent: string | null
  noteFormat: NoteFormat
  currentContent: string
  loading: boolean
  error: string | null
  hasSelection: boolean
  onRestore?: (content: string) => void
}) {
  const [confirming, setConfirming] = useState(false)

  if (!hasSelection) {
    return (
      <div className="history-detail">
        <div className="history-placeholder">从左侧选择一个版本查看</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="history-detail">
        <div className="history-placeholder history-loading">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="history-detail">
        <div className="history-placeholder history-error">加载失败：{error}</div>
      </div>
    )
  }

  const isSame = snapshotContent === currentContent
  const canRestore = !!onRestore && !isSame && snapshotContent !== null

  const handleRestore = () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    if (snapshotContent !== null) {
      onRestore!(snapshotContent)
    }
    setConfirming(false)
  }

  return (
    <div className="history-detail">
      <div className="history-detail-toolbar">
        <div className="history-detail-toolbar-left">
          <button
            className={`history-toggle-btn ${viewMode === 'snapshot' ? 'active' : ''}`}
            onClick={() => setViewMode('snapshot')}
          >
            查看快照
          </button>
          <button
            className={`history-toggle-btn ${viewMode === 'diff' ? 'active' : ''}`}
            onClick={() => setViewMode('diff')}
          >
            与当前对比
          </button>
        </div>
        {canRestore && (
          <button
            className={`history-restore-btn ${confirming ? 'confirming' : ''}`}
            onClick={handleRestore}
            onMouseLeave={() => setConfirming(false)}
          >
            {confirming ? '点击确认回滚' : '回滚到此版本'}
          </button>
        )}
      </div>
      <div className="history-detail-body">
        {viewMode === 'snapshot'
          ? <SnapshotView content={snapshotContent ?? ''} format={noteFormat} />
          : <DiffView oldStr={snapshotContent} newStr={currentContent} />
        }
      </div>
    </div>
  )
}
