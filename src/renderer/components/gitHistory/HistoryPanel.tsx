import { useEffect, useRef, useState } from 'react'
import { GitCommitEntry } from '@shared/types'
import { absoluteToGitPath } from '../../utils/gitPath'
import { HistoryList } from './HistoryList'
import { HistoryDetail } from './HistoryDetail'
import '../../styles/git-history.css'

export function HistoryPanel({
  notePath,
  noteFormat,
  currentContent,
  onClose
}: {
  notePath: string
  noteFormat: 'markdown' | 'html' | 'richtext' | 'code'
  currentContent: string
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'empty' | 'unconfigured' | 'error'>('loading')
  const [commits, setCommits] = useState<GitCommitEntry[]>([])
  const [selectedOid, setSelectedOid] = useState<string | null>(null)
  const [snapshotContent, setSnapshotContent] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'snapshot' | 'diff'>('snapshot')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const relativePathRef = useRef('')

  // 获取 git 历史
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const relPath = await absoluteToGitPath(notePath)
        relativePathRef.current = relPath
        const entries = await window.inkslateApi.git.log(relPath, 50)
        if (cancelled) return
        if (entries.length === 0) {
          setStatus('empty')
        } else {
          setCommits(entries)
          setStatus('loaded')
        }
      } catch (e: any) {
        if (cancelled) return
        // git 未配置或未初始化时 log 会返回空数组或抛异常
        if (e?.message?.includes('未配置') || e?.message?.includes('未初始化')) {
          setStatus('unconfigured')
        } else {
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [notePath])

  // 选中 commit 时获取快照内容
  useEffect(() => {
    if (!selectedOid || !relativePathRef.current) {
      setSnapshotContent(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    window.inkslateApi.git.showFile(selectedOid, relativePathRef.current)
      .then(content => {
        if (cancelled) return
        setSnapshotContent(content ?? '')
        setDetailLoading(false)
      })
      .catch((e: any) => {
        if (cancelled) return
        setDetailError(e?.message ?? '加载失败')
        setDetailLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedOid])

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const renderBody = () => {
    switch (status) {
      case 'loading':
        return <div className="history-placeholder">加载历史记录...</div>
      case 'unconfigured':
        return (
          <div className="history-placeholder">
            尚未配置 Git 同步。请先在设置中配置 Git 以启用历史快照功能。
          </div>
        )
      case 'empty':
        return (
          <div className="history-placeholder">
            此笔记尚无 Git 历史记录。保存并提交变更后将自动创建快照。
          </div>
        )
      case 'error':
        return (
          <div className="history-placeholder history-error">
            加载历史记录失败。
            <button className="history-retry-btn" onClick={() => window.location.reload()}>重试</button>
          </div>
        )
      case 'loaded':
        return (
          <div className="history-split">
            <div className="history-split-left">
              <div className="history-list-header">版本历史</div>
              <HistoryList
                commits={commits}
                selectedOid={selectedOid}
                onSelect={setSelectedOid}
              />
            </div>
            <div className="history-split-right">
              <HistoryDetail
                viewMode={viewMode}
                setViewMode={setViewMode}
                snapshotContent={snapshotContent}
                noteFormat={noteFormat}
                currentContent={currentContent}
                loading={detailLoading}
                error={detailError}
                hasSelection={!!selectedOid}
              />
            </div>
          </div>
        )
    }
  }

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" ref={panelRef} onClick={e => e.stopPropagation()}>
        <div className="history-header">
          <span className="history-title">Git 历史快照</span>
          <button className="history-close-btn" onClick={onClose}>✕</button>
        </div>
        {renderBody()}
      </div>
    </div>
  )
}
