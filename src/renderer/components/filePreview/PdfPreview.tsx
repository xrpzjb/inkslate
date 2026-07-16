import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = PdfWorker

const HARD_TIMEOUT_MS = 30_000

export function PdfPreview({ noteId }: { noteId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [status, setStatus] = useState('正在加载...')
  const pdfDocRef = useRef<any>(null)
  const loadingTaskRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: any = null
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null

    const clearTimers = () => {
      if (hardTimeoutId) { clearTimeout(hardTimeoutId); hardTimeoutId = null }
    }

    const finishLoading = (errorMsg: string | null = null) => {
      if (cancelled) return
      cancelled = true
      clearTimers()
      if (errorMsg) setError(errorMsg)
      setLoading(false)
    }

    const load = async () => {
      setLoading(true)
      setError(null)
      setStatus('正在加载文件...')

      // 硬超时：20s 后强制结束 loading（PDF 解析 + 渲染都会卡主线程）
      hardTimeoutId = setTimeout(() => {
        finishLoading(`PDF 加载超时（${HARD_TIMEOUT_MS / 1000}s），可能是文件过大或已损坏`)
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
        setStatus('正在解析 PDF...')
        await new Promise(r => setTimeout(r, 0))
        if (cancelled) return

        // 再 yield 一次，给切换笔记等操作留出窗口
        await new Promise(r => setTimeout(r, 100))
        if (cancelled) return

        const loadingTask = (pdfjsLib as any).getDocument({ data })
        loadingTaskRef.current = loadingTask
        const pdf = await loadingTask.promise
        if (cancelled) {
          pdf.destroy()
          return
        }
        pdfDocRef.current = pdf
        setPageCount(pdf.numPages)
        setCurrentPage(1)

        setStatus(`正在渲染首页（1 / ${pdf.numPages}）...`)
        await new Promise(r => setTimeout(r, 0))
        if (cancelled) {
          pdf.destroy()
          return
        }

        await renderPage(pdf, 1)
        finishLoading()
      } catch (e) {
        if (cancelled) return
        console.error('[PdfPreview] load error:', e)
        finishLoading((e as Error).message || '加载失败')
      }
    }

    load()

    return () => {
      cancelled = true
      clearTimers()
      if (renderTask) try { renderTask.cancel() } catch {}
      if (loadingTaskRef.current) try { loadingTaskRef.current.destroy() } catch {}
      loadingTaskRef.current = null
      if (pdfDocRef.current) try { pdfDocRef.current.destroy() } catch {}
      pdfDocRef.current = null
    }
  }, [noteId])

  const renderPage = async (pdf: any, pageNum: number) => {
    const container = containerRef.current
    if (!container) return
    const page = await pdf.getPage(pageNum)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    // 适应容器宽度
    const containerWidth = container.clientWidth - 32
    const viewport0 = page.getViewport({ scale: 1 })
    const scale = Math.max(0.5, Math.min(3, containerWidth / viewport0.width))
    const viewport = page.getViewport({ scale })
    // 高 DPI 支持
    const dpr = window.devicePixelRatio || 1
    canvas.width = viewport.width * dpr
    canvas.height = viewport.height * dpr
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const renderTask = page.render({ canvasContext: ctx, viewport })
    await renderTask.promise
  }

  const goToPage = async (n: number) => {
    if (!pdfDocRef.current || n < 1 || n > pageCount) return
    setCurrentPage(n)
    setLoading(true)
    try {
      await renderPage(pdfDocRef.current, n)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }

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
        <button style={btnStyle} title="上一页" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 60, textAlign: 'center' }}>
          {pageCount > 0 ? `${currentPage} / ${pageCount}` : '-'}
        </span>
        <button style={btnStyle} title="下一页" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount}>
          <ChevronRight size={16} />
        </button>
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
        )}
        <div style={{ flex: 1 }} />
        {loading && <Loader2 size={14} className="spin" style={{ color: 'var(--text-tertiary)' }} />}
        <button style={btnStyle} title="另存为..." onClick={handleSaveAs}>
          <Download size={16} />
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start'
        }}
      >
        {error ? (
          <div style={{ color: '#d33', fontSize: 13, padding: 24 }}>PDF 加载失败：{error}</div>
        ) : (
          <canvas style={{ background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }} />
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
