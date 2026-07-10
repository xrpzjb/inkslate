import { GitCommitEntry } from '@shared/types'

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const date = new Date(timestamp * 1000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function HistoryList({
  commits,
  selectedOid,
  onSelect
}: {
  commits: GitCommitEntry[]
  selectedOid: string | null
  onSelect: (oid: string) => void
}) {
  if (commits.length === 0) return null

  return (
    <div className="history-list">
      {commits.map(c => {
        const msg = c.message.split('\n')[0] || '(无提交信息)'
        return (
          <div
            key={c.oid}
            className={`history-commit-item ${selectedOid === c.oid ? 'selected' : ''}`}
            onClick={() => onSelect(c.oid)}
          >
            <div className="history-commit-msg">{msg}</div>
            <div className="history-commit-meta">
              <span className="history-commit-time">{formatRelativeTime(c.committer.timestamp)}</span>
              <span className="history-commit-author">{c.author.name}</span>
              <span className="history-commit-oid">{c.oid.slice(0, 7)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
