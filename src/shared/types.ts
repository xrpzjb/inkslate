/**
 */

export type NoteFormat = 'markdown' | 'html' | 'richtext' | 'code' | 'url' | 'file' | 'spreadsheet'

/**
 * 密码解锁有效期（毫秒）：解锁后经过这段时间需要重新输入密码。
 * 主进程按它判定"是否仍处于解锁状态"，渲染端按它在到期瞬间把界面同步回锁定态。
 */
export const UNLOCK_TTL_MS = 10 * 60 * 1000

/** 智能表格笔记的内部数据格式（对应 x-data-spreadsheet 的 getData() 输出） */
export interface SpreadsheetSheetData {
  name?: string
  styles?: Array<{ bgcolor?: string }>
  merges?: string[]
  rows?: Record<number, { cells?: Record<number, { text?: string; style?: number }> }>
  cols?: Record<number, { width?: number }>
}
export type SpreadsheetData = SpreadsheetSheetData[]

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
  /**
   * 当前是否处于"锁定"状态（属于受密码保护且本进程尚未解锁的笔记本，或内容仍是密文）。
   * 由主进程计算：locked=true 时 content 为密文，界面必须遮住并提示输入密码。
   */
  locked?: boolean
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
  /** 是否受密码保护（自身或祖先设置了密码） */
  passwordProtected?: boolean
  /** 当前是否处于锁定状态（受保护且本进程尚未解锁），界面据此提示需要输入密码 */
  locked?: boolean
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
  /** 笔记本是否受密码保护（自身或祖先设置了密码） */
  passwordProtected?: boolean
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
  /** 编辑器自动换行（true 软换行，false 默认横向滚动） */
  wordWrap?: boolean
  /** 全局 UI 字体选项 id（对应 SettingsDialog FONT_OPTIONS） */
  fontFamily?: 'system' | 'system-nano' | 'songti' | 'sourcehan-serif' | 'jetbrains' | 'cascadia' | 'jetbrains-bold' | 'sourcecode' | 'sourcehan'
  fontSize: number
  /** 编辑区域字体选项 id；空字符串或不设置则用编辑器默认字体（源码编辑器等宽 / 富文本跟随全局 fontFamily） */
  editorFontFamily?: 'system' | 'system-nano' | 'songti' | 'sourcehan-serif' | 'jetbrains' | 'cascadia' | 'jetbrains-bold' | 'sourcecode' | 'sourcehan' | ''
  /** 树状图字体选项 id，不设置则跟随全局 fontFamily */
  treeFontFamily?: 'system' | 'system-nano' | 'songti' | 'sourcehan-serif' | 'jetbrains' | 'cascadia' | 'jetbrains-bold' | 'sourcecode' | 'sourcehan'
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
    /**
     * 单次 Git 请求的超时时间（分钟）。网速特别慢时可以调大，
     * 默认 30 分钟。范围 1-360。
     */
    requestTimeoutMinutes?: number
    /**
     * 连接空闲多久（秒）没有收到数据就判定断流并重试，0 = 关闭该判定。
     * 默认 120 秒：这样"连上但卡住"能很快被发现，不用干等到整体超时。范围 0-3600。
     */
    idleTimeoutSeconds?: number
    /**
     * 网络类失败的最大尝试次数（含首次），默认 5 次。范围 1-20。
     * 请求级按此重试；整体操作（push/fetch/clone）另按此值重试，最多 3 次。
     */
    maxRetries?: number
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

export interface FlashThought {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  /** 是否已完成（打勾后置灰并沉底） */
  done: boolean
  /** 完成时间戳，未完成时为 undefined */
  doneAt?: number
  /** 是否已删除（软删除墓碑，仅同步内部使用，UI 不展示） */
  isDeleted?: boolean
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
  FILE_EXPORT_DOCX: 'file:export-docx',
  FILE_EXPORT_XLSX: 'file:export-xlsx',
  FILE_WRITE: 'file:write',
  FILE_READ_BASE64: 'file:read-base64',
  FILE_SAVE_ASSET: 'file:save-asset',

  // 鑿滃崟浜嬩欢
  MENU_NEW_NOTE: 'menu:new-note',
  MENU_NEW_NOTEBOOK: 'menu:new-notebook',
  MENU_SAVE: 'menu:save',
  MENU_TOGGLE_SIDEBAR: 'menu:toggle-sidebar',
  MENU_TOGGLE_PREVIEW: 'menu:toggle-preview',

  // 回收站菜单事件
  MENU_OPEN_RECYCLE_BIN: 'menu:open-recycle-bin',
  MENU_RECYCLE_BIN_SETTINGS: 'menu:recycle-bin-settings',

  // 闪念菜单事件
  MENU_OPEN_FLASH_THOUGHTS: 'menu:open-flash-thoughts',

