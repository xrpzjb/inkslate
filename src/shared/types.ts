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
  language?: CodeLanguage
  url?: string
  fileName?: string
  filePath?: string
  fileExt?: string
  fileSize?: number
  notebookId: string
  parentId: string | null
  path: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
  deletedAt?: number
  icon?: string
  sortOrder?: number
  isEncrypted?: boolean
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

export interface GitCommitEntry {
  oid: string
  message: string
  author: { name: string; email: string; timestamp: number }
  committer: { name: string; email: string; timestamp: number }
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto' | 'solarized' | 'cyberpunk' | 'dracula' | 'dune' | 'monet' | 'newspaper' | 'forest' | 'sunset' | 'nordic' | 'pastoral'
  /** 编辑器独立暗色模式（仅在 light 默认主题下生效）：true 强制编辑器用 dark 配色 */
  editorDark?: boolean
  /** 全局 UI 字体选项 id（对应 SettingsDialog FONT_OPTIONS） */
  fontFamily?: 'system' | 'system-nano' | 'jetbrains' | 'cascadia' | 'jetbrains-bold' | 'sourcecode' | 'sourcehan'
  fontSize: number
  /** 编辑区域字体选项 id，不设置则跟随全局 fontFamily */
  editorFontFamily?: 'system' | 'system-nano' | 'jetbrains' | 'cascadia' | 'jetbrains-bold' | 'sourcecode' | 'sourcehan'
  /** 树状图字体选项 id，不设置则跟随全局 fontFamily */
  treeFontFamily?: 'system' | 'system-nano' | 'jetbrains' | 'cascadia' | 'jetbrains-bold' | 'sourcecode' | 'sourcehan'
  /** 树状图字体大小（px） */
  treeFontSize?: number
  /** 树状图显示子级数量 */
  showTreeCount?: boolean
  layout: {
    sidebarWidth: number
    sidebarVisible: boolean
    previewVisible: boolean
    editorVisible: boolean
    /** 当前打开的标签页笔记 id 列表（按打开顺序）；启动时恢复 */
    openTabs?: string[]
    /** 当前激活的标签 id；启动时恢复（不在 openTabs 时取 openTabs 第一个） */
    activeTabId?: string | null
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
  /** Git 同步设置（2026-07-08 起用 Git 仓库替代 OSS 同步） */
  gitSync: {
    /** 仓库 HTTPS URL，如 https://github.com/user/repo.git */
    repoUrl: string
    /** 分支名，默认 main */
    branch: string
    /** Git author 名字（commit 作者署名，跟登录账号无关） */
    authorName: string
    /** Git author 邮箱 */
    authorEmail: string
    /** 认证用户名（登录账号，跟 authorName 分开） */
    username: string
    /** 密码或 Personal Access Token，用 safeStorage 加密后存 encryptedToken */
    encryptedToken?: string
    /** 是否已配置完成（URL + username + 密码 都填了） */
    configured: boolean
    /** 工作区是否已 git init / clone */
    initialized: boolean
    /** 最近一次同步（push/pull 任一成功）的时间戳，毫秒 */
    lastSyncAt?: number
  }
  /** AI 大模型配置 */
  ai?: {
    /** 提供商 */
    provider: 'openai' | 'deepseek' | 'qwen' | 'glm' | 'ernie' | 'moonshot' | 'custom'
    /** API 地址 */
    apiUrl: string
    /** 模型名 */
    model: string
    /** API Key */
    apiKey: string
    /** 是否已配置 */
    configured: boolean
    /** 代理地址（可选，如 http://127.0.0.1:7890） */
    proxyUrl: string
  }
}

export interface SyncStatus {
  state: 'idle' | 'pending' | 'syncing' | 'success' | 'error' | 'offline' | 'unconfigured'
  message?: string
  detail?: string  // 错误详情，点击错误状态时显示
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
  NOTEBOOK_UPDATE: 'notebook:update',

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
  FILE_NOTE_READ: 'file-note:read',

  // Git 同步
  GIT_CONFIGURE: 'git:configure',
  GIT_STATUS: 'git:status',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_SYNC: 'git:sync',
  GIT_IS_CONFIGURED: 'git:is-configured',
  GIT_INIT: 'git:init',
  GIT_CLONE: 'git:clone',
  GIT_CLONE_CHECK: 'git:clone-check',
  GIT_LOG: 'git:log',
  GIT_SHOW_FILE: 'git:show-file',
  GIT_GET_WORKDIR: 'git:get-workdir',
  // 笔记加密
  NOTEBOOK_SET_PASSWORD: 'notebook:set-password',
  NOTEBOOK_REMOVE_PASSWORD: 'notebook:remove-password',
  NOTEBOOK_UNLOCK: 'notebook:unlock',
  // AI
  AI_CHAT: 'ai:chat',
  AI_CONFIGURE: 'ai:configure'
} as const
