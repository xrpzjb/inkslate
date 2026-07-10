import { diffLines } from 'diff'

export function DiffView({ oldStr, newStr }: { oldStr: string | null; newStr: string }) {
  // 笔记在选中的 commit 中不存在
  if (oldStr === null) {
    return (
      <div className="diff-view">
        <div className="diff-info">此版本尚无此笔记。</div>
      </div>
    )
  }

  // 两点内容相同
  if (oldStr === newStr) {
    return (
      <div className="diff-view">
        <div className="diff-info">此版本与当前内容相同，无差异。</div>
      </div>
    )
  }

  const changes = diffLines(oldStr, newStr)
  let oldLineNum = 1
  let newLineNum = 1
  const rows: { type: string; value: string; oldLine?: number; newLine?: number }[] = []

  for (const part of changes) {
    const lines = part.value.split('\n')
    const count = part.value.endsWith('\n') ? lines.length - 1 : lines.length
    for (let i = 0; i < count; i++) {
      if (part.added) {
        rows.push({ type: 'added', value: lines[i], newLine: newLineNum++ })
      } else if (part.removed) {
        rows.push({ type: 'removed', value: lines[i], oldLine: oldLineNum++ })
      } else {
        rows.push({ type: 'unchanged', value: lines[i], oldLine: oldLineNum++, newLine: newLineNum++ })
      }
    }
  }

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-badge diff-badge-removed">− 旧版本</span>
        <span className="diff-badge diff-badge-added">+ 当前</span>
      </div>
      <div className="diff-content">
        {rows.map((row, i) => (
          <div key={i} className={`diff-line diff-line-${row.type}`}>
            <span className="diff-line-num diff-line-num-old">
              {row.type === 'removed' || row.type === 'unchanged' ? row.oldLine : ''}
            </span>
            <span className="diff-line-num diff-line-num-new">
              {row.type === 'added' || row.type === 'unchanged' ? row.newLine : ''}
            </span>
            <span className="diff-line-prefix">
              {row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}
            </span>
            <span className="diff-line-text">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
