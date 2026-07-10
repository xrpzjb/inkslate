import { useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
// docx-preview：vanilla JS 库，直接调 renderAsync
import { renderAsync } from 'docx-preview'

export function DocxPreview({ noteId }: { noteId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await window.inkslateApi.fileNote.read(noteId)
        if (cancelled) return
        if (!data) {
          setError('文件不存在或无法读取')
          setLoading(false)
          return
        }
        const container = containerRef.current
        if (!container) return
        // 清空旧内容
        container.innerHTML = ''
        // docx-preview 接收 ArrayBuffer/Blob
        await renderAsync(data, container, undefined, {
          className: 'docx-container',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          experimental: true
        } as any)
        if (!cancelled) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          console.error('[DocxPreview] render error:', e)
          setError((e as Error).message || '文档加载失败')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
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
