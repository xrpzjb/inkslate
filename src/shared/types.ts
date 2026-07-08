/**
 */

export type NoteFormat = 'markdown' | 'html' | 'richtext' | 'code' | 'url' | 'file'

export type CodeLanguage =
  | 'plaintext' | 'javascript' | 'typescript' | 'python' | 'java'
  | 'go' | 'rust' | 'c' | 'cpp' | 'csharp' | 'ruby' | 'php'
  | 'html' | 'css' | 'json' | 'xml' | 'yaml' | 'markdown'
  | 'shell' | 'sql' | 'kotlin' | 'swift' | 'dart'

export interface Note {
  id: string
  title: string
  content: string
  format: NoteFormat
  language?: CodeLanguage // 代码笔记用的语言
  /** 网址笔记的 URL（format === 'url' 时必填） */
  url?: string
  /** 文件笔记：原始文件名（含扩展名，如 "报告.docx"） */
  fileName?: string
  /** 文件笔记：app data 里的绝对路径 */
  filePath?: string
  /** 文件笔记：扩展名（小写无点，如 "pdf"） */
  fileExt?: string
  /** 文件笔记：文件字节数 */
  fileSize?: number
  notebookId: string
  parentId: string | null
  path: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
  /** 删除时间戳（毫秒），仅在 isDeleted=true 时有意义 */
  deletedAt?: number
  icon?: string
  /** 用户手动拖动排序的稳定顺序（毫秒时间戳或自定义数字） */
  sortOrder?: number
}

export interface Notebook {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  icon?: string
  isDeleted: boolean
  /** 删除时间戳（毫秒），仅在 isDeleted=true 时有意义 */
  deletedAt?: number
  /** 用户手动拖动排序的稳定顺序 */
  sortOrder?: number
}

export interface NoteTreeNode {
  id: string
  name: string
  type: 'notebook' | 'note'
  parentId: string | null
  children: NoteTreeNode[]
  icon?: string
  updatedAt?: number
  createdAt?: number
  sortOrder?: number
  isExpanded?: boolean
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto' | 'solarized' | 'cyberpunk' | 'dracula' | 'dune' | 'monet' | 'newspaper' | 'forest' | 'sunset' | 'nordic' | 'pastoral'
  fontSize: number
  layout: {
    sidebarWidth: number
    sidebarVisible: boolean
    previewVisible: boolean
    editorVisible: boolean
  }
  /** 上次打开的笔记 id，启动时自动选中（不存在则忽略） */
  lastSelectedNoteId?: string
  /** 用户手动展开的笔记本 id 集合；启动时恢复 */
  expandedNotebooks?: string[]
  oss: {
    provider: 'aliyun' | 'tencent' | 'aws' | 'minio'
    endpoint?: string
    bucket?: string
    region?: string
    accessKeyId?: string
    encryptedSecret?: string
    prefix?: string
    configured: boolean
  }
  autoSync: boolean
  /** 回收站设置 */
  recycleBin: {
    /** 保留天数；0 表示不自动清理 */
    retentionDays: number
    /** 启动时自动清理过期项 */
    autoCleanup: boolean
  }
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'success' | 'error' | 'offline' | 'unconfigured'
  message?: string
  lastSyncAt?: number
  pendingFiles?: number
}

export interface AssetUploadResult {
  url: string
  hash: string
  size: number
}

// IPC 频道常量
export const IPC_CHANNELS = {
  // 笔记本
  NOTEBOOK_LIST: 'notebook:list',
  NOTEBOOK_CREATE: 'notebook:create',
  NOTEBOOK_RENAME: 'notebook:rename',
  NOTEBOOK_DELETE: 'notebook:delete',
  NOTEBOOK_MOVE: 'notebook:move',
  NOTEBOOK_REORDER: 'notebook:reorder',

  // 回收站 - 笔记本
  NOTEBOOK_LIST_DELETED: 'notebook:list-deleted',
  NOTEBOOK_RESTORE: 'notebook:restore',
  NOTEBOOK_PURGE: 'notebook:purge',

  // 绗旇
  NOTE_LIST: 'note:list',
  NOTE_GET: 'note:get',
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_MOVE: 'note:move',
  NOTE_SEARCH: 'note:search',
  NOTE_REORDER: 'note:reorder',

  // 回收站 - 笔记
  NOTE_LIST_DELETED: 'note:list-deleted',
  NOTE_RESTORE: 'note:restore',
  NOTE_PURGE: 'note:purge',

  // 回收站 - 通用
  RECYCLE_BIN_PURGE_EXPIRED: 'recycle-bin:purge-expired',
  RECYCLE_BIN_EMPTY: 'recycle-bin:empty',

  // 璁剧疆
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // OSS
  OSS_CONFIGURE: 'oss:configure',
  OSS_TEST: 'oss:test',
  OSS_UPLOAD: 'oss:upload',
  OSS_SYNC_PUSH: 'oss:sync:push',
  OSS_SYNC_PULL: 'oss:sync:pull',
  OSS_STATUS: 'oss:status',

  // 涓婚
  THEME_CHANGE: 'theme:change',

  // 鏂囦欢
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_EXPORT: 'file:export',
  FILE_EXPORT_PDF: 'file:export-pdf',
  FILE_WRITE: 'file:write',
  FILE_READ_BASE64: 'file:read-base64',

  // 鑿滃崟浜嬩欢
  MENU_NEW_NOTE: 'menu:new-note',
  MENU_NEW_NOTEBOOK: 'menu:new-notebook',
  MENU_SAVE: 'menu:save',
  MENU_TOGGLE_SIDEBAR: 'menu:toggle-sidebar',
  MENU_TOGGLE_PREVIEW: 'menu:toggle-preview',

  // 回收站菜单事件
  MENU_OPEN_RECYCLE_BIN: 'menu:open-recycle-bin',
  MENU_RECYCLE_BIN_SETTINGS: 'menu:recycle-bin-settings',

  // 文件笔记
  FILE_NOTE_CREATE: 'file-note:create',
  FILE_NOTE_REPLACE: 'file-note:replace',
  FILE_NOTE_SAVE_AS: 'file-note:save-as',
  FILE_NOTE_READ: 'file-note:read'
} as const
