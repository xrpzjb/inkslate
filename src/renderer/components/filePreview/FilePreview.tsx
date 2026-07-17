import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app'
import { ImagePreview } from './ImagePreview'
import { PdfPreview } from './PdfPreview'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'
import { FileFallback } from './FileFallback'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']
const HEAVY_EXTS = new Set(['pdf', 'docx', 'xlsx', 'xls'])

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 根据文件扩展名分发到对应预览组件。
 *  对 PDF/DOCX/XLSX 等会阻塞主线程的格式，必须用户点击"加载预览"后才挂载，
 *  避免切换笔记时被同步解析卡死 UI。 */
export function FilePreview() {
  const currentNote = useAppStore(s => s.currentNote)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    if (!currentNote) return
    const ext = (currentNote.fileExt || '').toLowerCase()
    if (!HEAVY_EXTS.has(ext)) {
      setReady(true)
      return
    }
    const timer = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(timer)
  }, [currentNote?.id, currentNote?.fileExt])

  if (!currentNote) return null
  const ext = (currentNote.fileExt || '').toLowerCase()
  const noteId = currentNote.id

  if (IMAGE_EXTS.includes(ext) && currentNote.filePath) {
    return <ImagePreview noteId={noteId} filePath={currentNote.filePath} fileName={currentNote.fileName} />
  }

  if (HEAVY_EXTS.has(ext) && !ready) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 40, gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{currentNote.fileName || '未命名文件'}</div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          {currentNote.fileExt?.toUpperCase()} 文件 · {formatFileSize(currentNote.fileSize)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>准备预览中…可随时切换笔记</div>
      </div>
    )
  }

  if (ext === 'pdf') {
    return <PdfPreview noteId={noteId} />
  }
  if (ext === 'docx') {
    return <DocxPreview noteId={noteId} />
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return <XlsxPreview noteId={noteId} />
  }
  return (
    <FileFallback
      noteId={noteId}
      fileName={currentNote.fileName}
      fileExt={currentNote.fileExt}
      fileSize={currentNote.fileSize}
    />
  )
}
