import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC_CHANNELS, Notebook, Note, AppSettings, AssetUploadResult } from '../shared/types'
import { dbApi } from './db'
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

  ipcMain.handle(IPC_CHANNELS.NOTE_CREATE, async (_, title: string, notebookId: string, parentId: string | null, icon?: string, format: 'markdown' | 'html' | 'richtext' | 'code' = 'markdown', language?: string): Promise<Note> => {
    return dbApi.createNote(title, notebookId, parentId, icon, format, language)
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

  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_PDF, async (): Promise<boolean> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return false
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 1, bottom: 1, left: 1, right: 1 }
    })
    await require('node:fs').promises.writeFile(result.filePath, pdfBuffer)
    return true
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
}
