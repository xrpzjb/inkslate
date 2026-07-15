import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app'
import { ImagePreview } from './ImagePreview'
import { PdfPreview } from './PdfPreview'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'
import { FileFallback } from './FileFallback'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']
const HEAVY_EXTS = new Set(['pdf', 'docx', 'xlsx', 'xls'])

/** 根据文件扩展名分发到对应预览组件。
 *  对 PDF/DOCX/XLSX 等会阻塞主线程的格式，延迟 500ms 再挂载，
 *  给用户留出切换笔记的窗口，避免 renderAsync / pdfjs / exceljs 堵死 UI。 */
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
    const timer = setTimeout(() => setReady(true), 500)
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
      <FileFallback
        noteId={noteId}
        fileName={currentNote.fileName}
        fileExt={currentNote.fileExt}
        fileSize={currentNote.fileSize}
        statusHint="正在准备预览，可随时切换至其他笔记..."
      />
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
