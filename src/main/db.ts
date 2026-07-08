import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Notebook, Note, AppSettings } from '../shared/types'

// 类型已经在函数内部使用，下面是接口占位
export type { Notebook, Note, AppSettings }

let db: Database.Database | null = null

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  fontSize: 14,
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
    icon: row.icon,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
    sortOrder: row.sort_order ?? row.created_at
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
    getDatabase().prepare('UPDATE notebooks SET name = ?, updated_at = ? WHERE id = ?').run(newName, Date.now(), id)
  },

  /**
   * 软删除笔记本：仅标记 is_deleted=1 + deleted_at=now
   * 不动子笔记的 is_deleted 状态——它们各自独立管理是否进回收站
   */
  deleteNotebook(id: string): void {
    getDatabase().prepare('UPDATE notebooks SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id)
  },

  moveNotebook(id: string, newParentId: string | null): void {
    getDatabase().prepare('UPDATE notebooks SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, Date.now(), id)
  },

  // ============ 笔记操作 ============
  listNotes(notebookId?: string): Note[] {
    const d = getDatabase()
    // 顺序：按 sort_order 倒序（sort_order 大的在前），未填的兜底为 created_at
    // —— 用户拖动改 sort_order；从未拖动时表现为按 created_at DESC
    const rows = notebookId
      ? d.prepare('SELECT * FROM notes WHERE notebook_id = ? AND is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) DESC').all(notebookId)
      : d.prepare('SELECT * FROM notes WHERE is_deleted = 0 ORDER BY COALESCE(sort_order, created_at) DESC').all()
    return rows.map((row: any) => rowToNote(row))
  },

  getNote(id: string): Note | null {
    const row = getDatabase().prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!row) return null
    let content = ''
    try {
      if (fs.existsSync(row.path)) {
        content = fs.readFileSync(row.path, 'utf-8')
      }
    } catch (e) {
      console.error('read note failed:', e)
    }
    return rowToNote(row, content)
  },

  createNote(title: string, notebookId: string, parentId: string | null, icon?: string, format: Note['format'] = 'markdown', language?: string, url?: string): Note {
    const id = generateId()
    const now = Date.now()
    const ext = format === 'html' ? 'html' : format === 'richtext' ? 'json' : format === 'code' ? 'code' : format === 'url' ? 'url' : format === 'file' ? 'file' : 'md'
    const slug = slugify(title)
    const fileName = getUniqueFileName(slug, ext, getNotesDir())
    const filePath = path.join(getNotesDir(), fileName)

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
   *  主进程把用户选的文件复制到 app data/notes/files/{id}.{ext}，
   *  再调本方法把文件路径写库。 */
  setNoteFile(id: string, opts: { filePath: string; fileName: string; fileSize: number; fileExt: string }): void {
    const now = Date.now()
    getDatabase().prepare(`
      UPDATE notes SET file_path = ?, file_name = ?, file_size = ?, file_ext = ?, updated_at = ? WHERE id = ?
    `).run(opts.filePath, opts.fileName, opts.fileSize, opts.fileExt, now, id)
  },

  updateNote(id: string, updates: Partial<Note>): Note {
    const d = getDatabase()
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!row) throw new Error(`Note ${id} not found`)

    const newTitle = updates.title ?? row.title
    const newIcon = updates.icon ?? row.icon
    const newFormat = updates.format ?? row.format ?? 'markdown'
    const newUrl = updates.url !== undefined ? updates.url : row.url
    // 文件笔记字段：仅在传了的时候更新（replace 流程会传，普通改 title 不动）
    const newFilePath = updates.filePath !== undefined ? updates.filePath : row.file_path
    const newFileName = updates.fileName !== undefined ? updates.fileName : row.file_name
    const newFileSize = updates.fileSize !== undefined ? updates.fileSize : row.file_size
    const newFileExt = updates.fileExt !== undefined ? updates.fileExt : row.file_ext
    const now = Date.now()

    // 标题变化时重命名磁盘文件（git 里也能看到可读的文件名）
    let newPath = row.path
    if (updates.title !== undefined && updates.title !== row.title && row.path) {
      const ext = newFormat === 'html' ? 'html' : newFormat === 'richtext' ? 'json' : newFormat === 'code' ? 'code' : newFormat === 'url' ? 'url' : newFormat === 'file' ? 'file' : 'md'
      const slug = slugify(newTitle)
      const newFileNameDisk = getUniqueFileName(slug, ext, getNotesDir(), row.path)
      const candidatePath = path.join(getNotesDir(), newFileNameDisk)
      if (candidatePath !== row.path) {
        try {
          fs.renameSync(row.path, candidatePath)
          newPath = candidatePath
        } catch (e) {
          console.error('rename note file failed:', e)
          // 重命名失败，保持旧路径
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
      UPDATE notes SET title = ?, icon = ?, format = ?, url = ?, file_path = ?, file_name = ?, file_size = ?, file_ext = ?, path = ?, updated_at = ? WHERE id = ?
    `).run(newTitle, newIcon, newFormat, newUrl ?? null, newFilePath, newFileName, newFileSize, newFileExt, newPath, now, id)

    let content = ''
    try {
      content = fs.readFileSync(newPath, 'utf-8')
    } catch {}

    return rowToNote({ ...row, title: newTitle, icon: newIcon, format: newFormat, url: newUrl, path: newPath, updated_at: now }, content)
  },

  /**
 * 软删除笔记：标记 is_deleted=1 + deleted_at=now
   * 重要：磁盘文件保留不动，以便后续还原能完整恢复内容
   */
  deleteNote(id: string): void {
    getDatabase().prepare('UPDATE notes SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id)
  },

  moveNote(id: string, newParentId: string | null): void {
    getDatabase().prepare('UPDATE notes SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, Date.now(), id)
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
  }
}

// 把方法挂到 db 对象上方便调用
export const dbApi = dbMethods

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

