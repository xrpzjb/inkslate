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
  autoSync: false
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      icon TEXT,
      is_deleted INTEGER DEFAULT 0,
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

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
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
    isDeleted: !!row.is_deleted
  }
}

function rowToNote(row: any, content: string = ''): Note {
  return {
    id: row.id,
    title: row.title,
    content,
    format: (row.format as Note['format']) ?? 'markdown',
    language: (row.language as Note['language']) ?? undefined,
    notebookId: row.notebook_id,
    parentId: row.parent_id,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    icon: row.icon,
    isDeleted: !!row.is_deleted
  }
}

const dbMethods = {
  listNotebooks(): Notebook[] {
    const rows = getDatabase().prepare('SELECT * FROM notebooks WHERE is_deleted = 0 ORDER BY created_at ASC').all()
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

  deleteNotebook(id: string): void {
    getDatabase().prepare('UPDATE notebooks SET is_deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  },

  moveNotebook(id: string, newParentId: string | null): void {
    getDatabase().prepare('UPDATE notebooks SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, Date.now(), id)
  },

  // ============ 笔记操作 ============
  listNotes(notebookId?: string): Note[] {
    const d = getDatabase()
    const rows = notebookId
      ? d.prepare('SELECT * FROM notes WHERE notebook_id = ? AND is_deleted = 0 ORDER BY updated_at DESC').all(notebookId)
      : d.prepare('SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC').all()
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

  createNote(title: string, notebookId: string, parentId: string | null, icon?: string, format: Note['format'] = 'markdown', language?: string): Note {
    const id = generateId()
    const now = Date.now()
    const ext = format === 'html' ? 'html' : format === 'richtext' ? 'json' : format === 'code' ? 'code' : 'md'
    const fileName = `${id}.${ext}`
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

    fs.writeFileSync(filePath, initialContent, 'utf-8')

    getDatabase().prepare(`
      INSERT INTO notes (id, title, notebook_id, parent_id, path, format, language, created_at, updated_at, icon, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, title, notebookId, parentId, filePath, format, language ?? null, now, now, icon ?? null)

    return { id, title, content: initialContent, format, language: language as any, notebookId, parentId, path: filePath, createdAt: now, updatedAt: now, icon, isDeleted: false }
  },

  updateNote(id: string, updates: Partial<Note>): Note {
    const d = getDatabase()
    const row = d.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!row) throw new Error(`Note ${id} not found`)

    const newTitle = updates.title ?? row.title
    const newIcon = updates.icon ?? row.icon
    const newFormat = updates.format ?? row.format ?? 'markdown'
    const now = Date.now()

    if (updates.content !== undefined) {
      fs.writeFileSync(row.path, updates.content, 'utf-8')
    }

    d.prepare(`
      UPDATE notes SET title = ?, icon = ?, format = ?, updated_at = ? WHERE id = ?
    `).run(newTitle, newIcon, newFormat, now, id)

    let content = ''
    try {
      content = fs.readFileSync(row.path, 'utf-8')
    } catch {}

    return rowToNote({ ...row, title: newTitle, icon: newIcon, format: newFormat, updated_at: now }, content)
  },

  deleteNote(id: string): void {
    const d = getDatabase()
    const row = d.prepare('SELECT path FROM notes WHERE id = ?').get(id) as any
    if (row?.path && fs.existsSync(row.path)) {
      try { fs.unlinkSync(row.path) } catch {}
    }
    d.prepare('UPDATE notes SET is_deleted = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  },

  moveNote(id: string, newParentId: string | null): void {
    getDatabase().prepare('UPDATE notes SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, Date.now(), id)
  },

  searchNotes(keyword: string): Note[] {
    const d = getDatabase()
    const rows = d.prepare('SELECT * FROM notes WHERE title LIKE ? AND is_deleted = 0 ORDER BY updated_at DESC LIMIT 50').all(`%${keyword}%`)
    return rows.map((row: any) => rowToNote(row))
  },

  // ============ 设置 ============
  getSettings(): AppSettings {
    const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get('app_settings') as { value: string } | undefined
    if (!row) return DEFAULT_SETTINGS
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) }
    } catch {
      return DEFAULT_SETTINGS
    }
  },

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    const merged = { ...current, ...updates, layout: { ...current.layout, ...(updates.layout ?? {}) }, oss: { ...current.oss, ...(updates.oss ?? {}) } }
    getDatabase().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('app_settings', JSON.stringify(merged))
    return merged
  }
}

// 把方法挂到 db 对象上方便调用
export const dbApi = dbMethods
