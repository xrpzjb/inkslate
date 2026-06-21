import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, Notebook, Note, AppSettings, AssetUploadResult, SyncStatus } from '../shared/types'

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
    create: (title: string, notebookId: string, parentId: string | null, icon?: string, format?: 'markdown' | 'html' | 'richtext' | 'code', language?: string): Promise<Note> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_CREATE, title, notebookId, parentId, icon, format ?? 'markdown', language),
    update: (id: string, updates: Partial<Note>): Promise<Note> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_UPDATE, id, updates),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_DELETE, id),
    move: (id: string, newParentId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_MOVE, id, newParentId),
    search: (keyword: string): Promise<Note[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_SEARCH, keyword),
    // 回收站相关
    listDeleted: (): Promise<Note[]> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_LIST_DELETED),
    restore: (id: string): Promise<{ restoredNotebooks: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_RESTORE, id),
    purge: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_PURGE, id)
  },

  recycleBin: {
    purgeExpired: (): Promise<{ notes: number; notebooks: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECYCLE_BIN_PURGE_EXPIRED),
    empty: (): Promise<{ notes: number; notebooks: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECYCLE_BIN_EMPTY)
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
    openDialog: (options: Electron.OpenDialogOptions): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG, options),
    export: (format: 'html' | 'md'): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT, format),
    exportPdf: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPORT_PDF),
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
    ipcRenderer.on('menu:oss-settings', () => callback('oss-settings'))
    ipcRenderer.on('menu:show-shortcuts', () => callback('show-shortcuts'))
    ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_RECYCLE_BIN, () => callback('open-recycle-bin'))
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
      ipcRenderer.removeAllListeners('menu:oss-settings')
      ipcRenderer.removeAllListeners('menu:show-shortcuts')
      ipcRenderer.removeAllListeners(IPC_CHANNELS.MENU_OPEN_RECYCLE_BIN)
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
