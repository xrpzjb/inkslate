import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, Notebook, Note, AppSettings, AssetUploadResult, SyncStatus, FlashThought } from '../shared/types'

/** preload 桥接：把 IPC 调用暴露给渲染进程 */

const api = {
  notebooks: {
    list: (): Promise<Notebook[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_LIST),
    create: (name: string, parentId: string | null, icon?: string): Promise<Notebook> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_CREATE, name, parentId, icon),
    rename: (id: string, newName: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_RENAME, id, newName),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_DELETE, id),
    move: (id: string, newParentId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_MOVE, id, newParentId),
    reorder: (parentId: string | null, orderedIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_REORDER, parentId, orderedIds),
    update: (id: string, updates: { name?: string; icon?: string | null; parentId?: string | null }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_UPDATE, id, updates),
    // 回收站相关
    listDeleted: (): Promise<Notebook[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_LIST_DELETED),
    restore: (id: string): Promise<{ restoredNotebooks: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_RESTORE, id),
    purge: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_PURGE, id)
  },

  notes: {
    list: (notebookId?: string): Promise<Note[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_LIST, notebookId),
    get: (id: string): Promise<Note | null> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_GET, id),
    create: (title: string, notebookId: string, parentId: string | null, icon?: string, format?: 'markdown' | 'html' | 'richtext' | 'code' | 'url' | 'file', language?: string, url?: string): Promise<Note> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_CREATE, title, notebookId, parentId, icon, format ?? 'markdown', language, url),
    update: (id: string, updates: Partial<Note>): Promise<Note> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_UPDATE, id, updates),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_DELETE, id),
    move: (id: string, newParentId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_MOVE, id, newParentId),
    reorder: (notebookId: string, orderedIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_REORDER, notebookId, orderedIds),
    search: (keyword: string): Promise<Note[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_SEARCH, keyword),
    // 回收站相关
    listDeleted: (): Promise<Note[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_LIST_DELETED),
    restore: (id: string): Promise<{ restoredNotebooks: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_RESTORE, id),
    purge: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_PURGE, id)
  },

  /** 闪念 */
  flashThoughts: {
    list: (): Promise<FlashThought[]> => ipcRenderer.invoke(IPC_CHANNELS.FLASH_THOUGHTS_LIST),
    create: (content: string): Promise<FlashThought> => ipcRenderer.invoke(IPC_CHANNELS.FLASH_THOUGHTS_CREATE, content),
    update: (id: string, content: string): Promise<FlashThought> => ipcRenderer.invoke(IPC_CHANNELS.FLASH_THOUGHTS_UPDATE, id, content),
    setDone: (id: string, done: boolean): Promise<FlashThought> => ipcRenderer.invoke(IPC_CHANNELS.FLASH_THOUGHTS_SET_DONE, id, done),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.FLASH_THOUGHTS_DELETE, id)
  },

  /** 文件笔记：源文件复制/替换/另存/读取 */
  fileNote: {
    /** 创建文件笔记后，把源文件复制到 app data 并写库 */
    create: (noteId: string, sourcePath: string): Promise<{ filePath: string; fileName: string; fileSize: number; fileExt: string } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_NOTE_CREATE, noteId, sourcePath),
    /** 替换文件笔记的源文件 */
    replace: (noteId: string, sourcePath: string): Promise<{ filePath: string; fileName: string; fileSize: number; fileExt: string } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_NOTE_REPLACE, noteId, sourcePath),
    /** 另存为：弹保存框，复制源文件到用户选的位置 */
    saveAs: (noteId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_NOTE_SAVE_AS, noteId),
    /** 读取源文件内容为 Uint8Array，给预览组件用 */
    read: (noteId: string): Promise<Uint8Array | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_NOTE_READ, noteId)
  },

  /** Git 同步 */
  git: {
    /** 保存配置（密码/token 加密存） */
    configure: (payload: { repoUrl: string; branch: string; authorName: string; authorEmail: string; username: string; token: string }): Promise<any> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CONFIGURE, payload),
    /** 工作区变更状态 */
    status: (): Promise<{ filepath: string; status: string }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS),
    /** git init + 初始 commit */
    init: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT),
    /** clone 远端仓库 */
    clone: (url: string): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CLONE, url),
    /** clone 前检查本地是否有真实数据 */
    cloneCheck: (): Promise<{ hasRealData: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CLONE_CHECK),
    /** push（可选 autoCommit 先提交未保存变更） */
    push: (autoCommit?: boolean): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, autoCommit ?? true),
    /** pull = fetch + merge（冲突自动以远端为准，本地版本保留为「原名-冲突N」冲突副本笔记） */
    pull: (): Promise<{ ok: boolean; message: string; updated: boolean; reconciled: boolean; conflicts: number; conflictTitles: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL),
    /**
     * 一键同步：pull → commit → push
     * 适合「我在 A 端改了，现在在 B 端」：先拉再推避免覆盖他人改动
     */
    sync: (): Promise<{
      ok: boolean
      message: string
      phase?: 'commit' | 'pull' | 'push'
      phases?: { commit: 'ok' | 'skipped' | 'failed'; pull: 'ok' | 'up-to-date' | 'failed'; push: 'ok' | 'up-to-date' | 'failed' }
      pulled?: boolean
      pushed?: boolean
      conflicts?: number
      conflictTitles?: string[]
    }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SYNC),
    /** 是否已配置 + 是否已初始化 */
    isConfigured: (): Promise<{ configured: boolean; initialized: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_IS_CONFIGURED),
    /** 提交历史（可指定 filepath） */
    log: (filepath?: string, maxCount?: number): Promise<any[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, filepath, maxCount),
    /** 读指定 commit 的文件内容（文本） */
    showFile: (oid: string, filepath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SHOW_FILE, oid, filepath),
    /** 检查远端状态（只读）：对比本地 DB / 本地 HEAD / 远端 HEAD 的笔记数 */
    inspectRemote: (): Promise<{ ok: boolean; message: string; localNoteCount: number; localHeadNoteCount: number; remoteNoteCount: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_INSPECT_REMOTE)
  },

  /** AI 大模型 */
  ai: {
    /** 发送对话消息，返回 AI 回复 */
    chat: (messages: Array<{ role: string; content: string }>): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, messages),
    /** 保存 AI 配置 */
    configure: (config: any): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIGURE, config),
    /** 读取某笔记的 AI 对话历史（仅本地，不同步 git） */
    getConversation: (noteId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CONVERSATION_GET, noteId),
    /** 保存某笔记的 AI 对话历史（整段覆盖，仅本地） */
    setConversation: (noteId: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CONVERSATION_SET, noteId, history),
    /** 清空某笔记的 AI 对话历史（仅本地） */
    clearConversation: (noteId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CONVERSATION_CLEAR, noteId),
    /** 订阅 AI 处理进度（主进程推送的实时进度文案），返回取消订阅函数 */
    onProgress: (cb: (text: string) => void): (() => void) => {
      const listener = (_: any, text: string) => cb(text)
      ipcRenderer.on(IPC_CHANNELS.AI_CHAT_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CHAT_PROGRESS, listener)
    }
  },

  recycleBin: {
    purgeExpired: (): Promise<{ notes: number; notebooks: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECYCLE_BIN_PURGE_EXPIRED),
    empty: (): Promise<{ notes: number; notebooks: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECYCLE_BIN_EMPTY)
  },

  /** Git 工作区路径（用于渲染进程将 note.path 转换为 git 相对路径） */
  getWorkDir: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_WORKDIR),

  /** 笔记本密码 */
  notebookPassword: {
    set: (notebookId: string, password: string): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_SET_PASSWORD, notebookId, password),
    remove: (notebookId: string, password: string): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_REMOVE_PASSWORD, notebookId, password),
    unlock: (notebookId: string, password: string): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTEBOOK_UNLOCK, notebookId, password)
  },

  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (settings: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings)
  },

  // OSS
  oss: {
    configure: (config: AppSettings['oss']): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_CONFIGURE, config),
    test: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_TEST),
    upload: (buffer: ArrayBuffer, filename: string, contentType: string): Promise<AssetUploadResult> => {
      // 把 ArrayBuffer 转成 Buffer 传给主进程
      const buf = Buffer.from(buffer)
      return ipcRenderer.invoke(IPC_CHANNELS.OSS_UPLOAD, buf, filename, contentType)
    },
    push: (): Promise<{ ok: boolean; uploaded: number; failed: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_SYNC_PUSH),
    pull: (): Promise<{ ok: boolean; downloaded: number; conflicts: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_SYNC_PULL)
  },

  file: {
    openDialog: (options: Electron.OpenDialogOptions): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG, options),
    readText: (filePath: string): Promise<string | null> => {
      try {
        const fs = require('node:fs') as typeof import('node:fs')
        return Promise.resolve(fs.readFileSync(filePath, 'utf-8'))
      } catch {
        return Promise.resolve(null)
      }
    },
    export: (format: 'html' | 'md'): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT, format),
    exportPdf: (payload: { title: string; html: string; watermark?: string }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_PDF, payload),
    exportDocx: (payload: { title: string; content: string; format: Note['format']; basePath?: string; language?: string }): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_DOCX, payload),
    exportXlsx: (payload: { title: string; content: string }): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_XLSX, payload),
    write: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, content),
    readAsBase64: (filePath: string): Promise<{ base64: string; mime: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_BASE64, filePath)
  },

  getMenuData: (): Promise<any[]> => ipcRenderer.invoke('menu:get-data'),
  /** TitleBar 组件点菜单项时调，把点击派发给主进程的 handleMenuClick */
  clickMenu: (id: string, arg?: any): void => {
    ipcRenderer.send('menu:clicked', id, arg)
  },
  onMenuClicked: (id: string, arg: any): void => {
    ipcRenderer.send('menu:clicked', id, arg)
  },
  notifyThemeChanged: (themeId: string): void => {
    ipcRenderer.send('menu:theme-changed', themeId)
  },

  onMenu: (callback: (event: string, ...args: unknown[]) => void): (() => void) => {
    const handler = (_e: unknown, event: string, ...args: unknown[]) => callback(event, ...args)
    ipcRenderer.on(IPC_CHANNELS.MENU_NEW_NOTE, () => callback('new-note'))
    ipcRenderer.on('menu:new-note', (_e, format) => callback('new-note', format))
    ipcRenderer.on(IPC_CHANNELS.MENU_NEW_NOTEBOOK, () => callback('new-notebook'))
    ipcRenderer.on(IPC_CHANNELS.MENU_SAVE, () => callback('save'))
    ipcRenderer.on(IPC_CHANNELS.MENU_TOGGLE_SIDEBAR, () => callback('toggle-sidebar'))
    ipcRenderer.on(IPC_CHANNELS.MENU_TOGGLE_PREVIEW, () => callback('toggle-preview'))
    ipcRenderer.on(IPC_CHANNELS.THEME_CHANGE, (_e, theme) => callback('theme-change', theme))
    ipcRenderer.on('menu:find', () => callback('find'))
    ipcRenderer.on('menu:git-settings', () => callback('git-settings'))
    ipcRenderer.on('menu:git-push', () => callback('git-push'))
    ipcRenderer.on('menu:git-pull', () => callback('git-pull'))
    ipcRenderer.on('menu:git-sync', () => callback('git-sync'))
    ipcRenderer.on('menu:show-shortcuts', () => callback('show-shortcuts'))
    ipcRenderer.on('menu:show-settings', () => callback('show-settings'))
    ipcRenderer.on('menu:show-about', () => callback('show-about'))
    ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_RECYCLE_BIN, () => callback('open-recycle-bin'))
    ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_FLASH_THOUGHTS, () => callback('open-flash-thoughts'))
    ipcRenderer.on(IPC_CHANNELS.MENU_RECYCLE_BIN_SETTINGS, () => callback('recycle-bin-settings'))
    ipcRenderer.on('menu:rebuild', () => callback('menu-rebuild'))
    ipcRenderer.on('menu:reload', () => callback('reload'))
    ipcRenderer.on('menu:devtools', () => callback('devtools'))
    ipcRenderer.on('menu:zoom', (_e, dir) => callback('zoom', dir))
    ipcRenderer.on('menu:fullscreen', () => callback('fullscreen'))
    ipcRenderer.on('menu:edit', (_e, op) => callback('edit', op))
    ipcRenderer.on('menu:toggle-editor', () => callback('toggle-editor'))
    return () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_NEW_NOTE)
      ipcRenderer.removeAllListeners('menu:new-note')
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_NEW_NOTEBOOK)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_SAVE)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_TOGGLE_SIDEBAR)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_TOGGLE_PREVIEW)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.THEME_CHANGE)
      ipcRenderer.removeAllListeners('menu:find')
      ipcRenderer.removeAllListeners('menu:git-settings')
      ipcRenderer.removeAllListeners('menu:git-push')
      ipcRenderer.removeAllListeners('menu:git-pull')
      ipcRenderer.removeAllListeners('menu:git-sync')
      ipcRenderer.removeAllListeners('menu:show-shortcuts')
      ipcRenderer.removeAllListeners('menu:show-settings')
      ipcRenderer.removeAllListeners('menu:show-about')
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_OPEN_RECYCLE_BIN)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_OPEN_FLASH_THOUGHTS)
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_RECYCLE_BIN_SETTINGS)
      ipcRenderer.removeAllListeners('menu:rebuild')
      ipcRenderer.removeAllListeners('menu:reload')
      ipcRenderer.removeAllListeners('menu:devtools')
      ipcRenderer.removeAllListeners('menu:zoom')
      ipcRenderer.removeAllListeners('menu:fullscreen')
      ipcRenderer.removeAllListeners('menu:edit')
      ipcRenderer.removeAllListeners('menu:toggle-editor')
    }
  }
}

contextBridge.exposeInMainWorld('inkslateApi', api)

export type InkslateApi = typeof api
declare global {
  interface Window {
    inkslateApi: InkslateApi
  }
}
