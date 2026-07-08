import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC_CHANNELS, Notebook, Note, AppSettings, AssetUploadResult } from '../shared/types'
import { dbApi, getFilesDir } from './db'
import { OssManager } from './oss/manager'

export function setupIpcHandlers(): void {

  // ============ 绗旇锟?============
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_LIST, async (): Promise<Notebook[]> => {
    return dbApi.listNotebooks()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_CREATE, async (_, name: string, parentId: string | null, icon?: string): Promise<Notebook> => {
    return dbApi.createNotebook(name, parentId, icon)
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_RENAME, async (_, id: string, newName: string): Promise<void> => {
    return dbApi.renameNotebook(id, newName)
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_DELETE, async (_, id: string): Promise<void> => {
    return dbApi.deleteNotebook(id)
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_MOVE, async (_, id: string, newParentId: string | null): Promise<void> => {
    return dbApi.moveNotebook(id, newParentId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_REORDER, async (_, parentId: string | null, orderedIds: string[]): Promise<void> => {
    return dbApi.reorderNotebooks(parentId, orderedIds)
  })

  // ============ 回收站 - 笔记本 ============
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_LIST_DELETED, async (): Promise<Notebook[]> => {
    return dbApi.listDeletedNotebooks()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_RESTORE, async (_, id: string): Promise<{ restoredNotebooks: string[] }> => {
    return dbApi.restoreNotebook(id)
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_PURGE, async (_, id: string): Promise<void> => {
    return dbApi.purgeNotebook(id)
  })

  // ============ 绗旇 ============
  ipcMain.handle(IPC_CHANNELS.NOTE_LIST, async (_, notebookId?: string): Promise<Note[]> => {
    return dbApi.listNotes(notebookId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_GET, async (_, id: string): Promise<Note | null> => {
    return dbApi.getNote(id)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_CREATE, async (_, title: string, notebookId: string, parentId: string | null, icon?: string, format: 'markdown' | 'html' | 'richtext' | 'code' | 'url' = 'markdown', language?: string, url?: string): Promise<Note> => {
    return dbApi.createNote(title, notebookId, parentId, icon, format, language, url)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_UPDATE, async (_, id: string, updates: Partial<Note>): Promise<Note> => {
    return dbApi.updateNote(id, updates)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_DELETE, async (_, id: string): Promise<void> => {
    return dbApi.deleteNote(id)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_MOVE, async (_, id: string, newParentId: string | null): Promise<void> => {
    return dbApi.moveNote(id, newParentId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_REORDER, async (_, notebookId: string, orderedIds: string[]): Promise<void> => {
    return dbApi.reorderNotes(notebookId, orderedIds)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_SEARCH, async (_, keyword: string): Promise<Note[]> => {
    return dbApi.searchNotes(keyword)
  })

  // ============ 回收站 - 笔记 ============
  ipcMain.handle(IPC_CHANNELS.NOTE_LIST_DELETED, async (): Promise<Note[]> => {
    return dbApi.listDeletedNotes()
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_RESTORE, async (_, id: string): Promise<{ restoredNotebooks: string[] }> => {
    return dbApi.restoreNote(id)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_PURGE, async (_, id: string): Promise<void> => {
    return dbApi.purgeNote(id)
  })

  // ============ 璁剧疆 ============
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    return dbApi.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, settings: Partial<AppSettings>): Promise<AppSettings> => {
    return dbApi.updateSettings(settings)
  })

  // ============ 回收站 - 通用 ============
  ipcMain.handle(IPC_CHANNELS.RECYCLE_BIN_PURGE_EXPIRED, async (): Promise<{ notes: number; notebooks: number }> => {
    const settings = dbApi.getSettings()
    if (!settings.recycleBin.autoCleanup || settings.recycleBin.retentionDays <= 0) {
      return { notes: 0, notebooks: 0 }
    }
    return dbApi.purgeExpired(settings.recycleBin.retentionDays)
  })

  ipcMain.handle(IPC_CHANNELS.RECYCLE_BIN_EMPTY, async (): Promise<{ notes: number; notebooks: number }> => {
    return dbApi.emptyRecycleBin()
  })

  // ============ OSS ============
  ipcMain.handle(IPC_CHANNELS.OSS_CONFIGURE, async (_, config: AppSettings['oss']): Promise<void> => {
    const saved = await dbApi.updateSettings({ oss: config })
    OssManager.getInstance().configure(saved.oss)
  })

  ipcMain.handle(IPC_CHANNELS.OSS_TEST, async (): Promise<{ ok: boolean; message: string }> => {
    return OssManager.getInstance().testConnection()
  })

  ipcMain.handle(IPC_CHANNELS.OSS_UPLOAD, async (_, buffer: Buffer, filename: string, contentType: string): Promise<AssetUploadResult> => {
    return OssManager.getInstance().uploadAsset(buffer, filename, contentType)
  })

  ipcMain.handle(IPC_CHANNELS.OSS_SYNC_PUSH, async (): Promise<{ ok: boolean; uploaded: number; failed: number }> => {
    return OssManager.getInstance().pushAll()
  })

  ipcMain.handle(IPC_CHANNELS.OSS_SYNC_PULL, async (): Promise<{ ok: boolean; downloaded: number; conflicts: number }> => {
    return OssManager.getInstance().pullAll()
  })

  // ============ 鏂囦欢瀵硅瘽锟?============
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIALOG, async (_, options: Electron.OpenDialogOptions): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT, async (_, format: 'html' | 'md'): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      filters: format === 'html'
        ? [{ name: 'HTML', extensions: ['html'] }]
        : [{ name: 'Markdown', extensions: ['md'] }]
    })
    return result.canceled ? null : result.filePath ?? null
  })

  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_PDF, async (_, payload: { title: string; html: string }): Promise<boolean> => {
    const owner = BrowserWindow.getFocusedWindow()
    if (!owner) return false
    const result = await dialog.showSaveDialog(owner, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: `${payload?.title || '笔记'}.pdf`
    })
    if (result.canceled || !result.filePath) return false

    // 用隐藏的 BrowserWindow 加载纯 HTML 再 printToPDF，
    // 避免抓到主窗口的标题栏 / 侧边栏 / 工具栏
    const safeTitle = String(payload?.title ?? '笔记')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const wrapper = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    color: #1f2328;
    line-height: 1.6;
    font-size: 14px;
  }
  h1 { font-size: 22px; margin: 0 0 16px; border-bottom: 1px solid #e1e4e8; padding-bottom: 8px; }
  h2 { font-size: 18px; margin: 24px 0 12px; }
  h3 { font-size: 16px; margin: 20px 0 10px; }
  p  { margin: 8px 0; }
  pre, code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow: auto; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 0.92em; }
  pre code { background: transparent; padding: 0; }
  blockquote { margin: 8px 0; padding: 0 12px; color: #57606a; border-left: 3px solid #d0d7de; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #d0d7de; padding: 6px 12px; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #e1e4e8; margin: 16px 0; }
</style>
</head>
<body>
${payload?.html ?? ''}
</body>
</html>`

    const tempWin = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: true, contextIsolation: true }
    })
    try {
      await tempWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(wrapper))
      // 等渲染稳定
      await new Promise(r => setTimeout(r, 150))
      const pdfBuffer = await tempWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      })
      await require('node:fs').promises.writeFile(result.filePath, pdfBuffer)
      return true
    } finally {
      tempWin.destroy()
    }
  })

  // 把字符串内容写到任意路径（HTML 导出等用）
  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_, filePath: string, content: string): Promise<void> => {
    await require('node:fs').promises.writeFile(filePath, content, 'utf-8')
  })

  // 把本地图片读为 base64 data URL（富文本插入图片用）
  ipcMain.handle(IPC_CHANNELS.FILE_READ_BASE64, async (_, filePath: string): Promise<{ base64: string, mime: string }> => {
    const fs = require('node:fs')
    const ext = require('node:path').extname(filePath).slice(1).toLowerCase()
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      bmp: 'image/bmp', ico: 'image/x-icon'
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const buffer = await fs.promises.readFile(filePath)
    return { base64: buffer.toString('base64'), mime }
  })

  // ============ 文件笔记 ============
  /**
   * 创建文件笔记：把用户选的源文件复制到 app data/notes/files/{noteId}.{ext}，
   * 然后调 setNoteFile 把文件信息写库。
   * 入参：noteId（先 createNote 出来）、sourcePath（用户选的源文件）
   * 返回：{ filePath, fileName, fileSize, fileExt }
   */
  ipcMain.handle(IPC_CHANNELS.FILE_NOTE_CREATE, async (_, noteId: string, sourcePath: string): Promise<{
    filePath: string; fileName: string; fileSize: number; fileExt: string
  } | null> => {
    if (!fs.existsSync(sourcePath)) return null
    const filesDir = getFilesDir()
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    const stat = fs.statSync(sourcePath)
    const ext = path.extname(sourcePath).slice(1).toLowerCase()
    const destPath = path.join(filesDir, `${noteId}.${ext || 'bin'}`)
    await fs.promises.copyFile(sourcePath, destPath)
    const fileName = path.basename(sourcePath)
    const fileSize = stat.size
    dbApi.setNoteFile(noteId, { filePath: destPath, fileName, fileSize, fileExt: ext })
    return { filePath: destPath, fileName, fileSize, fileExt: ext }
  })

  /**
   * 替换文件笔记的源文件：删旧文件 → 复制新文件 → 更新库
   */
  ipcMain.handle(IPC_CHANNELS.FILE_NOTE_REPLACE, async (_, noteId: string, sourcePath: string): Promise<{
    filePath: string; fileName: string; fileSize: number; fileExt: string
  } | null> => {
    if (!fs.existsSync(sourcePath)) return null
    const note = dbApi.getNote(noteId)
    if (!note) return null
    // 删旧文件
    if (note.filePath && fs.existsSync(note.filePath)) {
      try { await fs.promises.unlink(note.filePath) } catch {}
    }
    const filesDir = getFilesDir()
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true })
    const stat = fs.statSync(sourcePath)
    const ext = path.extname(sourcePath).slice(1).toLowerCase()
    const destPath = path.join(filesDir, `${noteId}.${ext || 'bin'}`)
    await fs.promises.copyFile(sourcePath, destPath)
    const fileName = path.basename(sourcePath)
    const fileSize = stat.size
    dbApi.updateNote(noteId, { filePath: destPath, fileName, fileSize, fileExt: ext })
    return { filePath: destPath, fileName, fileSize, fileExt: ext }
  })

  /** 另存为：弹保存对话框，把文件笔记的源文件复制到用户选的位置 */
  ipcMain.handle(IPC_CHANNELS.FILE_NOTE_SAVE_AS, async (_, noteId: string): Promise<boolean> => {
    const note = dbApi.getNote(noteId)
    if (!note?.filePath || !fs.existsSync(note.filePath)) return false
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      defaultPath: note.fileName || '未命名文件',
      filters: note.fileExt
        ? [{ name: note.fileExt.toUpperCase(), extensions: [note.fileExt] }, { name: '所有文件', extensions: ['*'] }]
        : [{ name: '所有文件', extensions: ['*'] }]
    })
    if (result.canceled || !result.filePath) return false
    await fs.promises.copyFile(note.filePath, result.filePath)
    return true
  })

  /** 读取文件笔记源文件内容为 ArrayBuffer，给前端预览组件用 */
  ipcMain.handle(IPC_CHANNELS.FILE_NOTE_READ, async (_, noteId: string): Promise<ArrayBuffer | null> => {
    const note = dbApi.getNote(noteId)
    if (!note?.filePath || !fs.existsSync(note.filePath)) return null
    const buffer = await fs.promises.readFile(note.filePath)
    // 把 Node Buffer 转成可 IPC 传输的 ArrayBuffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })
}
