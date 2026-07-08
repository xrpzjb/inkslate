import { useAppStore } from '../../store/app'
import { ImagePreview } from './ImagePreview'
import { PdfPreview } from './PdfPreview'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'
import { FileFallback } from './FileFallback'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']

/** 根据文件扩展名分发到对应预览组件 */
export function FilePreview() {
  const currentNote = useAppStore(s => s.currentNote)
  if (!currentNote) return null
  const ext = (currentNote.fileExt || '').toLowerCase()
  const noteId = currentNote.id

  // 图片
  if (IMAGE_EXTS.includes(ext) && currentNote.filePath) {
    return <ImagePreview noteId={noteId} filePath={currentNote.filePath} fileName={currentNote.fileName} />
  }
  // PDF
  if (ext === 'pdf') {
    return <PdfPreview noteId={noteId} />
  }
  // Word docx
  if (ext === 'docx') {
    return <DocxPreview noteId={noteId} />
  }
  // Excel xlsx
  if (ext === 'xlsx' || ext === 'xls') {
    return <XlsxPreview noteId={noteId} />
  }
  // 其他：fallback
  return (
    <FileFallback
      noteId={noteId}
      fileName={currentNote.fileName}
      fileExt={currentNote.fileExt}
      fileSize={currentNote.fileSize}
    />
  )
}
