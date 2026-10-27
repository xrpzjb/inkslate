import { useEffect, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from 'lucide-react'

/** 图片预览：优先通过 IPC 读取源文件并生成 blob URL
 *  （不依赖 file:// 协议，避免 CSP/本地资源限制导致图片空白）
 *  支持缩放、旋转、原图大小、另存为 */
export function ImagePreview({ noteId, filePath, fileName }: {
  noteId: string
  filePath: string
  fileName?: string
}) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      bmp: 'image/bmp', ico: 'image/x-icon'
    }
    const ext = (fileName?.split('.').pop() || filePath.split('.').pop() || '').toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'
    setSrc('')

    ;(async () => {
      try {
        const data = await window.inkslateApi.fileNote.read(noteId)
        if (cancelled) return
        if (!data) throw new Error('empty file')
        const blob = new Blob([data], { type: mime })
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch {
        if (cancelled) return
        // 兜底：直接走 file://（路径里的中文/空格需编码）
        let normalized = filePath.replace(/\\/g, '/')
        if (!normalized.startsWith('/')) normalized = `/${normalized}`
        const encoded = encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')
        setSrc(`file://${encoded}?t=${Date.now()}`)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [noteId, filePath, fileName])

  const handleSaveAs = async () => {
    await window.inkslateApi.fileNote.saveAs(noteId)
  }

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer'
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
      {/* 工具栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-tertiary)',
        flexShrink: 0
      }}>
        <button style={btnStyle} title="缩小" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>
          <ZoomOut size={16} />
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 44, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button style={btnStyle} title="放大" onClick={() => setZoom(z => Math.min(5, z + 0.1))}>
          <ZoomIn size={16} />
        </button>
        <button style={btnStyle} title="还原 100%" onClick={() => setZoom(1)}>1:1</button>
        <button style={btnStyle} title="旋转" onClick={() => setRotation(r => (r + 90) % 360)}>
          <RotateCw size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button style={btnStyle} title="另存为..." onClick={handleSaveAs}>
          <Download size={16} />
        </button>
      </div>

      {/* 图片容器 */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        minHeight: 0
      }}>
        {src && (
          <img
            src={src}
            alt={fileName || 'image'}
            style={{
              maxWidth: zoom === 1 ? '100%' : 'none',
              maxHeight: zoom === 1 ? '100%' : 'none',
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
            }}
          />
        )}
      </div>
    </div>
  )
}
