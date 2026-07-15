import { File, Download, RefreshCw, FileArchive, FileText, FileCode, FileType2 } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../../store/app'
import { toast } from '../Toast'

/** 文件大小人类可读 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 根据扩展名选图标 */
function pickIcon(ext: string) {
  const e = ext.toLowerCase()
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(e)) return FileArchive
  if (['txt', 'log', 'md'].includes(e)) return FileText
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'rb', 'php', 'sh', 'json', 'xml', 'yaml', 'yml'].includes(e)) return FileCode
  if (['ppt', 'pptx'].includes(e)) return FileType2
  return File
}

export function FileFallback({ noteId, fileName, fileExt, fileSize, statusHint }: {
  noteId: string
  fileName?: string
  fileExt?: string
  fileSize?: number
  statusHint?: string
}) {
  const updateNote = useAppStore(s => s.updateNote)
  const [busy, setBusy] = useState(false)

  const Icon = pickIcon(fileExt || '')

  const handleSaveAs = async () => {
    await window.inkslateApi.fileNote.saveAs(noteId)
  }

  const handleReplace = async () => {
    const sourcePath = await window.inkslateApi.file.openDialog({
      title: '选择替换文件',
      properties: ['openFile']
    })
    if (!sourcePath) return
    setBusy(true)
    try {
      const result = await window.inkslateApi.fileNote.replace(noteId, sourcePath)
      if (result) {
        // 同步更新 store 里的 currentNote
        await updateNote(noteId, {
          fileName: result.fileName,
          filePath: result.filePath,
          fileSize: result.fileSize,
          fileExt: result.fileExt
        })
      }
    } catch (e) {
      toast.error('替换失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 16,
      background: 'var(--bg-secondary)',
      minHeight: 0
    }}>
      <div style={{
        width: 96,
        height: 96,
        borderRadius: 12,
        background: 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)'
      }}>
        <Icon size={56} strokeWidth={1.2} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text-primary)',
          wordBreak: 'break-all',
          maxWidth: 400
        }}>
          {fileName || '未命名文件'}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          marginTop: 4
        }}>
          {fileExt?.toUpperCase() || '未知'} {fileSize ? `· ${formatSize(fileSize)}` : ''}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          marginTop: 8,
          opacity: 0.7
        }}>
          {statusHint || '此文件类型不支持预览，可另存为或替换为其他文件'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleReplace}
          disabled={busy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 13,
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1
          }}
        >
          <RefreshCw size={14} className={busy ? 'spin' : ''} />
          {busy ? '替换中...' : '替换文件'}
        </button>
        <button
          onClick={handleSaveAs}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 13,
            border: 'none',
            borderRadius: 4,
            background: 'var(--accent-color)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          <Download size={14} />
          另存为...
        </button>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
