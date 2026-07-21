import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Notebook, Note, AppSettings } from '../shared/types'
import { isEncryptedContent, decryptWithCachedKey, encryptNoteContent, decryptNoteContent, hasCachedKey, getCachedKey, cacheKey, removeCachedKey } from './crypto'

// 类型已经在函数内部使用，下面是接口占位
export type { Notebook, Note, AppSettings }

let db: Database.Database | null = null

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  fontSize: 14,
  treeFontSize: 14,
  layout: {
    sidebarWidth: 260,
    sidebarVisible: true,
    previewVisible: true,
    editorVisible: true
  },
  oss: {
    provider: 'aliyun',
    configured: false
  },
  autoSync: false,
  showTreeCount: true,
  recycleBin: {
    retentionDays: 30,
    autoCleanup: true
  },
  gitSync: {
    repoUrl: '',
    branch: 'main',
    authorName: 'inkslate',
    authorEmail: 'inkslate@local',
    username: '',
    configured: false,
    initialized: false
  }
}

export async function initDatabase(): Promise<void> {
  const userDataDir = app.getPath('userData')
  const dbPath = path.join(userDataDir, 'mdtext.db')
  const notesDir = path.join(userDataDir, 'notes')

  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 笔记本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      icon TEXT,
      is_deleted INTEGER DEFAULT 0,
      deleted_at INTEGER,
      sort_order INTEGER,
      FOREIGN KEY (parent_id) REFERENCES notebooks(id) ON DELETE CASCADE
    )
  `)

  // 笔记表
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notebook_id TEXT NOT NULL,
      parent_id TEXT,
      path TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'markdown',
      language TEXT,
      url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      icon TEXT,
      is_deleted INTEGER DEFAULT 0,
      deleted_at INTEGER,
      sort_order INTEGER,
      FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    )
  `)

  // 兼容老库：notes 表如果没有 format 列则补上
  const columns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]
  const hasFormat = columns.some(c => c.name === 'format')
  if (!hasFormat) {
    db.exec(`ALTER TABLE notes ADD COLUMN format TEXT NOT NULL DEFAULT 'markdown'`)
  }
  const hasLanguage = columns.some(c => c.name === 'language')
  if (!hasLanguage) {
    db.exec(`ALTER TABLE notes ADD COLUMN language TEXT`)
  }
  const hasDeletedAtNotes = columns.some(c => c.name === 'deleted_at')
  if (!hasDeletedAtNotes) {
    db.exec(`ALTER TABLE notes ADD COLUMN deleted_at INTEGER`)
  }
  // sort_order：用户手动拖动排序的持久化字段。老数据迁移时用 created_at，
  // 这样老笔记顺序保持稳定（按创建时间排）。
  const hasSortOrderNotes = columns.some(c => c.name === 'sort_order')
  if (!hasSortOrderNotes) {
    db.exec(`ALTER TABLE notes ADD COLUMN sort_order INTEGER`)
    db.exec(`UPDATE notes SET sort_order = created_at WHERE sort_order IS NULL`)
  }
  // url：网址笔记专用（format === 'url'），其他格式为 NULL
  const hasUrlNotes = columns.some(c => c.name === 'url')
  if (!hasUrlNotes) {
    db.exec(`ALTER TABLE notes ADD COLUMN url TEXT`)
  }
  // content：存储 url/richtext 等无独立文件笔记的内容，md/html/code 也保留副本兜底
  const hasContent = columns.some(c => c.name === 'content')
  if (!hasContent) {
    db.exec(`ALTER TABLE notes ADD COLUMN content TEXT`)
  }
  // 文件笔记：file_path / file_name / file_size / file_ext
  const hasFilePath = columns.some(c => c.name === 'file_path')
  if (!hasFilePath) {
    db.exec(`ALTER TABLE notes ADD COLUMN file_path TEXT`)
  }
  const hasFileName = columns.some(c => c.name === 'file_name')
  if (!hasFileName) {
    db.exec(`ALTER TABLE notes ADD COLUMN file_name TEXT`)
  }
  const hasFileSize = columns.some(c => c.name === 'file_size')
  if (!hasFileSize) {
    db.exec(`ALTER TABLE notes ADD COLUMN file_size INTEGER`)
  }
  const hasFileExt = columns.some(c => c.name === 'file_ext')
  if (!hasFileExt) {
    db.exec(`ALTER TABLE notes ADD COLUMN file_ext TEXT`)
  }

  // 兼容老库：notebooks 表如果没有 deleted_at 列则补上
  const nbColumns = db.prepare("PRAGMA table_info(notebooks)").all() as { name: string }[]
  const hasDeletedAtNotebooks = nbColumns.some(c => c.name === 'deleted_at')
  if (!hasDeletedAtNotebooks) {
    db.exec(`ALTER TABLE notebooks ADD COLUMN deleted_at INTEGER`)
  }
  const hasSortOrderNotebooks = nbColumns.some(c => c.name === 'sort_order')
  if (!hasSortOrderNotebooks) {
    db.exec(`ALTER TABLE notebooks ADD COLUMN sort_order INTEGER`)
    db.exec(`UPDATE notebooks SET sort_order = created_at WHERE sort_order IS NULL`)
  }
  const hasPasswordProtected = nbColumns.some(c => c.name === 'password_protected')
  if (!hasPasswordProtected) {
    db.exec(`ALTER TABLE notebooks ADD COLUMN password_protected INTEGER DEFAULT 0`)
  }
  // notes 表：加密标记
  const hasIsEncrypted = columns.some(c => c.name === 'is_encrypted')
  if (!hasIsEncrypted) {
    db.exec(`ALTER TABLE notes ADD COLUMN is_encrypted INTEGER DEFAULT 0`)
  }

  // 设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notebooks_parent ON notebooks(parent_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(is_deleted, deleted_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notebooks_deleted_at ON notebooks(is_deleted, deleted_at)`)

  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as { value: string } | undefined
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'app_settings',
      JSON.stringify(DEFAULT_SETTINGS)
    )
  }

  // 创建默认笔记本（如果没有任何笔记本）
  const nbCount = (db.prepare('SELECT COUNT(*) as c FROM notebooks').get() as { c: number }).c
  if (nbCount === 0) {
    const defaultNotebook: Notebook = {
      id: generateId(),
      name: '我的笔记',
      parentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false
    }
    db.prepare(`
      INSERT INTO notebooks (id, name, parent_id, created_at, updated_at, icon, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(defaultNotebook.id, defaultNotebook.name, null, defaultNotebook.createdAt, defaultNotebook.updatedAt, null)
  }

  // ===== 迁移：把旧笔记文件从 {id}.{ext} 重命名为 {slug}.{ext} =====
  // 让 git 仓库里的文件名可读（用标题而非 ID）
  const slugMigration = db.prepare('SELECT value FROM settings WHERE key = ?').get('migration_slug_filenames') as { value: string } | undefined
  if (!slugMigration) {
    const notesDir = getNotesDir()
    const filesDir = getFilesDir()
    const rows = db.prepare('SELECT id, title, path, format, file_path FROM notes').all() as any[]
    for (const row of rows) {
      // 1. 重命名主文件
      if (row.path) {
        try {
          const oldPath = row.path
          if (fs.existsSync(oldPath)) {
            const ext = row.format === 'html' ? 'html' : row.format === 'richtext' ? 'json' : row.format === 'code' ? 'code' : row.format === 'url' ? 'url' : row.format === 'file' ? 'file' : 'md'
            const slug = slugify(row.title || 'untitled')
            const newFileName = getUniqueFileName(slug, ext, notesDir, oldPath)
            const newPath = path.join(notesDir, newFileName)
            if (newPath !== oldPath) {
              fs.renameSync(oldPath, newPath)
              db.prepare('UPDATE notes SET path = ? WHERE id = ?').run(newPath, row.id)
            }
          }
        } catch (e) {
          console.error('migration slug: rename main file failed for note', row.id, e)
        }
      }
      // 2. 重命名文件笔记的源文件
      if (row.file_path) {
        try {
          const oldFilePath = row.file_path
          if (fs.existsSync(oldFilePath)) {
            const fileExt = path.extname(oldFilePath).slice(1) || 'bin'
            // 用笔记标题做 slug，而非源文件名
            const slug = slugify(row.title || 'untitled')
            const newFileName = getUniqueFileName(slug, fileExt, filesDir, oldFilePath)
            const newFilePath = path.join(filesDir, newFileName)
            if (newFilePath !== oldFilePath) {
              fs.renameSync(oldFilePath, newFilePath)
              db.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(newFilePath, row.id)
            }
          }
        } catch (e) {
          console.error('migration slug: rename file note source failed for note', row.id, e)
        }
      }
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('migration_slug_filenames', '1')
    console.log(`[migration] slug filenames: processed ${rows.length} notes`)
  }

  // ===== 迁移：把现有平铺笔记按笔记本树状目录归位 =====
  // 老结构：notes/{slug}.{ext} 全平铺在根
  // 新结构：notes/<笔记本 slug 路径>/{slug}.{ext}
  const treeMigration = db.prepare('SELECT value FROM settings WHERE key = ?').get('migration_notebook_tree') as { value: string } | undefined
  if (!treeMigration) {
    const notesDir = getNotesDir()
    const filesDir = getFilesDir()
    const rows = db.prepare('SELECT id, path, notebook_id, format, file_path, file_ext FROM notes WHERE is_deleted = 0 AND format != ?').all('file') as any[]
    let movedNotes = 0
    for (const row of rows) {
      if (!row.path) continue
      const targetDir = getNotebookPath(row.notebook_id)
      // 已经在正确目录里就跳过
      if (path.dirname(row.path) === targetDir) continue
      try {
        if (!fs.existsSync(row.path)) continue
        fs.mkdirSync(targetDir, { recursive: true })
        const basename = path.basename(row.path)
        let dest = path.join(targetDir, basename)
        let counter = 2
        while (fs.existsSync(dest) && path.resolve(dest) !== path.resolve(row.path)) {
          const ext = path.extname(basename)
          const stem = basename.slice(0, basename.length - ext.length)
          dest = path.join(targetDir, `${stem}-${counter}${ext}`)
          counter++
        }
        if (path.resolve(dest) !== path.resolve(row.path)) {
          fs.renameSync(row.path, dest)
          db.prepare('UPDATE notes SET path = ? WHERE id = ?').run(dest, row.id)
          movedNotes++
        }
      } catch (e) {
        console.error('[migration] notebook tree move note failed:', row.id, e)
      }
    }
    // 文件笔记源文件也按笔记本归位
    const fileRows = db.prepare('SELECT id, file_path, notebook_id FROM notes WHERE is_deleted = 0 AND format = ? AND file_path IS NOT NULL').all('file') as any[]
    let movedFiles = 0
    for (const row of fileRows) {
      if (!row.file_path) continue
      const targetDir = getNotebookFilePath(row.notebook_id)
      if (path.dirname(row.file_path) === targetDir) continue
      try {
        if (!fs.existsSync(row.file_path)) continue
        fs.mkdirSync(targetDir, { recursive: true })
        const basename = path.basename(row.file_path)
        let dest = path.join(targetDir, basename)
        let counter = 2
        while (fs.existsSync(dest) && path.resolve(dest) !== path.resolve(row.file_path)) {
          const ext = path.extname(basename)
          const stem = basename.slice(0, basename.length - ext.length)
          dest = path.join(targetDir, `${stem}-${counter}${ext}`)
          counter++
        }
        if (path.resolve(dest) !== path.resolve(row.file_path)) {
          fs.renameSync(row.file_path, dest)
          db.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(dest, row.id)
          movedFiles++
        }
      } catch (e) {
        console.error('[migration] notebook tree move file note src failed:', row.id, e)
      }
    }
    // 笔记本目录本身：新建空目录占位（让 Git 看见 .keep）
    const notebookRows = db.prepare('SELECT id, name FROM notebooks WHERE is_deleted = 0 AND parent_id IS NOT NULL').all() as any[]
    let createdDirs = 0
    for (const nb of notebookRows) {
      try {
        const dir = getNotebookPath(nb.id)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
          createdDirs++
        }
      } catch {}
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('migration_notebook_tree', '1')
    console.log(`[migration] notebook tree: moved ${movedNotes} notes, ${movedFiles} file srcs, created ${createdDirs} dirs`)
  }
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function getNotesDir(): string {
  return path.join(app.getPath('userData'), 'notes')
}

/** 文件笔记的源文件存放目录：userData/notes/files/ */
export function getFilesDir(): string {
  return path.join(getNotesDir(), 'files')
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

/** 把笔记标题转成合法文件名（不含扩展名）。
 *  - 替换非法字符 / \ : * ? " < > | 为 -
 *  - 合并连续空格
 *  - 截断到 100 字符
 *  - 空标题兜底 untitled */
export function slugify(title: string): string {
  let slug = title.trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (slug.length > 100) slug = slug.substring(0, 100).trim()
  if (!slug) slug = 'untitled'
  return slug
}

/** 生成不冲突的文件名（含扩展名）。
 *  同目录下已存在则追加 -2, -3... */
export function getUniqueFileName(slug: string, ext: string, dir: string, excludePath?: string): string {
  let fileName = `${slug}.${ext}`
  let filePath = path.join(dir, fileName)
  let counter = 2
  while (fs.existsSync(filePath) && path.resolve(filePath) !== path.resolve(excludePath ?? '')) {
    fileName = `${slug}-${counter}.${ext}`
    filePath = path.join(dir, fileName)
    counter++
  }
  return fileName
}

// ============ 笔记本路径（Git 同步树状结构用） ============

/**
 * 计算一个 notebook 在磁盘上的相对路径（slug 形式），如 `我的笔记/工作`
 * - 用 parent_id 链向上递归
 * - 用 slugify 做目录名
 * - 同级 slug 冲突自动加 -2, -3 后缀
 * - 已删除的 notebook 不参与路径（避免隔离文件夹被生成）
 *
 * 返回空字符串表示根级（不应该发生，但兜底）
 */
function notebookSlugPathFromChain(
  id: string,
  visited: Set<string> = new Set()
): string {
  if (visited.has(id)) return '' // 防环
  visited.add(id)
  const row = getDatabase()
    .prepare('SELECT id, name, parent_id, is_deleted FROM notebooks WHERE id = ?')
    .get(id) as any
  if (!row) return ''
  const slug = slugify(row.name) || 'untitled'
  if (!row.parent_id) return slug
  const parentPath = notebookSlugPathFromChain(row.parent_id, visited)
  return parentPath ? `${parentPath}/${slug}` : slug
}

/** 计算 notebook 完整磁盘绝对路径（含 getNotesDir 前缀） */
export function getNotebookPath(notebookId: string): string {
  const rel = notebookSlugPathFromChain(notebookId)
  return rel ? path.join(getNotesDir(), rel) : getNotesDir()
}

/** 同上，给 file 笔记用（files/ 前缀） */
export function getNotebookFilePath(notebookId: string): string {
  const rel = notebookSlugPathFromChain(notebookId)
  return rel ? path.join(getFilesDir(), rel) : getFilesDir()
}

/** 重命名笔记本时，确保新 slug 与同级其他笔记本不冲突。
 *  返回保证唯一的 slug。 */
function uniqueNotebookSlug(desiredSlug: string, parentId: string | null, excludeId: string): string {
  const d = getDatabase()
  const siblings = d.prepare(
    `SELECT id, name FROM notebooks WHERE parent_id IS ? AND id != ? AND is_deleted = 0`
  ).all(parentId, excludeId) as any[]
  const existingSlugs = new Set(siblings.map(s => slugify(s.name)))
  if (!existingSlugs.has(desiredSlug)) return desiredSlug
  let i = 2
  while (existingSlugs.has(`${desiredSlug}-${i}`)) i++
  return `${desiredSlug}-${i}`
}

/** 重命名磁盘上的笔记目录 + 文件源目录，并更新数据库中 notes 的 path 和 file_path。
 *  oldRel / newRel 是 notebookSlugPathFromChain 算出的相对路径（如 "我的笔记/工作"）。
 *  仅当目录存在时才动磁盘；flat 结构的老文件不动以避免误删。 */
function renameNotebookDirOnDisk(oldRel: string, newRel: string): void {
  if (!oldRel || !newRel || oldRel === newRel) return

  const oldDir = path.join(getNotesDir(), oldRel)
  const newDir = path.join(getNotesDir(), newRel)
  const oldFilesDir = path.join(getFilesDir(), oldRel)
  const newFilesDir = path.join(getFilesDir(), newRel)

  // 递归创建目录 + 防冲突重命名
  const renameWithDedup = (src: string, dest: string) => {
    if (!fs.existsSync(src)) return
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    let finalDest = dest
    let counter = 2
    while (fs.existsSync(finalDest)) {
      if (finalDest === src) return // 安全网
      finalDest = `${dest}-${counter}`
      counter++
    }
    fs.renameSync(src, finalDest)
  }

  renameWithDedup(oldDir, newDir)
  renameWithDedup(oldFilesDir, newFilesDir)

  // 更新数据库中所有受影响笔记的 path 和 file_path
  // note: notebookSlugPathFromChain 返回 / 分隔，DB 路径用 path.sep
  const oldPrefix = oldDir + path.sep
  const newPrefix = newDir + path.sep
  const d = getDatabase()
  const affected = d.prepare(
    `SELECT id, path, file_path FROM notes WHERE is_deleted = 0 AND (path LIKE ? OR file_path LIKE ?)`
  ).all(`${oldPrefix}%`, `${oldPrefix}%`) as any[]
  for (const row of affected) {
    if (row.path && row.path.startsWith(oldPrefix)) {
      d.prepare('UPDATE notes SET path = ? WHERE id = ?').run(newPrefix + row.path.slice(oldPrefix.length), row.id)
    }
    if (row.file_path && row.file_path.startsWith(oldPrefix)) {
      d.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(newPrefix + row.file_path.slice(oldPrefix.length), row.id)
    }
  }
}

/** 移动笔记本（改 parent_id）时，把磁盘目录一起搬，并更新数据库路径。
 *  oldRel 必须在调用前算好（DB 改 parent_id 之前），否则会算成新位置 */
function moveNotebookDirOnDisk(notebookId: string, oldRel: string): void {
  if (!oldRel) return
  const newRel = notebookSlugPathFromChain(notebookId) // 此时 DB 已更新 parent
  if (!newRel || oldRel === newRel) return

  const oldDir = path.join(getNotesDir(), oldRel)
  const newDir = path.join(getNotesDir(), newRel)
  const oldFilesDir = path.join(getFilesDir(), oldRel)
  const newFilesDir = path.join(getFilesDir(), newRel)

  if (!fs.existsSync(oldDir) && !fs.existsSync(oldFilesDir)) return

  // 搬笔记目录
  if (fs.existsSync(oldDir)) {
    try {
      fs.mkdirSync(path.dirname(newDir), { recursive: true })
      fs.renameSync(oldDir, newDir)
    } catch (e) {
      console.error('[db] moveNotebookDirOnDisk notes dir failed:', oldDir, '→', newDir, e)
    }
  }

  // 搬文件源目录
  if (fs.existsSync(oldFilesDir)) {
    try {
      fs.mkdirSync(path.dirname(newFilesDir), { recursive: true })
      fs.renameSync(oldFilesDir, newFilesDir)
    } catch (e) {
      console.error('[db] moveNotebookDirOnDisk files dir failed:', oldFilesDir, '→', newFilesDir, e)
    }
  }

  // 更新 DB 中受影响笔记的 path 和 file_path
  const oldPrefix = oldDir + path.sep
  const newPrefix = newDir + path.sep
  const d = getDatabase()
  const affected = d.prepare(
    `SELECT id, path, file_path FROM notes WHERE is_deleted = 0 AND (path LIKE ? OR file_path LIKE ?)`
  ).all(`${oldPrefix}%`, `${oldPrefix}%`) as any[]
  for (const row of affected) {
    if (row.path && row.path.startsWith(oldPrefix)) {
      d.prepare('UPDATE notes SET path = ? WHERE id = ?').run(newPrefix + row.path.slice(oldPrefix.length), row.id)
    }
    if (row.file_path && row.file_path.startsWith(oldPrefix)) {
      d.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(newPrefix + row.file_path.slice(oldPrefix.length), row.id)
    }
  }
}

// ============ 笔记本操作 ============
function rowToNotebook(row: any): Notebook {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    icon: row.icon,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
    sortOrder: row.sort_order ?? row.created_at
  }
}

function rowToNote(row: any, content: string = ''): Note {
  return {
    id: row.id,
    title: row.title,
    content,
    format: (row.format as Note['format']) ?? 'markdown',
    language: (row.language as Note['language']) ?? undefined,
    url: row.url ?? undefined,
    fileName: row.file_name ?? undefined,
    filePath: row.file_path ?? undefined,
    fileExt: row.file_ext ?? undefined,
    fileSize: row.file_size ?? undefined,
    notebookId: row.notebook_id,
    parentId: row.parent_id,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: !!row.is_deleted,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order ?? undefined,
    isEncrypted: row.is_encrypted === 1 || isEncryptedContent(content)
  }
}

const dbMethods = {
  listNotebooks(): Notebook[] {
    const rows = getDatabase().prepare('SELECT * FROM notebooks WHERE is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) ASC').all()
    return rows.map(rowToNotebook)
  },

  createNotebook(name: string, parentId: string | null, icon?: string): Notebook {
    const id = generateId()
    const now = Date.now()
    getDatabase().prepare(`
      INSERT INTO notebooks (id, name, parent_id, created_at, updated_at, icon, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, name, parentId, now, now, icon ?? null)
    return { id, name, parentId, createdAt: now, updatedAt: now, icon, isDeleted: false }
  },

  renameNotebook(id: string, newName: string): void {
    const d = getDatabase()
    const row = d.prepare('SELECT id, parent_id FROM notebooks WHERE id = ?').get(id) as any
    if (!row) return
    const desired = slugify(newName) || 'untitled'
    const finalSlug = uniqueNotebookSlug(desired, row.parent_id ?? null, id)
    const displayName = finalSlug === desired ? newName : `${newName}`
    // 计算旧路径（改名前），新路径（改名后）
    const oldRel = notebookSlugPathFromChain(id)
    d.prepare('UPDATE notebooks SET name = ?, updated_at = ? WHERE id = ?').run(displayName, Date.now(), id)
    const newRel = notebookSlugPathFromChain(id)
    // 硬盘目录同步重命名 + 更新 notes 的 path/file_path
    if (oldRel && newRel && oldRel !== newRel) {
      try { renameNotebookDirOnDisk(oldRel, newRel) } catch (e) { console.error('[db] renameNotebook dir rename failed', e) }
    }
  },

  /**
   * 通用更新笔记本（name / icon / parentId 任一）
   * - name 变化：走 renameNotebook 同款逻辑（slug 去重 + 硬盘目录 mv）
   * - icon 变化：只动 DB（icon 字段不影响磁盘）
   * - parentId 变化：走 moveNotebook 同款逻辑
   * - 三个都不传：no-op
   */
  updateNotebook(id: string, updates: { name?: string; icon?: string | null; parentId?: string | null }): void {
    const d = getDatabase()
    const row = d.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as any
    if (!row) return

    // name 改：复用 renameNotebook 的目录迁移逻辑
    if (updates.name !== undefined && updates.name !== row.name) {
      this.renameNotebook(id, updates.name)
    }

    // parentId 改：复用 moveNotebook 的逻辑
    if (updates.parentId !== undefined && updates.parentId !== (row.parent_id ?? null)) {
      this.moveNotebook(id, updates.parentId)
    }

    // icon 改：只动 DB（不影响磁盘）
    if (updates.icon !== undefined && updates.icon !== row.icon) {
      d.prepare('UPDATE notebooks SET icon = ?, updated_at = ? WHERE id = ?').run(updates.icon, Date.now(), id)
    }
  },

  /**
   * 软删除笔记本 + 级联删除其下所有笔记 + 子笔记本（递归）
   * 磁盘文件保留不动 —— 回收站的还原靠 row.notebook_id 重新走 createNote 路径即可
   */
  deleteNotebook(id: string): void {
    const d = getDatabase()
    const now = Date.now()

    // 递归收集所有子笔记本 ID（含自身）
    const ids: string[] = [id]
    const stack = [id]
    while (stack.length > 0) {
      const cur = stack.pop()!
      const children = d.prepare('SELECT id FROM notebooks WHERE parent_id = ? AND is_deleted = 0').all(cur) as any[]
      for (const child of children) {
        ids.push(child.id)
        stack.push(child.id)
      }
    }

    // 软删除这些笔记本下所有活跃笔记
    for (const nbId of ids) {
      d.prepare('UPDATE notes SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE notebook_id = ? AND is_deleted = 0')
        .run(now, now, nbId)
    }

    // 软删除笔记本自身和子笔记本
    d.prepare(`UPDATE notebooks SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`)
      .run(now, now, ...ids)
  },

  moveNotebook(id: string, newParentId: string | null): void {
    // 防环：不能移动到自己的后代
    if (newParentId) {
      let cur: string | null = newParentId
      const visited = new Set<string>()
      while (cur && !visited.has(cur)) {
        visited.add(cur)
        if (cur === id) throw new Error('不能把笔记本移动到自己的子目录下')
        const row = getDatabase().prepare('SELECT parent_id FROM notebooks WHERE id = ?').get(cur) as any
        cur = row?.parent_id ?? null
      }
    }
    // 先算"旧"路径（在改 parent 之前），再改 DB，再 mv
    const oldRel = notebookSlugPathFromChain(id)
    getDatabase().prepare('UPDATE notebooks SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, Date.now(), id)
    try { moveNotebookDirOnDisk(id, oldRel) } catch (e) { console.error('[db] moveNotebook dir move failed', e) }
  },

  // ============ 笔记操作 ============
  listNotes(notebookId?: string): Note[] {
    const d = getDatabase()
    // 顺序：按 sort_order 倒序（sort_order 大的在前），未填的兜底为 created_at
    // —— 用户拖动改 sort_order；从未拖动时表现为按 created_at DESC
    const rows = notebookId
      ? d.prepare('SELECT * FROM notes WHERE notebook_id = ? AND is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) DESC').all(notebookId)
      : d.prepare('SELECT * FROM notes WHERE is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) DESC').all()
    return rows.map((row: any) => {
      const { content, fixedPath } = resolveNoteContent(row)
      if (fixedPath && fixedPath !== row.path) {
        // 异步修复 path，不阻塞读取
        try {
          d.prepare('UPDATE notes SET path = ? WHERE id = ?').run(fixedPath, row.id)
        } catch {}
      }
      return rowToNote(row, content)
    })
  },

  getNote(id: string): Note | null {
    const row = getDatabase().prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!row) return null
    const { content, fixedPath } = resolveNoteContent(row)
    if (fixedPath && fixedPath !== row.path) {
      try {
        getDatabase().prepare('UPDATE notes SET path = ? WHERE id = ?').run(fixedPath, row.id)
      } catch {}
    }
    const note = rowToNote(row, content)
    // 尝试用缓存 key 解密
    if (note.isEncrypted && hasCachedKey(row.notebook_id)) {
      const decrypted = decryptWithCachedKey(content, row.notebook_id)
      if (decrypted !== null) note.content = decrypted
    }
    return note
  },

  createNote(title: string, notebookId: string, parentId: string | null, icon?: string, format: Note['format'] = 'markdown', language?: string, url?: string): Note {
    const id = generateId()
    const now = Date.now()
    const ext = format === 'html' ? 'html' : format === 'richtext' ? 'json' : format === 'code' ? 'code' : format === 'url' ? 'url' : format === 'file' ? 'file' : 'md'
    const slug = slugify(title)
    // 树状目录：notes/<笔记本 slug 路径>/<note-slug>.<ext>
    const dir = getNotebookPath(notebookId)
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    const fileName = getUniqueFileName(slug, ext, dir)
    const filePath = path.join(dir, fileName)

    // 写入初始内容
    let initialContent = ''
    if (format === 'markdown') initialContent = `# ${title}\n\n`
    else if (format === 'html') initialContent = `<!DOCTYPE html>\n<html><head><title>${title}</title></head>\n<body>\n<h1>${title}</h1>\n</body></html>\n`
    else if (format === 'richtext') initialContent = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] })
    else if (format === 'code') initialContent = language === 'python'
      ? `# ${title}\n\n`
      : language === 'html'
        ? `<!-- ${title} -->\n`
        : language === 'css'
          ? `/* ${title} */\n`
          : `// ${title}\n`
    else if (format === 'url') {
      // 网址笔记：内容用 url，文件存个简单标记
      initialContent = url ?? ''
    }
    // file 格式：源文件由调用方（IPC 层）复制到 filePath 后再调本方法；
    // 这里只写一个占位空文件，保证 row.path 指向的文件存在

    fs.writeFileSync(filePath, initialContent, 'utf-8')

    getDatabase().prepare(`
      INSERT INTO notes (id, title, notebook_id, parent_id, path, format, language, url, file_path, file_name, file_size, file_ext, created_at, updated_at, icon, is_deleted, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, title, notebookId, parentId, filePath, format, language ?? null, url ?? null, null, null, null, null, now, now, icon ?? null, now)

    return { id, title, content: initialContent, format, language: language as any, url, notebookId, parentId, path: filePath, createdAt: now, updatedAt: now, icon, isDeleted: false }
  },

  /** 文件笔记：在 createNote 之后再设置源文件信息。
   *  主进程把用户选的文件复制到 app data/notes/files/<笔记本路径>/{slug}.{ext}，
   *  再调本方法把文件路径写库。 */
  setNoteFile(noteId: string, opts: { filePath: string; fileName: string; fileSize: number; fileExt: string }): void {
    const now = Date.now()
    getDatabase().prepare(`
      UPDATE notes SET file_path = ?, file_name = ?, file_size = ?, file_ext = ?, updated_at = ? WHERE id = ?
    `).run(opts.filePath, opts.fileName, opts.fileSize, opts.fileExt, now, noteId)
  },

  /**
   * 文件笔记专用：给定 noteId + 源文件名，算出树状目录下的目标路径 + 唯一文件名，
   * 并返回一个 fileName（带后缀）让前端塞到 note.title 里。
   *
   * 之前老的实现是直接拼到 notes/files/{slug}.{ext}，忽略笔记本。
   * 现在按 notebook 树放到 notes/files/<笔记本 slug 路径>/{slug}.{ext}。
   */
  prepareFileNoteCopy(noteId: string, sourceFileName: string): { dir: string; fileName: string; fullPath: string } {
    const d = getDatabase()
    const noteRow = d.prepare('SELECT notebook_id FROM notes WHERE id = ?').get(noteId) as any
    if (!noteRow) throw new Error(`Note ${noteId} not found`)
    const dir = getNotebookFilePath(noteRow.notebook_id)
    try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    const ext = path.extname(sourceFileName).slice(1).toLowerCase() || 'bin'
    const baseName = path.basename(sourceFileName, path.extname(sourceFileName))
    const slug = slugify(baseName)
    const uniqueName = getUniqueFileName(slug, ext, dir)
    return { dir, fileName: uniqueName, fullPath: path.join(dir, uniqueName) }
  },

  updateNote(id: string, updates: Partial<Note>): Note {
    const d = getDatabase()
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!row) throw new Error(`Note ${id} not found`)

    const newTitle = updates.title ?? row.title
    const newIcon = updates.icon ?? row.icon
    const newFormat = updates.format ?? row.format ?? 'markdown'
    const newUrl = updates.url !== undefined ? updates.url : row.url
    const newNotebookId = updates.notebookId !== undefined ? updates.notebookId : row.notebook_id
    // 文件笔记字段：仅在传了的时候更新（replace 流程会传，普通改 title 不动）
    const newFilePath = updates.filePath !== undefined ? updates.filePath : row.file_path
    const newFileName = updates.fileName !== undefined ? updates.fileName : row.file_name
    const newFileSize = updates.fileSize !== undefined ? updates.fileSize : row.file_size
    const newFileExt = updates.fileExt !== undefined ? updates.fileExt : row.file_ext
    const now = Date.now()

    // 标题变化 或 笔记本变化 或 格式变化 都要重定位磁盘文件
    const titleChanged = updates.title !== undefined && updates.title !== row.title
    const notebookChanged = updates.notebookId !== undefined && updates.notebookId !== row.notebook_id
    const formatChanged = updates.format !== undefined && updates.format !== row.format
    let newPath = row.path
    if ((titleChanged || notebookChanged || formatChanged) && row.path) {
      const ext = newFormat === 'html' ? 'html' : newFormat === 'richtext' ? 'json' : newFormat === 'code' ? 'code' : newFormat === 'url' ? 'url' : newFormat === 'file' ? 'file' : 'md'
      const slug = slugify(newTitle)
      const targetDir = getNotebookPath(newNotebookId)
      try { fs.mkdirSync(targetDir, { recursive: true }) } catch {}
      const newFileNameDisk = getUniqueFileName(slug, ext, targetDir, row.path)
      const candidatePath = path.join(targetDir, newFileNameDisk)
      if (candidatePath !== row.path) {
        try {
          // 跨目录 mv 时，目标可能与 row.path 的父目录不同；先 mkdir -p
          fs.mkdirSync(path.dirname(candidatePath), { recursive: true })
          fs.renameSync(row.path, candidatePath)
          newPath = candidatePath
        } catch (e) {
          console.error('rename/move note file failed:', e)
          // 改名失败保持旧路径
        }
      }
    }

    if (updates.content !== undefined) {
      fs.writeFileSync(newPath, updates.content, 'utf-8')
    } else if (updates.url !== undefined && newFormat === 'url') {
      // 网址笔记：url 变化时同步更新文件内容（保持 url 即内容的约定）
      fs.writeFileSync(newPath, newUrl ?? '', 'utf-8')
    }

    d.prepare(`
      UPDATE notes SET title = ?, icon = ?, format = ?, url = ?, notebook_id = ?, file_path = ?, file_name = ?, file_size = ?, file_ext = ?, path = ?, updated_at = ? WHERE id = ?
    `).run(newTitle, newIcon, newFormat, newUrl ?? null, newNotebookId, newFilePath, newFileName, newFileSize, newFileExt, newPath, now, id)

    let content = ''
    try {
      content = fs.readFileSync(newPath, 'utf-8')
    } catch {}

    return rowToNote({ ...row, title: newTitle, icon: newIcon, format: newFormat, url: newUrl, notebook_id: newNotebookId, path: newPath, updated_at: now }, content)
  },

  /**
 * 软删除笔记：标记 is_deleted=1 + deleted_at=now
   * 重要：磁盘文件保留不动，以便后续还原能完整恢复内容
   */
  deleteNote(id: string): void {
    getDatabase().prepare('UPDATE notes SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id)
  },

  moveNote(id: string, newNotebookId: string | null): void {
    const d = getDatabase()
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!row) return
    if (newNotebookId === row.notebook_id) return  // 无变化

    // 计算新笔记本目录
    const newDir = newNotebookId ? getNotebookPath(newNotebookId) : getNotesDir()

    // 移动内容文件（md/html/code 等）
    let newPath: string | null = row.path
    if (row.path && fs.existsSync(row.path) && newNotebookId) {
      const fileName = path.basename(row.path)
      newPath = path.join(newDir, fileName)
      try {
        fs.mkdirSync(newDir, { recursive: true })
        fs.renameSync(row.path, newPath)
      } catch (e) {
        console.error('[db] moveNote file move failed:', row.path, '->', newPath, e)
        newPath = row.path  // 移动失败保留原路径
      }
    }

    // 移动 file 笔记的源文件
    let newFilePath: string | null = row.file_path
    if (row.file_path && fs.existsSync(row.file_path) && newNotebookId) {
      const fileName = path.basename(row.file_path)
      const newFilesDir = getNotebookFilePath(newNotebookId)
      newFilePath = path.join(newFilesDir, fileName)
      try {
        fs.mkdirSync(newFilesDir, { recursive: true })
        fs.renameSync(row.file_path, newFilePath)
      } catch (e) {
        console.error('[db] moveNote source file move failed:', row.file_path, '->', newFilePath, e)
        newFilePath = row.file_path
      }
    }

    // 更新 DB：切换 notebook、清空 parent、更新路径
    d.prepare('UPDATE notes SET notebook_id = ?, parent_id = ?, path = ?, file_path = ?, updated_at = ? WHERE id = ?')
      .run(newNotebookId, null, newPath, newFilePath, Date.now(), id)
  },

  searchNotes(keyword: string): Note[] {
    const d = getDatabase()
    const rows = d.prepare('SELECT * FROM notes WHERE title LIKE ? AND is_deleted = 0 ORDER BY updated_at DESC LIMIT 50').all(`%${keyword}%`)
    return rows.map((row: any) => rowToNote(row))
  },

  // ============ 回收站操作 ============

  /** 列出所有已删除笔记，按 deleted_at 倒序（最近删除的在前） */
  listDeletedNotes(): Note[] {
    const rows = getDatabase().prepare('SELECT * FROM notes WHERE is_deleted = 1 ORDER BY deleted_at DESC').all()
    return rows.map((row: any) => rowToNote(row))
  },

  /** 列出所有已删除笔记本，按 deleted_at 倒序 */
  listDeletedNotebooks(): Notebook[] {
    const rows = getDatabase().prepare('SELECT * FROM notebooks WHERE is_deleted = 1 ORDER BY deleted_at DESC').all()
    return rows.map(rowToNotebook)
  },

  /**
   * 还原笔记 + 级联还原已删除的祖先笔记本链
   * 关键约束：只还原这条笔记路径上的笔记本，**不动同笔记本里其他笔记的 is_deleted**
   */
  restoreNote(id: string): { restoredNotebooks: string[] } {
    const d = getDatabase()
    const now = Date.now()
    const restoredNotebooks: string[] = []

    // 1. 还原笔记本身（先读出来拿 notebook_id）
    const noteRow = d.prepare('SELECT notebook_id FROM notes WHERE id = ? AND is_deleted = 1').get(id) as any
    if (!noteRow) return { restoredNotebooks }

    d.prepare('UPDATE notes SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, id)

    // 2. 级联向上：把已删除的祖先笔记本也还原
    let currentNotebookId: string | null = noteRow.notebook_id
    const guard = new Set<string>() // 防止意外环
    while (currentNotebookId && !guard.has(currentNotebookId)) {
      guard.add(currentNotebookId)
      const nbRow = d.prepare('SELECT id, parent_id, is_deleted FROM notebooks WHERE id = ?').get(currentNotebookId) as any
      if (!nbRow) break // 笔记本已被物理删除，停止向上
      if (nbRow.is_deleted) {
        d.prepare('UPDATE notebooks SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, nbRow.id)
        restoredNotebooks.push(nbRow.id)
      }
      currentNotebookId = nbRow.parent_id ?? null
    }

    return { restoredNotebooks }
  },

  /**
   * 还原笔记本 + 级联还原已删除的祖先笔记本链
   * 不级联到子笔记——子笔记各自独立管理是否在回收站
   */
  restoreNotebook(id: string): { restoredNotebooks: string[] } {
    const d = getDatabase()
    const now = Date.now()
    const restoredNotebooks: string[] = [id]

    d.prepare('UPDATE notebooks SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ? AND is_deleted = 1').run(now, id)

    let currentNotebookId: string | null = id
    const guard = new Set<string>([id])
    while (currentNotebookId && !guard.has(currentNotebookId)) {
      guard.add(currentNotebookId)
      const nbRow = d.prepare('SELECT id, parent_id, is_deleted FROM notebooks WHERE id = ?').get(currentNotebookId) as any
      if (!nbRow) break
      if (nbRow.is_deleted) {
        d.prepare('UPDATE notebooks SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, nbRow.id)
        restoredNotebooks.push(nbRow.id)
      }
      currentNotebookId = nbRow.parent_id ?? null
    }

    return { restoredNotebooks }
  },

  /** 物理删除单条笔记：删文件 + DELETE 行 */
  purgeNote(id: string): void {
    const d = getDatabase()
    const row = d.prepare('SELECT path FROM notes WHERE id = ? AND is_deleted = 1').get(id) as any
    if (row?.path && fs.existsSync(row.path)) {
      try { fs.unlinkSync(row.path) } catch {}
    }
    d.prepare('DELETE FROM notes WHERE id = ?').run(id)
  },

  /** 物理删除单本笔记本：不动子笔记（保留它们的 is_deleted 状态，让用户决定） */
  purgeNotebook(id: string): void {
    getDatabase().prepare('DELETE FROM notebooks WHERE id = ? AND is_deleted = 1').run(id)
  },

  /**
   * 批量物理删除：超过 retentionDays 的已删除项全部清除
   * @returns 被清理的笔记数 + 笔记本数
   */
  purgeExpired(retentionDays: number): { notes: number; notebooks: number } {
    if (retentionDays <= 0) return { notes: 0, notebooks: 0 }
    const d = getDatabase()
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    // 找出过期的笔记，先删文件再删行
    const expiredNoteRows = d.prepare('SELECT id, path FROM notes WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff) as any[]
    for (const row of expiredNoteRows) {
      if (row.path && fs.existsSync(row.path)) {
        try { fs.unlinkSync(row.path) } catch {}
      }
    }
    const noteResult = d.prepare('DELETE FROM notes WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff)

    const nbResult = d.prepare('DELETE FROM notebooks WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff)

    return { notes: noteResult.changes, notebooks: nbResult.changes }
  },

  /**
   * 清空回收站：无视天数，物理删除全部已删除项
   */
  emptyRecycleBin(): { notes: number; notebooks: number } {
    const d = getDatabase()
    const expiredNoteRows = d.prepare('SELECT id, path FROM notes WHERE is_deleted = 1').all() as any[]
    for (const row of expiredNoteRows) {
      if (row.path && fs.existsSync(row.path)) {
        try { fs.unlinkSync(row.path) } catch {}
      }
    }
    const noteResult = d.prepare('DELETE FROM notes WHERE is_deleted = 1').run()
    const nbResult = d.prepare('DELETE FROM notebooks WHERE is_deleted = 1').run()
    return { notes: noteResult.changes, notebooks: nbResult.changes }
  },

  // ============ 设置 ============
  getSettings(): AppSettings {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as { value: string } | undefined
    if (!row) return DEFAULT_SETTINGS
    try {
      const parsed = JSON.parse(row.value)
      // 嵌套对象合并：recycleBin / layout / oss / gitSync 老存档可能缺字段
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        layout: { ...DEFAULT_SETTINGS.layout, ...(parsed.layout ?? {}) },
        oss: { ...DEFAULT_SETTINGS.oss, ...(parsed.oss ?? {}) },
        recycleBin: { ...DEFAULT_SETTINGS.recycleBin, ...(parsed.recycleBin ?? {}) },
        gitSync: { ...DEFAULT_SETTINGS.gitSync, ...(parsed.gitSync ?? {}) }
      }
    } catch {
      return DEFAULT_SETTINGS
    }
  },

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    const merged = {
      ...current,
      ...updates,
      layout: { ...current.layout, ...(updates.layout ?? {}) },
      oss: { ...current.oss, ...(updates.oss ?? {}) },
      recycleBin: { ...current.recycleBin, ...(updates.recycleBin ?? {}) },
      gitSync: { ...current.gitSync, ...(updates.gitSync ?? {}) }
    }
    getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('app_settings', JSON.stringify(merged))
    return merged
  },

  /** 重新排序笔记。orderedIds 是新的目标顺序（仅同级兄弟节点）。
   *  算法：相邻节点 sortOrder 取平均，逐步细化；不够细时整体重排为 step 倍数。 */
  reorderNotes(notebookId: string, orderedIds: string[]): void {
    reorderRows('notes', 'notebook_id', notebookId, orderedIds)
  },

  /** 重新排序笔记本。orderedIds 是新的目标顺序（仅顶级或某 parent 下）。 */
  reorderNotebooks(parentId: string | null, orderedIds: string[]): void {
    reorderRows('notebooks', 'parent_id', parentId, orderedIds)
  },

  // ============ Git 同步元数据导出/导入 ============

  /** 列出全部活跃笔记本（is_deleted=0），用于导出到 .inkslate/notebooks.json */
  listActiveNotebooks(): Notebook[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM notebooks WHERE is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) ASC')
      .all() as any[]
    return rows.map(rowToNotebook)
  },

  /** 列出全部活跃笔记（is_deleted=0），用于导出到 .inkslate/notes.json */
  listActiveNotes(): Note[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM notes WHERE is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) DESC')
      .all() as any[]
    return rows.map((row: any) => rowToNote(row))
  },

  /**
   * 批量替换 notebooks 表（Git 拉取后 reconcile 用）
   * - 删除所有现存的活跃记录
   * - 按 notebooks 数组 INSERT（id 冲突走 REPLACE）
   * - 软删除的（is_deleted=1）不动
   */
  replaceNotebooks(notebooks: Array<{
    id: string
    name: string
    parentId: string | null
    icon?: string | null
    createdAt: number
    updatedAt: number
    sortOrder?: number
  }>): void {
    const d = getDatabase()
    const tx = d.transaction(() => {
      d.prepare('DELETE FROM notebooks WHERE is_deleted = 0').run()
      const stmt = d.prepare(`
        INSERT INTO notebooks (id, name, parent_id, created_at, updated_at, icon, is_deleted, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `)
      for (const nb of notebooks) {
        stmt.run(
          nb.id, nb.name, nb.parentId, nb.createdAt, nb.updatedAt,
          nb.icon ?? null, nb.sortOrder ?? nb.createdAt
        )
      }
    })
    tx()
  },

  /**
   * 批量替换 notes 表（Git 拉取后 reconcile 用）
   * - 删除所有现存的活跃记录
   * - 按 notes 数组 INSERT（id 冲突走 REPLACE）
   * - 软删除的（is_deleted=1）不动
   * - 不读文件内容（content 字段不入 metadata，content 由 IPC 端按需读）
   */
  replaceNotes(notes: Array<{
    id: string
    title: string
    notebookId: string
    parentId: string | null
    path?: string
    format: Note['format']
    language?: string | null
    url?: string | null
    fileName?: string | null
    filePath?: string | null
    fileExt?: string | null
    fileSize?: number | null
    icon?: string | null
    createdAt: number
    updatedAt: number
    sortOrder?: number
  }>): void {
    const d = getDatabase()
    const tx = d.transaction(() => {
      // 保留现有 content，避免 reconcile 清空 url/richtext 等无文件笔记的内容
      const contentMap = new Map<string, string>()
      for (const row of d.prepare('SELECT id, content FROM notes WHERE is_deleted = 0').all() as any[]) {
        contentMap.set(row.id, row.content || '')
      }
      d.prepare('DELETE FROM notes WHERE is_deleted = 0').run()
      const stmt = d.prepare(`
        INSERT INTO notes (id, title, notebook_id, parent_id, path, format, language, url, file_path, file_name, file_size, file_ext, content, created_at, updated_at, icon, is_deleted, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `)
      for (const n of notes) {
        stmt.run(
          n.id, n.title, n.notebookId, n.parentId, n.path ?? null,
          n.format, n.language ?? null, n.url ?? null,
          n.filePath ?? null, n.fileName ?? null, n.fileSize ?? null, n.fileExt ?? null,
          contentMap.get(n.id) ?? '',
          n.createdAt, n.updatedAt, n.icon ?? null, n.sortOrder ?? n.createdAt
        )
      }
    })
    tx()
  },

  /**
   * 增量合并 notebooks（Git 拉取后 reconcile 用）
   * 与 replaceNotebooks 的区别：只 INSERT / UPDATE，绝不 DELETE 本地已有的活跃记录。
   * 这样即使远端元数据不完整，也不会把本地独有的笔记本清空。
   * 远端有、本地没有 → 插入；远端有、本地也有（按 id）→ 更新远端字段；
   * 本地有、远端没有 → 保留不动。
   *
   * ⚠️ 同名去重：如果远端笔记本的名字与本地某个笔记本相同（但 id 不同），
   * 则更新本地笔记本的字段（保留本地 id），避免 clone 后出现两个"我的笔记"。
   */
  mergeNotebooks(notebooks: Array<{
    id: string
    name: string
    parentId: string | null
    icon?: string | null
    createdAt: number
    updatedAt: number
    sortOrder?: number
  }>): Record<string, string> {
    const d = getDatabase()
    const remap: Record<string, string> = {}
    const tx = d.transaction(() => {
      // 建立本地 name → id 映射，用于同名去重
      const localByName = new Map<string, string>()
      for (const row of d.prepare('SELECT id, name FROM notebooks WHERE is_deleted = 0').all() as any[]) {
        localByName.set(row.name, row.id)
      }
      const upsert = d.prepare(`
        INSERT INTO notebooks (id, name, parent_id, created_at, updated_at, icon, is_deleted, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          parent_id = excluded.parent_id,
          updated_at = excluded.updated_at,
          icon = excluded.icon,
          sort_order = excluded.sort_order,
          is_deleted = 0
      `)
      for (const nb of notebooks) {
        // 同名去重：如果本地已有同名笔记本（不同 id），更新本地记录而非插入新记录
        const localId = localByName.get(nb.name)
        if (localId && localId !== nb.id) {
          d.prepare(`
            UPDATE notebooks SET name = ?, parent_id = ?, updated_at = ?, icon = ?, sort_order = ?, is_deleted = 0
            WHERE id = ?
          `).run(nb.name, nb.parentId, nb.updatedAt, nb.icon ?? null, nb.sortOrder ?? nb.createdAt, localId)
          // 记录重定向：远端 id → 本地 id，供调用方 remap 笔记的 notebook_id
          remap[nb.id] = localId
        } else {
          // 插入前检查 parent_id 是否需要重定向（父笔记本被同名去重合并了）
          const effectiveParentId = nb.parentId ? (remap[nb.parentId] ?? nb.parentId) : null
          upsert.run(
            nb.id, nb.name, effectiveParentId, nb.createdAt, nb.updatedAt,
            nb.icon ?? null, nb.sortOrder ?? nb.createdAt
          )
        }
      }
      // 第二轮：更新所有引用已重定向 parent_id 的笔记本（包括已 upsert 的）
      for (const [oldId, newId] of Object.entries(remap)) {
        d.prepare('UPDATE notebooks SET parent_id = ? WHERE parent_id = ? AND is_deleted = 0').run(newId, oldId)
      }
    })
    tx()
    return remap
  },

  /**
   * 增量合并 notes（Git 拉取后 reconcile 用）
   * 与 replaceNotes 的区别：只 INSERT / UPDATE，绝不 DELETE 本地已有的活跃记录。
   * - content 字段：优先用本地已有的 content（避免清空 url/richtext 等无文件笔记内容），
   *   仅当本地不存在该笔记时才使用远端/兜底值。
   * - path / file_path：优先保留本地已有的真实存在的路径，其次才用远端值。
   */
  mergeNotes(notes: Array<{
    id: string
    title: string
    notebookId: string
    parentId: string | null
    path?: string
    format: Note['format']
    language?: string | null
    url?: string | null
    fileName?: string | null
    filePath?: string | null
    fileExt?: string | null
    fileSize?: number | null
    icon?: string | null
    createdAt: number
    updatedAt: number
    sortOrder?: number
  }>): void {
    const d = getDatabase()
    const tx = d.transaction(() => {
      // 本地现有 content / path，用于保留本地独有的数据与真实文件
      const localMap = new Map<string, { content: string; path: string | null; filePath: string | null }>()
      for (const row of d.prepare('SELECT id, content, path, file_path FROM notes WHERE is_deleted = 0').all() as any[]) {
        localMap.set(row.id, { content: row.content || '', path: row.path ?? null, filePath: row.file_path ?? null })
      }
      const stmt = d.prepare(`
        INSERT INTO notes (id, title, notebook_id, parent_id, path, format, language, url, file_path, file_name, file_size, file_ext, content, created_at, updated_at, icon, is_deleted, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          notebook_id = excluded.notebook_id,
          parent_id = excluded.parent_id,
          format = excluded.format,
          language = excluded.language,
          url = excluded.url,
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          file_ext = excluded.file_ext,
          icon = excluded.icon,
          updated_at = excluded.updated_at,
          sort_order = excluded.sort_order,
          is_deleted = 0,
          path = CASE
            WHEN excluded.path IS NOT NULL AND excluded.path != '' THEN excluded.path
            ELSE notes.path
          END,
          file_path = CASE
            WHEN excluded.file_path IS NOT NULL AND excluded.file_path != '' THEN excluded.file_path
            ELSE notes.file_path
          END,
          content = CASE
            WHEN excluded.content IS NOT NULL AND excluded.content != '' THEN excluded.content
            ELSE notes.content
          END
      `)
      for (const n of notes) {
        const local = localMap.get(n.id)
        stmt.run(
          n.id, n.title, n.notebookId, n.parentId, n.path ?? null,
          n.format, n.language ?? null, n.url ?? null,
          n.filePath ?? null, n.fileName ?? null, n.fileSize ?? null, n.fileExt ?? null,
          local?.content || '',
          n.createdAt, n.updatedAt, n.icon ?? null, n.sortOrder ?? n.createdAt
        )
      }
    })
    tx()
  },

  /** 检查笔记本是否受密码保护 */
  isNotebookProtected(notebookId: string): boolean {
    const row = getDatabase().prepare('SELECT password_protected FROM notebooks WHERE id = ?').get(notebookId) as any
    if (row?.password_protected) return true
    // 兜底：检查笔记是否已加密
    const count = getDatabase().prepare('SELECT COUNT(*) as c FROM notes WHERE notebook_id = ? AND is_encrypted = 1 AND is_deleted = 0').get(notebookId) as any
    return (count?.c ?? 0) > 0
  },

  /** 给笔记本设置密码：加密所有笔记内容 */
  setNotebookPassword(notebookId: string, password: string): void {
    const d = getDatabase()
    const notes = d.prepare('SELECT * FROM notes WHERE notebook_id = ? AND is_deleted = 0').all() as any[]
    for (const row of notes) {
      const { content } = resolveNoteContent(row)
      if (!content || isEncryptedContent(content)) continue
      const encrypted = encryptNoteContent(content, password)
      // 写入加密内容
      if (row.path && fs.existsSync(row.path) && row.format !== 'url' && row.format !== 'file') {
        fs.writeFileSync(row.path, encrypted, 'utf-8')
      }
      d.prepare('UPDATE notes SET content = ?, is_encrypted = 1 WHERE id = ?').run(encrypted, row.id)
    }
    d.prepare('UPDATE notebooks SET password_protected = 1 WHERE id = ?').run(notebookId)
    // 缓存 key
    const firstNote = d.prepare('SELECT content FROM notes WHERE notebook_id = ? AND is_encrypted = 1 AND is_deleted = 0 LIMIT 1').get(notebookId) as any
    if (firstNote?.content) {
      const obj = JSON.parse(firstNote.content)
      cacheKey(notebookId, password, obj.salt)
    }
  },

  /** 移除笔记本密码：解密所有笔记内容 */
  removeNotebookPassword(notebookId: string, password: string): boolean {
    const d = getDatabase()
    const notes = d.prepare('SELECT * FROM notes WHERE notebook_id = ? AND is_deleted = 0').all() as any[]
    for (const row of notes) {
      const { content } = resolveNoteContent(row)
      if (!content || !isEncryptedContent(content)) continue
      const decrypted = decryptNoteContent(content, password)
      if (decrypted === null) return false
      if (row.path && fs.existsSync(row.path) && row.format !== 'url' && row.format !== 'file') {
        fs.writeFileSync(row.path, decrypted, 'utf-8')
      }
      d.prepare('UPDATE notes SET content = ?, is_encrypted = 0 WHERE id = ?').run(decrypted, row.id)
    }
    d.prepare('UPDATE notebooks SET password_protected = 0 WHERE id = ?').run(notebookId)
    removeCachedKey(notebookId)
    return true
  },

  /** 验证密码并缓存 key（供查看笔记时解密用） */
  unlockNotebook(notebookId: string, password: string): boolean {
    const row = getDatabase().prepare('SELECT content FROM notes WHERE notebook_id = ? AND is_encrypted = 1 AND is_deleted = 0 LIMIT 1').get(notebookId) as any
    if (!row?.content) return false
    try {
      const obj = JSON.parse(row.content)
      if (!obj.salt) return false
      cacheKey(notebookId, password, obj.salt)
      // 验证：尝试解密
      const test = decryptNoteContent(row.content, password)
      if (test === null) {
        removeCachedKey(notebookId)
        return false
      }
      return true
    } catch {
      return false
    }
  }
}

// 把方法挂到 db 对象上方便调用
export const dbApi = dbMethods

/** 在 dir 下递归搜索匹配 fileName 的文件，返回第一个匹配的路径 */
export function findFileRecursively(dir: string, fileName: string): string | null {
  if (!fs.existsSync(dir)) return null
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === fileName) {
      return full
    }
    if (entry.isDirectory()) {
      const found = findFileRecursively(full, fileName)
      if (found) return found
    }
  }
  return null
}

/**
 * 读取笔记内容，同时修复失效的 path。
 * 返回 { content, fixedPath }，其中 fixedPath 为实际找到的文件路径（如有）。
 */
function resolveNoteContent(row: any): { content: string; fixedPath?: string } {
  let content = ''
  let fixedPath: string | undefined

  // 有独立文件的格式（md/html/code）
  if (row.format !== 'file' && row.format !== 'url' && row.format !== 'richtext' && row.path) {
    if (fs.existsSync(row.path)) {
      try { content = fs.readFileSync(row.path, 'utf-8') } catch {}
    }
    // path 失效：尝试在当前 notebook 目录甚至全局搜索
    if (!content) {
      const ext = row.format === 'html' ? 'html' : row.format === 'code' ? 'code' : 'md'
      const fileName = path.basename(row.path) || `${slugify(row.title)}.${ext}`
      const nbDir = getNotebookPath(row.notebook_id)
      let found = findFileRecursively(nbDir, fileName)
      if (!found) {
        found = findFileRecursively(getNotesDir(), fileName)
      }
      if (found) {
        try { content = fs.readFileSync(found, 'utf-8') } catch {}
        if (content) fixedPath = found
      }
    }
  }

  // 文件读取失败（或没有文件）时回退到 SQLite 中的 content
  if (!content && row.content) {
    content = row.content
  }
  return { content, fixedPath }
}

/**
 * 修复笔记路径：启动时扫描，如果 DB 中的 path 对应的文件不存在，
 * 则在对应 notebook 目录下递归搜索匹配的文件并更新 path。
 * 用于处理笔记本移动/删除后路径错乱的情况。
 */
export function repairNotePaths(): void {
  const d = getDatabase()
  const notes = d.prepare('SELECT id, title, notebook_id, format, path FROM notes WHERE is_deleted = 0').all() as any[]
  let fixed = 0
  for (const note of notes) {
    if (note.format === 'file' || note.format === 'url') continue
    if (note.path && fs.existsSync(note.path)) continue

    const ext = note.format === 'html' ? 'html' : note.format === 'code' ? 'code' : 'md'
    const fileName = note.path ? path.basename(note.path) : `${slugify(note.title)}.${ext}`

    // 1. 在当前 notebook 目录下搜索
    const nbDir = getNotebookPath(note.notebook_id)
    let found = findFileRecursively(nbDir, fileName)

    // 2. 如果找不到，在整个 notes 目录下全局搜索
    if (!found) {
      found = findFileRecursively(getNotesDir(), fileName)
    }

    if (found) {
      d.prepare('UPDATE notes SET path = ? WHERE id = ?').run(found, note.id)
      console.log('[db] repairNotePaths: fixed path for', note.title, '->', found)
      fixed++
    } else {
      console.warn('[db] repairNotePaths: file not found for', note.title, 'in', nbDir, 'or', getNotesDir())
    }
  }
  if (fixed > 0) {
    console.log(`[db] repairNotePaths: fixed ${fixed} note paths`)
  }
}

/**
 * 通用重排工具：把 [tableName] 中 [scopeColumn] = [scopeValue] 的记录按 [orderedIds] 重排。
 * 使用"前后取中值"算法：相邻两个 sortOrder 之间插入中点。步长细化到极限时（< 1ms），
 * 整组重写为基于 created_at 的等差数列，避免无限小数。
 */
function reorderRows(
  tableName: 'notes' | 'notebooks',
  scopeColumn: 'notebook_id' | 'parent_id',
  scopeValue: string | null,
  orderedIds: string[]
): void {
  if (orderedIds.length === 0) return
  const d = getDatabase()
  const idList = orderedIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
  const rows = d.prepare(
    `SELECT id, sort_order, created_at FROM ${tableName} WHERE id IN (${idList}) ${
      scopeValue === null ? '' : `AND ${scopeColumn} = ?`
    }`
  ).all(...(scopeValue === null ? [] : [scopeValue])) as { id: string; sort_order: number | null; created_at: number }[]

  // 验证：orderedIds 必须完整覆盖 scope 下的所有记录（防漂移）
  if (rows.length !== orderedIds.length) {
    console.warn(`[reorderRows] ${tableName} id mismatch: got ${rows.length}, expected ${orderedIds.length}`)
    return
  }

  const byId = new Map(rows.map(r => [r.id, r]))
  // 按新顺序生成新 sortOrder
  const newOrders: number[] = []
  for (let i = 0; i < orderedIds.length; i++) {
    const cur = byId.get(orderedIds[i])!
    const prev = newOrders[newOrders.length - 1]
    if (i === 0) {
      // 第一项：如果已有 sortOrder，沿用；否则用 created_at
      newOrders.push(cur.sort_order ?? cur.created_at)
    } else {
      const next = cur.sort_order ?? cur.created_at
      // 取中值；如果中值跟 prev 一样（整数空间用尽），后面统一重写
      const mid = (prev + next) / 2
      newOrders.push(mid === prev ? NaN : mid)
    }
  }

  // 检测是否有 NaN（需要整组重排）
  if (newOrders.some(o => Number.isNaN(o))) {
    // 整组重写：用 created_at 加上步长，给一个稳定但可继续插值的序列
    const base = Math.max(...rows.map(r => r.created_at))
    const step = 1 // 1ms 步长
    for (let i = 0; i < orderedIds.length; i++) {
      newOrders[i] = base - i * step
    }
  }

  const update = d.prepare(`UPDATE ${tableName} SET sort_order = ? WHERE id = ?`)
  const tx = d.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      update.run(Math.floor(newOrders[i]), orderedIds[i])
    }
  })
  tx()
}

