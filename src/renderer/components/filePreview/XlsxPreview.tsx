import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import ExcelJS from 'exceljs'

/** ExcelJS 的 xlsx.load 在主线程上做 XML 解析，大表会卡几秒。整体用 20s 硬截断 */
const HARD_TIMEOUT_MS = 20_000

export function XlsxPreview({ noteId }: { noteId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [status, setStatus] = useState('正在加载...')

  useEffect(() => {
    let cancelled = false
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null

    const finishLoading = (errorMsg: string | null = null) => {
      if (cancelled) return
      cancelled = true
      if (hardTimeoutId) { clearTimeout(hardTimeoutId); hardTimeoutId = null }
      if (errorMsg) setError(errorMsg)
      setLoading(false)
    }

    const load = async () => {
      setLoading(true)
      setError(null)
      setStatus('正在加载文件...')

      // 硬超时：20s 后强制结束 loading（ExcelJS 在主线程上做 XML 解析）
      hardTimeoutId = setTimeout(() => {
        finishLoading(`表格加载超时（${HARD_TIMEOUT_MS / 1000}s），可能是文件过大或格式复杂`)
      }, HARD_TIMEOUT_MS)

      try {
        setStatus('正在读取文件...')
        const data = await window.inkslateApi.fileNote.read(noteId)
        if (cancelled) return
        if (!data) {
          finishLoading('文件不存在或无法读取')
          return
        }

        // yield：让 spinner / 进度文案先画一帧，也让 pending 事件优先处理
        setStatus('正在解析表格...')
        await new Promise(r => setTimeout(r, 0))
        if (cancelled) return

        // 再 yield 一次，给切换笔记等操作留出窗口
        await new Promise(r => setTimeout(r, 100))
        if (cancelled) return

        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(data)
        if (cancelled) return
        setWorkbook(wb)
        const names = wb.worksheets.map(ws => ws.name)
        setSheetNames(names)
        setActiveSheet(0)
        finishLoading()
      } catch (e) {
        if (cancelled) return
        console.error('[XlsxPreview] load error:', e)
        finishLoading((e as Error).message || '表格加载失败')
      }
    }
    load()
    return () => {
      cancelled = true
      if (hardTimeoutId) clearTimeout(hardTimeoutId)
    }
  }, [noteId])

  const handleSaveAs = async () => {
    await window.inkslateApi.fileNote.saveAs(noteId)
  }

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    minWidth: 28,
    padding: '0 8px',
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 12
  }

  // 渲染当前 sheet 的数据为表格
  const renderSheet = () => {
    if (!workbook) return null
    const ws = workbook.worksheets[activeSheet]
    if (!ws) return null
    const maxRows = 500 // 限制最多渲染 500 行，防止超大表卡死
    const maxCols = 50
    const actualRowCount = Math.min(ws.rowCount, maxRows)
    const actualColCount = Math.min(ws.columnCount, maxCols)
    const rows: React.ReactNode[] = []
    // 列号表头（A B C...）
    const colHeaders: React.ReactNode[] = [<th key="corner" style={{ width: 36, background: 'var(--bg-tertiary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', position: 'sticky', left: 0, zIndex: 2 }} />]
    for (let c = 1; c <= actualColCount; c++) {
      const letter = colNumToLetter(c)
      colHeaders.push(
        <th key={`ch-${c}`} style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-tertiary)',
          borderRight: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 500,
          textAlign: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          minWidth: 60
        }}>{letter}</th>
      )
    }
    rows.push(<tr key="col-header">{colHeaders}</tr>)

    for (let r = 1; r <= actualRowCount; r++) {
      const row = ws.getRow(r)
      const cells: React.ReactNode[] = [
        <td key={`rn-${r}`} style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-tertiary)',
          borderRight: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
          padding: '4px 8px',
          fontSize: 11,
          textAlign: 'center',
          position: 'sticky',
          left: 0,
          zIndex: 1
        }}>{r}</td>
      ]
      for (let c = 1; c <= actualColCount; c++) {
        const cell = row.getCell(c)
        const text = cell.text ?? ''
        cells.push(
          <td key={`c-${r}-${c}`} style={{
            borderRight: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
            padding: '4px 8px',
            fontSize: 12,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>{text}</td>
        )
      }
      rows.push(<tr key={`r-${r}`}>{cells}</tr>)
    }

    return (
      <table style={{
        borderCollapse: 'collapse',
        background: 'var(--bg-primary)',
        fontSize: 12,
        tableLayout: 'auto'
      }}>
        <tbody>{rows}</tbody>
      </table>
    )
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      overflow: 'hidden',
      background: 'var(--bg-secondary)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-tertiary)',
        flexShrink: 0
      }}>
        {/* sheet 切换 */}
        <select
          value={activeSheet}
          onChange={(e) => setActiveSheet(parseInt(e.target.value))}
          style={{
            fontSize: 12,
            padding: '3px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: 3,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            outline: 'none',
            maxWidth: 200
          }}
        >
          {sheetNames.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {sheetNames.length > 0 ? `${activeSheet + 1} / ${sheetNames.length} 个工作表` : ''}
        </span>
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
        )}
        <div style={{ flex: 1 }} />
        {loading && <Loader2 size={14} className="spin" style={{ color: 'var(--text-tertiary)' }} />}
        <button style={btnStyle} title="另存为..." onClick={handleSaveAs}>
          <Download size={16} />
        </button>
      </div>
      <div style={{
        flex: 1,
        overflow: 'auto',
        minHeight: 0
      }}>
        {error ? (
          <div style={{ color: '#d33', fontSize: 13, padding: 24 }}>表格加载失败：{error}</div>
        ) : loading ? null : renderSheet()}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/** 列号 1 → A, 27 → AA */
function colNumToLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
