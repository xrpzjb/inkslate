import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC_CHANNELS, Notebook, Note, AppSettings, AssetUploadResult } from '../shared/types'
import { dbApi, getFilesDir, slugify, getUniqueFileName } from './db'
import { OssManager } from './oss/manager'
import { GitManager } from './git/manager'
import { encryptWithCachedKey, hasCachedKey } from './crypto'
import { exportNoteToWord } from './export/docx'
import { addPdfOutline } from './export/pdfOutline'

let ProxyAgent: any = undefined
try {
  ;({ ProxyAgent } = require('undici'))
} catch {}

export function setupIpcHandlers(): void {
  const gitMgr = GitManager.getInstance()

  // ============ 笔记本 ============
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_LIST, async (): Promise<Notebook[]> => {
    return dbApi.listNotebooks()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_CREATE, async (_, name: string, parentId: string | null, icon?: string): Promise<Notebook> => {
    const result = dbApi.createNotebook(name, parentId, icon)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_RENAME, async (_, id: string, newName: string): Promise<void> => {
    dbApi.renameNotebook(id, newName)
    gitMgr.exportMetadata()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_DELETE, async (_, id: string): Promise<void> => {
    dbApi.deleteNotebook(id)
    gitMgr.exportMetadata()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_MOVE, async (_, id: string, newParentId: string | null): Promise<void> => {
    dbApi.moveNotebook(id, newParentId)
    gitMgr.exportMetadata()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_REORDER, async (_, parentId: string | null, orderedIds: string[]): Promise<void> => {
    dbApi.reorderNotebooks(parentId, orderedIds)
    gitMgr.exportMetadata()
  })

  /** 通用更新笔记本（name / icon / parentId 任一） */
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_UPDATE, async (_, id: string, updates: {
    name?: string
    icon?: string | null
    parentId?: string | null
  }): Promise<void> => {
    dbApi.updateNotebook(id, updates)
    gitMgr.exportMetadata()
  })

  // ============ 笔记本密码 ============
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_SET_PASSWORD, async (_, notebookId: string, password: string): Promise<{ ok: boolean; message: string }> => {
    try {
      dbApi.setNotebookPassword(notebookId, password)
      gitMgr.exportMetadata()
      return { ok: true, message: '密码设置成功' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '设置密码失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_REMOVE_PASSWORD, async (_, notebookId: string, password: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const success = dbApi.removeNotebookPassword(notebookId, password)
      if (!success) return { ok: false, message: '密码错误，无法移除' }
      gitMgr.exportMetadata()
      return { ok: true, message: '密码已移除' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '移除密码失败' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_UNLOCK, async (_, notebookId: string, password: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const success = dbApi.unlockNotebook(notebookId, password)
      return success ? { ok: true, message: '验证成功' } : { ok: false, message: '密码错误' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '验证失败' }
    }
  })

  // ============ 回收站 - 笔记本 ============
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_LIST_DELETED, async (): Promise<Notebook[]> => {
    return dbApi.listDeletedNotebooks()
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_RESTORE, async (_, id: string): Promise<{ restoredNotebooks: string[] }> => {
    const result = dbApi.restoreNotebook(id)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_PURGE, async (_, id: string): Promise<void> => {
    dbApi.purgeNotebook(id)
    gitMgr.exportMetadata()
  })

  // ============ 绗旇 ============
  ipcMain.handle(IPC_CHANNELS.NOTE_LIST, async (_, notebookId?: string): Promise<Note[]> => {
    return dbApi.listNotes(notebookId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_GET, async (_, id: string): Promise<Note | null> => {
    return dbApi.getNote(id)
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_CREATE, async (_, title: string, notebookId: string, parentId: string | null, icon?: string, format: 'markdown' | 'html' | 'richtext' | 'code' | 'url' = 'markdown', language?: string, url?: string): Promise<Note> => {
    const result = dbApi.createNote(title, notebookId, parentId, icon, format, language, url)
    // 如果笔记本受密码保护且有缓存 key，自动加密新笔记
    if (result && hasCachedKey(notebookId)) {
      const encrypted = encryptWithCachedKey(result.content, notebookId)
      if (encrypted) {
        dbApi.updateNote(result.id, { content: encrypted } as any)
        dbApi.getNote(result.id)!.content = encrypted // force re-read
      }
    }
    gitMgr.exportMetadata()
    return dbApi.getNote(result.id)!
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_UPDATE, async (_, id: string, updates: Partial<Note>): Promise<Note> => {
    // 如果内容被更新且笔记本受保护，加密内容
    if (updates.content !== undefined) {
      const note = dbApi.getNote(id)
      if (note && hasCachedKey(note.notebookId)) {
        const encrypted = encryptWithCachedKey(updates.content, note.notebookId)
        if (encrypted) updates.content = encrypted
      }
    }
    const result = dbApi.updateNote(id, updates)
    if (updates.content !== undefined) {
      const exists = fs.existsSync(result.path)
      console.log('[note:update] wrote content to', result.path, 'file exists:', exists)
    }
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_DELETE, async (_, id: string): Promise<void> => {
    dbApi.deleteNote(id)
    gitMgr.exportMetadata()
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_MOVE, async (_, id: string, newParentId: string | null): Promise<void> => {
    dbApi.moveNote(id, newParentId)
    gitMgr.exportMetadata()
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_REORDER, async (_, notebookId: string, orderedIds: string[]): Promise<void> => {
    dbApi.reorderNotes(notebookId, orderedIds)
    gitMgr.exportMetadata()
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_SEARCH, async (_, keyword: string): Promise<Note[]> => {
    return dbApi.searchNotes(keyword)
  })

  // ============ 回收站 - 笔记 ============
  ipcMain.handle(IPC_CHANNELS.NOTE_LIST_DELETED, async (): Promise<Note[]> => {
    return dbApi.listDeletedNotes()
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_RESTORE, async (_, id: string): Promise<{ restoredNotebooks: string[] }> => {
    const result = dbApi.restoreNote(id)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_PURGE, async (_, id: string): Promise<void> => {
    dbApi.purgeNote(id)
    gitMgr.exportMetadata()
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
    const result = dbApi.purgeExpired(settings.recycleBin.retentionDays)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.RECYCLE_BIN_EMPTY, async (): Promise<{ notes: number; notebooks: number }> => {
    const result = dbApi.emptyRecycleBin()
    gitMgr.exportMetadata()
    return result
  })

  // ============ 闪念 ============
  ipcMain.handle(IPC_CHANNELS.FLASH_THOUGHTS_LIST, async () => {
    return dbApi.listFlashThoughts()
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_THOUGHTS_CREATE, async (_, content: string) => {
    const result = dbApi.createFlashThought(content)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_THOUGHTS_UPDATE, async (_, id: string, content: string) => {
    const result = dbApi.updateFlashThought(id, content)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_THOUGHTS_SET_DONE, async (_, id: string, done: boolean) => {
    const result = dbApi.setFlashThoughtDone(id, done)
    gitMgr.exportMetadata()
    return result
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_THOUGHTS_DELETE, async (_, id: string) => {
    dbApi.deleteFlashThought(id)
    gitMgr.exportMetadata()
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
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIALOG, async (_, options: Electron.OpenDialogOptions): Promise<string[]> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, options)
    return result.canceled ? [] : result.filePaths
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

  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_PDF, async (_, payload: { title: string; html: string; watermark?: string }): Promise<boolean> => {
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
    const watermark = String(payload?.watermark ?? '').trim()
    const safeWatermark = watermark
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    // 兜底后处理：给 payload.html 里所有 <pre> 注入 !important 内联样式，
    // 保证代码块在 PDF 中必定换行（无论 renderer 是否生效、是否有缓存）。
    // 最高优先级 inline !important，无法被任何 CSS 覆盖。
    const PRE_WRAP_CSS = 'white-space:pre-wrap !important;word-break:break-all !important;overflow:visible !important'
    const forcePreWrap = (html: string): string =>
      html.replace(/<pre\b([^>]*)>/gi, (_match, attrs: string) => {
        const styleMatch = attrs.match(/\sstyle\s*=\s*(["'])(.*?)\1/i)
        if (styleMatch) {
          const merged = `${styleMatch[2]};${PRE_WRAP_CSS}`
          return `<pre${attrs.replace(styleMatch[0], ` style="${merged}"`)}>`
        }
        return `<pre${attrs} style="${PRE_WRAP_CSS}">`
      })
    const safeHtml = forcePreWrap(String(payload?.html ?? ''))
    // 水印层：position:fixed 元素会被 Chromium printToPDF 在每一页重复渲染，
    // 用固定网格铺满整页，旋转 + 低透明度，不拦截鼠标事件
    const watermarkHtml = safeWatermark ? `
  <div class="pdf-watermark" aria-hidden="true">${Array.from({ length: 12 }, () => `<span>${safeWatermark}</span>`).join('')}</div>` : ''
    const wrapper = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  /* 页面尺寸和边距统一由下方 printToPDF 选项决定，这里不设 @page margin，
     否则会和 printToPDF 的 margins 叠加，影响标题→页码换算 */
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
  /* PDF 里代码块不能有横向滚动条：改成自动换行，长行折行显示。
     !important 兜底，防止笔记 HTML 里的内联样式（DOMPurify 放行 style）覆盖 */
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow: visible !important; white-space: pre-wrap !important; word-break: break-all !important; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 0.92em; }
  pre code { background: transparent; padding: 0; white-space: pre-wrap !important; word-break: break-all !important; }
  blockquote { margin: 8px 0; padding: 0 12px; color: #57606a; border-left: 3px solid #d0d7de; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #d0d7de; padding: 6px 12px; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #e1e4e8; margin: 16px 0; }
  .pdf-watermark {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(4, 1fr);
    align-items: center;
    justify-items: center;
  }
  .pdf-watermark span {
    font-size: 42px;
    font-weight: bold;
    color: #1f2328;
    opacity: 0.12;
    white-space: nowrap;
    transform: rotate(-30deg);
  }
</style>
</head>
<body>
${safeHtml}
${watermarkHtml}
</body>
</html>`

    // A4 尺寸与 printToPDF 的 0.4in 边距 → 打印内容区（CSS px，96dpi）
    // 让隐藏窗口用相同的内容宽度排版，DOM 里的标题 offsetTop 就能换算成准确页码
    const PX_PER_PT = 96 / 72
    const PAGE_W = 595.28
    const PAGE_H = 841.89
    const MARGIN_IN = 0.4
    const MARGIN_PT = MARGIN_IN * 72
    const CONTENT_W = Math.ceil((PAGE_W - MARGIN_PT * 2) * PX_PER_PT)
    const CONTENT_H = (PAGE_H - MARGIN_PT * 2) * PX_PER_PT

    const tempWin = new BrowserWindow({
      show: false,
      width: CONTENT_W,
      height: 800,
      useContentSize: true,
      webPreferences: { offscreen: true, sandbox: true, contextIsolation: true }
    })
    try {
      await tempWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(wrapper))
      // 等渲染稳定
      await new Promise(r => setTimeout(r, 150))
      // 收集所有标题及其在文档中的纵向位置（CSS px），用于生成 PDF 目录书签
      const headings: { text: string; top: number }[] = await tempWin.webContents.executeJavaScript(`(() => {
        const res = []
        document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
          const text = (h.textContent || '').trim()
          if (!text) return
          res.push({ text, top: h.getBoundingClientRect().top + (window.scrollY || 0) })
        })
        return res
      })()`)
      const pdfBuffer = await tempWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: MARGIN_IN, bottom: MARGIN_IN, left: MARGIN_IN, right: MARGIN_IN }
      })
      // printToPDF 不会生成书签，用 pdf-lib 后处理注入目录（Outlines）树
      const outlineItems = headings.map(h => ({
        title: h.text,
        pageIndex: Math.floor(h.top / CONTENT_H)
      }))
      const out = await addPdfOutline(new Uint8Array(pdfBuffer), outlineItems)
      await require('node:fs').promises.writeFile(result.filePath, out)
      return true
    } finally {
      tempWin.destroy()
    }
  })

  // 把字符串内容写到任意路径（HTML 导出等用）
  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_, filePath: string, content: string): Promise<void> => {
    await require('node:fs').promises.writeFile(filePath, content, 'utf-8')
  })

  /** 导出 Word：渲染进程传笔记原始内容，主进程渲染 + 转换 + 保存 */
  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_DOCX, async (_, payload: {
    title: string
    content: string
    format: Note['format']
    basePath?: string
    language?: string
  }): Promise<{ ok: boolean; message: string }> => {
    const owner = BrowserWindow.getFocusedWindow()
    if (!owner) return { ok: false, message: '没有活动窗口' }
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: `${payload?.title || '笔记'}.docx`,
      filters: [{ name: 'Word 文档', extensions: ['docx'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消' }
    try {
      const buffer = await exportNoteToWord(payload)
      await fs.promises.writeFile(result.filePath, buffer)
      return { ok: true, message: result.filePath }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '导出失败' }
    }
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
    const stat = fs.statSync(sourcePath)
    const ext = path.extname(sourcePath).slice(1).toLowerCase() || 'bin'
    const baseName = path.basename(sourcePath, path.extname(sourcePath))
    // 用 notebook 树状目录（不是扁平 filesDir），跟笔记主文件同构
    const dest = dbApi.prepareFileNoteCopy(noteId, baseName + path.extname(sourcePath))
    const destPath = dest.fullPath
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    await fs.promises.copyFile(sourcePath, destPath)
    // 存到库里的 fileName = 原始文件全名（带后缀），让 UI 直接展示
    const fileName = baseName + path.extname(sourcePath)
    const fileSize = stat.size
    dbApi.setNoteFile(noteId, { filePath: destPath, fileName, fileSize, fileExt: ext })
    gitMgr.exportMetadata()
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
    // 用文件名（去扩展名）做 slug
    const baseName = path.basename(sourcePath, path.extname(sourcePath))
    const slug = slugify(baseName)
    const uniqueName = getUniqueFileName(slug, ext || 'bin', filesDir, note.filePath)
    const destPath = path.join(filesDir, uniqueName)
    await fs.promises.copyFile(sourcePath, destPath)
    const fileName = path.basename(sourcePath)
    const fileSize = stat.size
    dbApi.updateNote(noteId, { filePath: destPath, fileName, fileSize, fileExt: ext })
    gitMgr.exportMetadata()
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

  /** 读取文件笔记源文件内容，给前端预览组件用 */
  ipcMain.handle(IPC_CHANNELS.FILE_NOTE_READ, async (_, noteId: string): Promise<Uint8Array | null> => {
    const note = dbApi.getNote(noteId)
    if (!note?.filePath || !fs.existsSync(note.filePath)) return null
    const buffer = await fs.promises.readFile(note.filePath)
    // Uint8Array 比 ArrayBuffer 更可靠地通过 contextBridge 结构化克隆
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  })

  // ============ Git 同步 ============

  /** 保存 Git 配置（URL/branch/author/username/password），密码用 safeStorage 加密 */
  ipcMain.handle(IPC_CHANNELS.GIT_CONFIGURE, async (_, payload: {
    repoUrl: string
    branch: string
    authorName: string
    authorEmail: string
    username: string
    token: string
  }): Promise<AppSettings['gitSync']> => {
    return gitMgr.saveConfig(payload.repoUrl, payload.branch, payload.authorName, payload.authorEmail, payload.username, payload.token)
  })

  /** 工作区变更状态 */
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (): Promise<{ filepath: string; status: string }[]> => {
    const result = await gitMgr.status()
    console.log('[git:status] result:', JSON.stringify(result))
    return result
  })

  /** 在工作区 git init + 初始 commit */
  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (): Promise<{ ok: boolean; message: string }> => {
    try {
      await gitMgr.initRepo()
      return { ok: true, message: '初始化成功' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '初始化失败' }
    }
  })

  /** 从远端 clone（工作区须为空） */
  ipcMain.handle(IPC_CHANNELS.GIT_CLONE, async (_, url: string): Promise<{ ok: boolean; message: string }> => {
    try {
      await gitMgr.cloneRepo(url)
      return { ok: true, message: '克隆成功' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '克隆失败' }
    }
  })

  /** 检查本地是否有真实数据（非默认空"我的笔记"），供 clone 前确认用 */
  ipcMain.handle(IPC_CHANNELS.GIT_CLONE_CHECK, async (): Promise<{ hasRealData: boolean }> => {
    const nbCount = dbApi.listActiveNotebooks().length
    const noteCount = dbApi.listActiveNotes().length
    // 只有 1 个默认笔记本且 0 条笔记 → 无真实数据
    return { hasRealData: !(nbCount <= 1 && noteCount === 0) }
  })

  /** push 到远端 */
  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_, autoCommit: boolean = true): Promise<{ ok: boolean; message: string }> => {
    try {
      if (autoCommit) {
        await gitMgr.commitAll(`update: ${new Date().toLocaleString('zh-CN')}`)
      }
      const r = await gitMgr.push()
      if (r.ok) {
        const at = Date.now()
        dbApi.updateSettings({ gitSync: { ...dbApi.getSettings().gitSync, lastSyncAt: at } } as any)
      }
      return r
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'push 失败' }
    }
  })

  /** pull = fetch + merge */
  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (): Promise<{ ok: boolean; message: string; updated: boolean; reconciled: boolean; conflicts?: number; conflictTitles?: string[] }> => {
    const r = await gitMgr.pull()
    if (r.ok) {
      const at = Date.now()
      dbApi.updateSettings({ gitSync: { ...dbApi.getSettings().gitSync, lastSyncAt: at } } as any)
    }
    return r
  })

  /** 一键同步：commit → pull → push */
  ipcMain.handle(IPC_CHANNELS.GIT_SYNC, async (): Promise<{
    ok: boolean
    message: string
    phase?: 'commit' | 'pull' | 'push'
    phases?: { commit: 'ok' | 'skipped' | 'failed'; pull: 'ok' | 'up-to-date' | 'failed'; push: 'ok' | 'up-to-date' | 'failed' }
    pulled?: boolean
    pushed?: boolean
    conflicts?: number
    conflictTitles?: string[]
  }> => {
    const r = await gitMgr.sync()
    // 整体成功才记 lastSyncAt（不论动了数据没）
    if (r.ok) {
      const at = Date.now()
      dbApi.updateSettings({ gitSync: { ...dbApi.getSettings().gitSync, lastSyncAt: at } } as any)
    }
    return r
  })

  /** 是否已配置（用于 UI 决定要不要禁用同步按钮） */
  ipcMain.handle(IPC_CHANNELS.GIT_IS_CONFIGURED, async (): Promise<{ configured: boolean; initialized: boolean }> => {
    return {
      configured: gitMgr.isConfigured(),
      initialized: gitMgr.isInitialized()
    }
  })

  /** 提交历史（可指定 filepath） */
  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_, filepath?: string, maxCount?: number): Promise<any[]> => {
    return gitMgr.log(filepath, maxCount ?? 50)
  })

  /** 读指定 commit 的文件内容（文本） */
  ipcMain.handle(IPC_CHANNELS.GIT_SHOW_FILE, async (_, oid: string, filepath: string): Promise<string | null> => {
    return gitMgr.showFile(oid, filepath)
  })

  /** 暴露 Git 工作区目录路径（给渲染进程计算 git 相对路径用） */
  ipcMain.handle(IPC_CHANNELS.GIT_GET_WORKDIR, async (): Promise<string> => {
    return gitMgr.getWorkDir()
  })

  /** 检查远端状态（只读，用于排查"A 端的改动是否还在远端"） */
  ipcMain.handle(IPC_CHANNELS.GIT_INSPECT_REMOTE, async (): Promise<{
    ok: boolean
    message: string
    localNoteCount: number
    localHeadNoteCount: number
    remoteNoteCount: number
  }> => {
    return gitMgr.inspectRemote()
  })

  // ============ AI ============
  const aiTools = [
    {
      type: 'function',
      function: {
        name: 'scan_dir',
        description: '扫描指定目录，返回目录下的文件和子目录列表',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '要扫描的目录绝对路径，不传则扫描笔记根目录' }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: '读取指定文件的完整内容。用于查看代码文件、配置文件等具体内容',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '要读取的文件绝对路径' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'grep_dir',
        description: '递归搜索目录下所有文本文件，按正则匹配行。用于批量查找代码中的接口、函数等',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '要搜索的目录绝对路径' },
            pattern: { type: 'string', description: '正则表达式，如 @GetMapping|@PostMapping' }
          },
          required: ['path', 'pattern']
        }
      }
    }
  ]

  const execAiTool = (name: string, args: any): string => {
    switch (name) {
      case 'scan_dir': {
        const dir = args.path || getFilesDir()
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n') || '(空目录)'
        } catch (e: any) {
          return `扫描失败: ${e.message}`
        }
      }
      case 'read_file': {
        try {
          if (!fs.existsSync(args.path)) return `文件不存在: ${args.path}`
          const content = fs.readFileSync(args.path, 'utf-8')
          if (content.length > 50000) return content.slice(0, 50000) + '\n...(内容过长已截断)'
          return content
        } catch (e: any) {
          return `读取失败: ${e.message}`
        }
      }
      case 'grep_dir': {
        try {
          const dir = args.path
          const pattern = new RegExp(args.pattern, 'i')
          const results: string[] = []
          const walk = (d: string) => {
            const entries = fs.readdirSync(d, { withFileTypes: true })
            for (const e of entries) {
              const fp = path.join(d, e.name)
              if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.git') {
                walk(fp)
              } else if (e.isFile() && results.length < 2000) {
                try {
                  const content = fs.readFileSync(fp, 'utf-8')
                  const lines = content.split('\n')
                  for (let i = 0; i < lines.length && results.length < 2000; i++) {
                    if (pattern.test(lines[i])) {
                      results.push(`${fp}:${i + 1}  ${lines[i].trim()}`)
                    }
                  }
                } catch {}
              }
            }
          }
          walk(dir)
          return results.join('\n') || '(无匹配)'
        } catch (e: any) {
          return `搜索失败: ${e.message}`
        }
      }
      default:
        return `未知工具: ${name}`
    }
  }

  const parseTextToolCalls = (text: string): Array<{ name: string; args: any }> => {
    const results: Array<{ name: string; args: any }> = []
    // 匹配 scan_dir("...")、read_file("...")、grep_dir("...", "...")
    // 支持双引号、单引号、反引号
    const re = /(scan_dir|read_file|grep_dir)\s*\(\s*["'`]([^"'`]*)["'`](?:\s*,\s*["'`]([^"'`]*)["'`])?\s*\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = m[1]
      const arg1 = m[2]
      const arg2 = m[3]
      if (name === 'grep_dir') {
        results.push({ name, args: { path: arg1, pattern: arg2 || '.' } })
      } else if (name === 'generate_image') {
        results.push({ name, args: { prompt: arg1 } })
      } else {
        results.push({ name, args: name === 'scan_dir' ? { path: arg1 } : { path: arg1 } })
      }
    }
    return results
  }

  const processAiImages = async (text: string): Promise<string> => {
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)|(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s"'<>]*)?)/gi
    let result = text
    const matches: Array<{ full: string; alt: string; url: string }> = []
    let m
    while ((m = imgRegex.exec(text)) !== null) {
      const url = m[2] || m[3]
      if (url.startsWith('http')) {
        matches.push({ full: m[0], alt: m[1] || 'image', url })
      }
    }
    if (matches.length === 0) return text

    // 存到 notes 目录（Git 跟踪），而不是 files 目录
    const notesDir = path.join(path.dirname(getFilesDir()), 'notes', 'ai-images')
    fs.mkdirSync(notesDir, { recursive: true })

    for (const match of matches) {
      try {
        const resp = await fetch(match.url)
        if (!resp.ok) continue
        const buffer = Buffer.from(await resp.arrayBuffer())
        const ext = match.url.split('.').pop()?.split('?')[0] || 'png'
        const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const filepath = path.join(notesDir, filename)
        fs.writeFileSync(filepath, buffer)
        // 用相对路径，Git 同步时其他环境也能加载
        result = result.replace(match.full, `![${match.alt}](${filename})`)
      } catch { /* skip failed images */ }
    }
    return result
  }

  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_, messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>): Promise<string | null> => {
    const settings = dbApi.getSettings()
    const ai = settings.ai
    if (!ai?.configured || !ai?.apiUrl || !ai?.apiKey) {
      throw new Error('AI 未配置，请在设置中配置 AI 模型')
    }

    try {
      let currentMessages = [...messages]
      const isAnthropic = ai.apiUrl.includes('/messages')
      let dispatcher: any = undefined
      if (ai.proxyUrl && ProxyAgent) {
        try { dispatcher = new ProxyAgent({ uri: ai.proxyUrl }) } catch {}
      }
      const fetchOpts: Record<string, any> = { dispatcher }

      for (let round = 0; round < 100; round++) {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 180000)
        let resp: Response
        try {
        if (isAnthropic) {
          const systemMsg = currentMessages.find(m => m.role === 'system')
          const chatMessages = currentMessages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
          resp = await fetch(ai.apiUrl, {
            ...fetchOpts,
            signal: ac.signal,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key': ai.apiKey
            },
            body: JSON.stringify({
              model: ai.model || 'deepseek-v4-flash',
              max_tokens: 8192,
              system: systemMsg?.content || '',
              messages: chatMessages
            })
          })
        } else {
          resp = await fetch(ai.apiUrl, {
            ...fetchOpts,
            signal: ac.signal,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ai.apiKey}`
            },
            body: JSON.stringify({
              model: ai.model || 'deepseek-v4-flash',
              messages: currentMessages,
              tools: aiTools,
              tool_choice: 'auto',
              stream: false
            })
          })
        }

        if (!resp.ok) {
          const err = await resp.text().catch(() => resp.statusText)
          throw new Error(`AI API 错误 (${resp.status}): ${err}`)
        }

        const data = await resp.json() as any

        if (isAnthropic) {
          // Anthropic 响应：可能包含 text + image content blocks
          const blocks = data?.content || []
          let text = ''
          for (const block of blocks) {
            if (block.type === 'text') text += block.text
            else if (block.type === 'image' && block.source?.data) {
              // base64 图片直接写到本地
              try {
                const filesDir = getFilesDir()
                const imgDir = path.join(filesDir, 'ai-images')
                fs.mkdirSync(imgDir, { recursive: true })
                const ext = block.source?.media_type?.split('/')[1] || 'png'
                const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
                const filepath = path.join(imgDir, filename)
                fs.writeFileSync(filepath, Buffer.from(block.source.data, 'base64'))
                text += `![image](${filepath.replace(/\\/g, '/')})\n`
              } catch {}
            }
          }
          if (!text) return null
          return await processAiImages(text)
        }

        const choice = data?.choices?.[0]
        const msg = choice?.message

        if (!msg) throw new Error('AI 返回数据异常')

        // 正式 function calling
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          currentMessages.push(msg)
          for (const tc of msg.tool_calls) {
            const fn = tc.function
            const result = execAiTool(fn.name, JSON.parse(fn.arguments || '{}'))
            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result
            })
          }
          continue
        }

        // 兜底：文本中提取工具调用
        const textCalls = parseTextToolCalls(msg.content || '')
        if (textCalls.length > 0) {
          currentMessages.push(msg)
          for (const tc of textCalls) {
            const result = execAiTool(tc.name, tc.args || {})
            currentMessages.push({
              role: 'tool',
              tool_call_id: `text_${tc.name}`,
              content: result
            })
          }
          continue
        }

        return await processAiImages(msg.content ?? '')
      } finally {
        clearTimeout(timer)
      }
      }

      return '(AI 工具调用轮次超限)'
    } catch (e: any) {
      const msg = e?.message || ''
      if (e?.name === 'AbortError' || msg.includes('aborted')) {
        throw new Error('AI 请求超时（3分钟），请检查网络连接或尝试简化提示词')
      }
      if (msg.includes('ECONNRESET')) {
        throw new Error('连接被服务器重置，请检查代理设置或网络稳定性')
      }
      if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
        throw new Error('请求超时，请检查网络连接或 API 地址')
      }
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        throw new Error('无法解析 API 域名，请确认 API 地址和网络连接')
      }
      if (msg.includes('ECONNREFUSED')) {
        throw new Error('连接被拒绝，请检查 API 地址和代理端口')
      }
      if (msg.includes('CERT_') || msg.includes('certificate') || msg.includes('SSL')) {
        throw new Error('SSL 证书验证失败，可能需要配置代理或忽略证书')
      }
      throw new Error(msg || 'AI 请求失败')
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_CONFIGURE, async (_, config: AppSettings['ai']): Promise<void> => {
    await dbApi.updateSettings({ ai: config } as any)
  })
}
