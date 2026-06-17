/**
 */

export type NoteFormat = 'markdown' | 'html' | 'richtext' | 'code'

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
  notebookId: string
  parentId: string | null
  path: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
  icon?: string
}

export interface Notebook {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  icon?: string
  isDeleted: boolean
}

export interface NoteTreeNode {
  id: string
  name: string
  type: 'notebook' | 'note'
  parentId: string | null
  children: NoteTreeNode[]
  icon?: string
  updatedAt?: number
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

  // 绗旇
  NOTE_LIST: 'note:list',
  NOTE_GET: 'note:get',
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  NOTE_MOVE: 'note:move',
  NOTE_SEARCH: 'note:search',

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
  MENU_TOGGLE_PREVIEW: 'menu:toggle-preview'
} as const