  // 闪念
  FLASH_THOUGHTS_LIST: 'flash-thoughts:list',
  FLASH_THOUGHTS_CREATE: 'flash-thoughts:create',
  FLASH_THOUGHTS_UPDATE: 'flash-thoughts:update',
  FLASH_THOUGHTS_DELETE: 'flash-thoughts:delete',
  FLASH_THOUGHTS_SET_DONE: 'flash-thoughts:set-done',

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
  GIT_INSPECT_REMOTE: 'git:inspect-remote',
  // 笔记加密
  NOTEBOOK_SET_PASSWORD: 'notebook:set-password',
  NOTEBOOK_REMOVE_PASSWORD: 'notebook:remove-password',
  NOTEBOOK_UNLOCK: 'notebook:unlock',
  /** 查询笔记本（含祖先/子树）当前是否处于锁定状态 */
  NOTEBOOK_LOCK_STATUS: 'notebook:lock-status',
  // AI
  AI_CHAT: 'ai:chat',
  AI_CONFIGURE: 'ai:configure',
  /** 主进程向渲染端推送 AI 处理进度（主进程 → 渲染端，单向事件） */
  AI_CHAT_PROGRESS: 'ai:chat:progress',
  AI_CONVERSATION_GET: 'ai:conversation:get',
  AI_CONVERSATION_SET: 'ai:conversation:set',
  AI_CONVERSATION_CLEAR: 'ai:conversation:clear',
  // SSH 远程文件（供 AI 写作的 SSH 工具使用）
  /** 主进程向渲染端发起写操作确认请求（主进程 → 渲染端，单向事件） */
  SSH_CONFIRM_REQUEST: 'ssh:confirm:request',
  /** 渲染端回传确认结果（渲染端 → 主进程，单向事件） */
  SSH_CONFIRM_RESPONSE: 'ssh:confirm:response'
} as const

/** PDF 导出纸张尺寸 */
export type PdfPageSize = 'A4' | 'A3' | 'A5' | 'Letter' | '1024' | '1440' | '1920'

export interface PdfPageSizeInfo {
  key: PdfPageSize
  label: string
  /** 纸张宽度（pt，1pt = 1/72in），用于计算渲染窗口的 CSS 像素宽高 */
  widthPt: number
  /** 纸张高度（pt，1pt = 1/72in），用于计算渲染窗口的 CSS 像素宽高 */
  heightPt: number
  /** printToPDF pageSize 参数：标准纸张传内置名字符串，自定义传英寸单位的 {width, height} */
  printPageSize: 'A4' | 'A3' | 'A5' | 'Letter' | { width: number; height: number }
}

const PX_PER_PT = 96 / 72
const PX_PER_IN = 96
const MARGIN_IN = 0.4
const MARGIN_PT = MARGIN_IN * 72

/** 屏幕像素尺寸（按 16:10 宽高比补高度）换算成纸张尺寸信息。
 *  widthPt/heightPt 供渲染窗口计算 CSS 像素宽高；
 *  printToPDF 的自定义纸张宽高单位是英寸（与内置纸张字符串走同一下游），
 *  若直接传 pt 页面会被放大 72 倍，必须换算成英寸。 */
function screenPxToSize (px: number): Omit<PdfPageSizeInfo, 'key' | 'label'> {
  const heightPx = Math.round(px * 10 / 16)
  return {
    widthPt: Math.round((px / PX_PER_PT) * 100) / 100,
    heightPt: Math.round((heightPx / PX_PER_PT) * 100) / 100,
    printPageSize: { width: px / PX_PER_IN, height: heightPx / PX_PER_IN }
  }
}

export const PDF_PAGE_SIZES: PdfPageSizeInfo[] = [
  { key: 'A4', label: 'A4（默认）', widthPt: 595.28, heightPt: 841.89, printPageSize: 'A4' },
  { key: 'A3', label: 'A3', widthPt: 841.89, heightPt: 1190.55, printPageSize: 'A3' },
  { key: 'A5', label: 'A5', widthPt: 419.53, heightPt: 595.28, printPageSize: 'A5' },
  { key: 'Letter', label: 'Letter', widthPt: 612, heightPt: 792, printPageSize: 'Letter' },
  { key: '1024', label: '1024px 宽屏', ...screenPxToSize(1024) },
  { key: '1440', label: '1440px 宽屏', ...screenPxToSize(1440) },
  { key: '1920', label: '1920px 宽屏', ...screenPxToSize(1920) }
]

/** 获取纸张尺寸信息，默认 A4 */
export function getPdfPageSizeInfo (key?: PdfPageSize): PdfPageSizeInfo {
  return PDF_PAGE_SIZES.find(s => s.key === (key || 'A4')) || PDF_PAGE_SIZES[0]
}

/** 根据纸张尺寸计算隐藏窗口的内容区域尺寸（CSS px） */
export function getPdfContentDimensions (key?: PdfPageSize): { contentW: number; contentH: number; pageW: number; pageH: number } {
  const info = getPdfPageSizeInfo(key)
  const contentW = Math.ceil((info.widthPt - MARGIN_PT * 2) * PX_PER_PT)
  const contentH = (info.heightPt - MARGIN_PT * 2) * PX_PER_PT
  return { contentW, contentH, pageW: info.widthPt, pageH: info.heightPt }
}
