import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { IPC_CHANNELS, Notebook, Note, AppSettings, AssetUploadResult, PdfPageSize, getPdfPageSizeInfo, getPdfContentDimensions } from '../shared/types'
import { dbApi, getFilesDir, slugify, getUniqueFileName } from './db'
import { OssManager } from './oss/manager'
import { GitManager } from './git/manager'
import { encryptWithCachedPassword, hasCachedPassword } from './crypto'
import { exportNoteToWord } from './export/docx'
import { exportSpreadsheetToXlsx } from './export/xlsx'
import { addPdfOutline } from './export/pdfOutline'
import { resolveHeadingPages } from './export/pdfPages'
import * as sshMgr from './ssh/manager'

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

  /** 查询笔记本当前是否锁定（受密码保护且本进程未解锁） */
  ipcMain.handle(IPC_CHANNELS.NOTEBOOK_LOCK_STATUS, async (_, notebookId: string): Promise<boolean> => {
    return dbApi.isNotebookLocked(notebookId)
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
    // 受密码保护且尚未解锁：没有密码就无法加密，直接拒绝，
    // 否则会在加密笔记本里新建出一条明文笔记（打开时不会要求密码）。
    if (dbApi.isNotebookLocked(notebookId)) {
      throw new Error('NOTEBOOK_LOCKED: 该笔记本已加密，请先输入密码解锁后再新建笔记')
    }
    const result = dbApi.createNote(title, notebookId, parentId, icon, format, language, url)
    // 如果笔记本受密码保护且有缓存密码，自动加密新笔记
    if (result && hasCachedPassword(notebookId)) {
      const encrypted = encryptWithCachedPassword(result.content, notebookId)
      if (encrypted) {
        dbApi.updateNote(result.id, { content: encrypted } as any)
        dbApi.getNote(result.id)!.content = encrypted // force re-read
      }
    }
    gitMgr.exportMetadata()
    return dbApi.getNote(result.id)!
  })

  ipcMain.handle(IPC_CHANNELS.NOTE_UPDATE, async (_, id: string, updates: Partial<Note>): Promise<Note> => {
    // 加密笔记的内容写入防护：
    //  - 已解锁 → 写入前加密（encryptWithCachedPassword 内部还有 2 分钟写入宽容期，
    //    避免解锁刚过期时正在编辑的内容被静默丢弃；写入仍是同一密码加密，不会明文落盘）
    //  - 完全拿不到密码（未解锁 / 过期太久）→ 丢弃内容写入，
    //    防止陈旧自动保存把明文覆盖到加密内容上
    if (updates.content !== undefined) {
      const note = dbApi.getNote(id)
      if (note?.locked) {
        const encrypted = note.isEncrypted
          ? encryptWithCachedPassword(updates.content, note.notebookId)
          : null
        if (encrypted) updates.content = encrypted
        else delete updates.content
      } else if (note?.isEncrypted && hasCachedPassword(note.notebookId)) {
        const encrypted = encryptWithCachedPassword(updates.content, note.notebookId)
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

  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_PDF, async (_, payload: { title: string; html: string; watermark?: string; pageSize?: PdfPageSize; singlePage?: boolean }): Promise<boolean> => {
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

    // 根据用户选择的纸张尺寸计算页面参数
    const pageSizeInfo = getPdfPageSizeInfo(payload?.pageSize)
    const { contentW: CONTENT_W, contentH: CONTENT_H, pageW: PAGE_W } = getPdfContentDimensions(payload?.pageSize)
    const MARGIN_IN = 0.4
    // 长图模式底部留一点余量（px），避免舍入误差把末尾几行挤到下一页
    const SINGLE_PAGE_SLACK_PX = 12
    const singlePage = payload?.singlePage === true

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
      // 等字体 / 图片就绪、布局稳定后再量，避免把尚未加载完的内容漏算，导致长图仍被截断。
      // 所有等待都有超时兜底，避免个别加载不出来的资源把导出卡死。
      const measured: { headings: { text: string; top: number }[]; contentHeight: number } = await tempWin.webContents.executeJavaScript(`(async () => {
        const withTimeout = (p, ms) => Promise.race([p, new Promise(res => setTimeout(res, ms))])
        document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager' })
        if (document.fonts && document.fonts.ready) { try { await withTimeout(document.fonts.ready, 3000) } catch (e) {} }
        await withTimeout(Promise.all(Array.from(document.images || []).map(img => img.complete ? null : new Promise(res => {
          img.addEventListener('load', res, { once: true })
          img.addEventListener('error', res, { once: true })
        }))), 3000)
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
        const headings = []
        document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
          const text = (h.textContent || '').trim()
          if (!text) return
          headings.push({ text, top: h.getBoundingClientRect().top + (window.scrollY || 0) })
        })
        const de = document.documentElement
        const body = document.body
        let contentHeight = Math.max(de ? de.scrollHeight : 0, body ? body.scrollHeight : 0)
        // 兜底：绝对定位 / 浮动等 scrollHeight 可能统计不到，取所有元素的最大 bottom
        const all = document.querySelectorAll('body *')
        for (let i = 0; i < all.length; i++) {
          const r = all[i].getBoundingClientRect()
          if (r.height > 0 && r.bottom > contentHeight) contentHeight = r.bottom
        }
        return { headings, contentHeight: Math.ceil(contentHeight) }
      })()`)
      const { headings, contentHeight } = measured
      // 不分页：宽度沿用所选纸张宽度，高度取整篇内容高度，只输出一页、不截断
      const pageSize = singlePage
        ? { width: PAGE_W / 72, height: contentHeight / 96 + MARGIN_IN * 2 + SINGLE_PAGE_SLACK_PX / 96 }
        : pageSizeInfo.printPageSize
      const pdfBuffer = await tempWin.webContents.printToPDF({
        pageSize,
        printBackground: true,
        margins: { top: MARGIN_IN, bottom: MARGIN_IN, left: MARGIN_IN, right: MARGIN_IN }
      })
      // printToPDF 不会生成书签，用 pdf-lib 后处理注入目录（Outlines）树。
      // Chromium 按块分页，图片/表格在页底会被推到下一页，floor(top/CONTENT_H) 只是估算，
      // 先用 pdfjs 按文本精确解析标题所在页，未命中再回退到估算值（长图模式只有一页，直接回退 0）。
      const pdfBytes = new Uint8Array(pdfBuffer)
      const headingPages = await resolveHeadingPages(
        pdfBytes,
        headings.map(h => ({ text: h.text, fallbackPage: singlePage ? 0 : Math.floor(h.top / CONTENT_H) }))
      )
      const outlineItems = headings.map((h, i) => ({
        title: h.text,
        pageIndex: headingPages[i]
      }))
      const out = await addPdfOutline(pdfBytes, outlineItems)
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

  /** 导出智能表格笔记为真正的 .xlsx：渲染进程传表格 JSON，主进程用 exceljs 重建 */
  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT_XLSX, async (_, payload: {
    title: string
    content: string
  }): Promise<{ ok: boolean; message: string }> => {
    const owner = BrowserWindow.getFocusedWindow()
    if (!owner) return { ok: false, message: '没有活动窗口' }
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: `${payload?.title || '表格'}.xlsx`,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消' }
    try {
      const buffer = await exportSpreadsheetToXlsx(payload.title, payload.content)
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

  /**
   * 保存本地图片到笔记的 assets 目录（与笔记文件同级的 assets/ 文件夹）。
   * 返回相对路径（如 assets/img-xxx.png），供 HTML 内容引用。
   * noteFilePath: 笔记文件的绝对路径（如 /data/notes/MyNote/MyNote.md）
   * sourceImagePath: 用户本地图片的绝对路径
   */
  ipcMain.handle(IPC_CHANNELS.FILE_SAVE_ASSET, async (_, noteFilePath: string, sourceImagePath: string): Promise<string | null> => {
    const fs = require('node:fs')
    const pathMod = require('node:path')
    if (!fs.existsSync(sourceImagePath)) return null
    const noteDir = pathMod.dirname(noteFilePath)
    const assetsDir = pathMod.join(noteDir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    // 用时间戳+随机数生成唯一文件名，保留原扩展名
    const ext = pathMod.extname(sourceImagePath).toLowerCase() || '.png'
    const fileName = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${ext}`
    const destPath = pathMod.join(assetsDir, fileName)
    await fs.promises.copyFile(sourceImagePath, destPath)
    return `assets/${fileName}`
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

  // ============ SSH（AI 写作的远程文件工具） ============
  /** 待用户确认的 SSH 写操作：id → resolve */
  const pendingSshConfirms = new Map<string, (ok: boolean) => void>()

  /** 向渲染端发起写操作确认请求，等待用户点击（超时 5 分钟视为拒绝） */
  const requestSshConfirm = (
    event: Electron.IpcMainInvokeEvent,
    payload: { action: string; path: string; host?: string; detail?: string }
  ): Promise<boolean> => {
    const id = `ssh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return new Promise<boolean>((resolve) => {
      pendingSshConfirms.set(id, resolve)
      try {
        event.sender.send(IPC_CHANNELS.SSH_CONFIRM_REQUEST, { id, ...payload })
      } catch {
        pendingSshConfirms.delete(id)
        resolve(false)
        return
      }
      setTimeout(() => {
        if (pendingSshConfirms.has(id)) {
          pendingSshConfirms.delete(id)
          resolve(false)
        }
      }, 5 * 60 * 1000)
    })
  }

  ipcMain.on(IPC_CHANNELS.SSH_CONFIRM_RESPONSE, (_e, payload: { id: string; ok: boolean }) => {
    const resolve = payload?.id ? pendingSshConfirms.get(payload.id) : undefined
    if (resolve) {
      pendingSshConfirms.delete(payload.id)
      resolve(!!payload.ok)
    }
  })

  /** 从 AI 工具参数中提取 SSH 连接凭据；缺任一字段返回 null */
  const sshConnFromArgs = (args: any): import('./ssh/manager').SshConnection | null => {
    const host = typeof args?.host === 'string' ? args.host.trim() : ''
    const username = typeof args?.username === 'string' ? args.username.trim() : ''
    const password = typeof args?.password === 'string' ? args.password : ''
    if (!host || !username || !password) return null
    return { host, port: Number(args?.port) || 22, username, password }
  }

  /** SSH 工具定义：凭据由 AI 每次调用时传入（可访问多台服务器）。只读（list/read）自动执行，写（write）执行前需用户确认 */
  const sshTools = [
    {
      type: 'function',
      function: {
        name: 'ssh_list_dir',
        description: '列出远程服务器上指定目录的内容。凭据（host/username/password）每次调用时由你提供（只读，自动执行）',
        parameters: {
          type: 'object',
          properties: {
            host: { type: 'string', description: '远程服务器主机地址（IP 或域名）' },
            port: { type: 'number', description: 'SSH 端口，默认 22' },
            username: { type: 'string', description: 'SSH 登录用户名' },
            password: { type: 'string', description: 'SSH 登录密码' },
            path: { type: 'string', description: '远程目录绝对路径，如 /etc/nginx' }
          },
          required: ['host', 'username', 'password', 'path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_read_file',
        description: '读取远程服务器上指定文件的文本内容。凭据（host/username/password）每次调用时由你提供（只读，自动执行）',
        parameters: {
          type: 'object',
          properties: {
            host: { type: 'string', description: '远程服务器主机地址（IP 或域名）' },
            port: { type: 'number', description: 'SSH 端口，默认 22' },
            username: { type: 'string', description: 'SSH 登录用户名' },
            password: { type: 'string', description: 'SSH 登录密码' },
            path: { type: 'string', description: '远程文件绝对路径' }
          },
          required: ['host', 'username', 'password', 'path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_write_file',
        description: '把内容写入远程服务器上的文件（覆盖写入）。凭据（host/username/password）每次调用时由你提供。属于危险操作，执行前会先请求用户确认',
        parameters: {
          type: 'object',
          properties: {
            host: { type: 'string', description: '远程服务器主机地址（IP 或域名）' },
            port: { type: 'number', description: 'SSH 端口，默认 22' },
            username: { type: 'string', description: 'SSH 登录用户名' },
            password: { type: 'string', description: 'SSH 登录密码' },
            path: { type: 'string', description: '远程文件绝对路径' },
            content: { type: 'string', description: '要写入的完整文本内容' }
          },
          required: ['host', 'username', 'password', 'path', 'content']
        }
      }
    }
  ]

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

  const execAiTool = async (name: string, args: any, event: Electron.IpcMainInvokeEvent): Promise<string> => {
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
      // ===== SSH 远程文件（凭据由 AI 每次调用传入，支持多台服务器；只读自动执行）=====
      case 'ssh_list_dir':
      case 'ssh_read_file': {
        const conn = sshConnFromArgs(args)
        if (!conn) return 'SSH 参数缺失：请提供 host / username / password（AI 调用 ssh_* 工具时必须携带凭据）'
        try {
          if (name === 'ssh_list_dir') return await sshMgr.listDir(conn, args.path || '.')
          return await sshMgr.readFile(conn, args.path)
        } catch (e: any) {
          return `远程操作失败: ${e.message}`
        }
      }
      // ===== SSH 远程写入（危险操作，先请求用户确认）=====
      case 'ssh_write_file': {
        const conn = sshConnFromArgs(args)
        if (!conn) return 'SSH 参数缺失：请提供 host / username / password（AI 调用 ssh_* 工具时必须携带凭据）'
        const content: string = args.content ?? ''
        const preview = content.length > 400 ? content.slice(0, 400) + '\n…（已截断预览）' : content
        const ok = await requestSshConfirm(event, {
          action: '写入远程文件',
          path: args.path,
          host: conn.host,
          detail: preview
        })
        if (!ok) return '用户拒绝了该写操作，文件未修改。'
        try {
          await sshMgr.writeFile(conn, args.path, content)
          return `已写入远程文件: ${args.path}（${content.length} 字符）`
        } catch (e: any) {
          return `远程写入失败: ${e.message}`
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
    const re = /(scan_dir|read_file|grep_dir|ssh_list_dir|ssh_read_file|ssh_write_file)\s*\(\s*["'`]([^"'`]*)["'`](?:\s*,\s*["'`]([^"'`]*)["'`])?\s*\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = m[1]
      const arg1 = m[2]
      const arg2 = m[3]
      if (name === 'grep_dir') {
        results.push({ name, args: { path: arg1, pattern: arg2 || '.' } })
      } else if (name === 'ssh_write_file') {
        results.push({ name, args: { path: arg1, content: arg2 || '' } })
      } else if (name === 'generate_image') {
        results.push({ name, args: { prompt: arg1 } })
      } else {
        results.push({ name, args: { path: arg1 } })
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

  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (event, messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>): Promise<string | null> => {
    const settings = dbApi.getSettings()
    const ai = settings.ai
    if (!ai?.configured || !ai?.apiUrl || !ai?.apiKey) {
      throw new Error('AI 未配置，请在设置中配置 AI 模型')
    }

    // 推送进度给渲染端（AI_CHAT_PROGRESS 单向事件）
    const pushProgress = (text: string) => {
      try { event.sender.send(IPC_CHANNELS.AI_CHAT_PROGRESS, text) } catch {}
    }
    // 把工具调用转成一行进度文案（截断过长的路径/内容）
    const describeTool = (name: string, args: any): string => {
      const p = (s: string | undefined, max = 60) => {
        if (!s) return ''
        return s.length > max ? s.slice(0, max) + '…' : s
      }
      switch (name) {
        case 'scan_dir': return `📁 正在扫描目录 ${p(args.path)}`
        case 'read_file': return `📄 正在读取文件 ${p(args.path)}`
        case 'grep_dir': return `🔍 正在搜索 ${p(args.pattern)} @ ${p(args.path)}`
        case 'ssh_list_dir': return `🖥️ 正在列出远程目录 ${p(args.path)}`
        case 'ssh_read_file': return `🖥️ 正在读取远程文件 ${p(args.path)}`
        case 'ssh_write_file': return `🖥️ 正在写入远程文件 ${p(args.path)}`
        default: return `⚙️ 正在执行 ${name}`
      }
    }

    try {
      let currentMessages = [...messages]
      pushProgress('正在连接 AI 模型…')
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
          // MiMo API 不支持 tools/function calling，跳过
          const supportsTools = !ai.apiUrl.includes('xiaomimimo.com')
          // 本地工具 + SSH 远程文件工具（凭据由 AI 每次调用时传入）
          const activeTools = [...aiTools, ...sshTools]
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
              ...(supportsTools ? { tools: activeTools, tool_choice: 'auto' } : {}),
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
            let args: any = {}
            try { args = JSON.parse(fn.arguments || '{}') } catch {}
            pushProgress(describeTool(fn.name, args))
            const result = await execAiTool(fn.name, args, event)
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
            pushProgress(describeTool(tc.name, tc.args || {}))
            const result = await execAiTool(tc.name, tc.args || {}, event)
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

  // ============ AI 写作对话历史（仅存本地数据库，不参与 git 同步） ============
  ipcMain.handle(IPC_CHANNELS.AI_CONVERSATION_GET, async (_, noteId: string) => {
    return dbApi.getAiConversation(noteId)
  })

  ipcMain.handle(IPC_CHANNELS.AI_CONVERSATION_SET, async (_, noteId: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    dbApi.setAiConversation(noteId, history)
  })

  ipcMain.handle(IPC_CHANNELS.AI_CONVERSATION_CLEAR, async (_, noteId: string) => {
    dbApi.clearAiConversation(noteId)
  })
}
