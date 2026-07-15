import { useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
// docx-preview：vanilla JS 库，直接调 renderAsync
import { renderAsync } from 'docx-preview'

/** renderAsync 在主线程上跑 XML 解析 + DOM 构建，大文档会卡几秒到十几秒。
 *  - 渲染前用 setTimeout(0) 让出一次主线程，让 spinner / 进度文案先画一帧
 *  - 渲染用 Promise.race 卡 10s，超时主动 reject
 *  - 整体用 15s 硬截断兜底，文件再烂也不会让 UI 永远卡死 */
const RENDER_TIMEOUT_MS = 10_000
const HARD_TIMEOUT_MS = 15_000

export function DocxPreview({ noteId }: { noteId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('正在加载...')

  useEffect(() => {
    let cancelled = false
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null
    let renderTimeoutId: ReturnType<typeof setTimeout> | null = null

    const clearTimers = () => {
      if (hardTimeoutId) { clearTimeout(hardTimeoutId); hardTimeoutId = null }
      if (renderTimeoutId) { clearTimeout(renderTimeoutId); renderTimeoutId = null }
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

      // 硬超时：15s 后强制结束 loading（防 renderAsync 在主线程上死循环）
      hardTimeoutId = setTimeout(() => {
        finishLoading('文档加载超时（15s），可能是文档过大或格式复杂')
      }, HARD_TIMEOUT_MS)

      try {
        setStatus('正在读取文件...')
        const data = await window.inkslateApi.fileNote.read(noteId)
        if (cancelled) return

        if (!data) {
          finishLoading('文件不存在或无法读取')
          return
        }

        // yield 到事件循环：让 spinner / 进度文案先画一帧，
        // 避免大文件一上来就堵死主线程，spinner 看着像卡住
        setStatus('正在解析文档...')
        await new Promise(r => setTimeout(r, 0))
        if (cancelled) return

        const container = containerRef.current
        if (!container) {
          finishLoading('容器未就绪')
          return
        }

        // 清空旧内容
        container.innerHTML = ''

        // yield 100ms 让 pending 事件（如切笔记的 click）先处理
        await new Promise(r => setTimeout(r, 100))
        if (cancelled) return

        // renderAsync 单独的超时：10s 卡住就主动 reject，释放主线程
        setStatus('正在渲染文档...')
        const renderPromise = renderAsync(data, container, undefined, {
          className: 'docx-container',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          experimental: true
        } as any)

        const timeoutPromise = new Promise<never>((_, reject) => {
          renderTimeoutId = setTimeout(
            () => reject(new Error(`文档渲染超时（${RENDER_TIMEOUT_MS / 1000}s），可能是文档过大或格式复杂`)),
            RENDER_TIMEOUT_MS
          )
        })

        await Promise.race([renderPromise, timeoutPromise])
        finishLoading()
      } catch (e) {
        if (cancelled) return
        console.error('[DocxPreview] render error:', e)
        finishLoading((e as Error).message || '文档加载失败')
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimers()
    }
  }, [noteId])

  const handleSaveAs = async () => {
    await window.inkslateApi.fileNote.saveAs(noteId)
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
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Word 文档预览</span>
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{status}</span>
        )}
        <div style={{ flex: 1 }} />
        {loading && <Loader2 size={14} className="spin" style={{ color: 'var(--text-tertiary)' }} />}
        <button
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: 28, minWidth: 28, padding: '0 8px',
            border: 'none', borderRadius: 4, background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer'
          }}
          title="另存为..."
          onClick={handleSaveAs}
        >
          <Download size={16} />
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 0,
          // 给一个最小高度，确保 docx-preview 即使在容器刚 layout 完成时也能拿到空间
          minHeight: 400,
          background: '#fff',
          color: '#1a1a1a'
        }}
      >
        {error && (
          <div style={{ color: '#d33', fontSize: 13, padding: 24 }}>文档加载失败：{error}</div>
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
