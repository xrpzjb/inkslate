import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import * as git from 'isomorphic-git'
// @ts-ignore - isomorphic-git/http/node 无类型声明
import http from 'isomorphic-git/http/node'
import { AppSettings, Note } from '../../shared/types'
import { dbApi, getNotesDir, getNotebookPath, getNotebookFilePath, slugify, getUniqueFileName, findFileRecursively } from '../db'

/**
 * 在目录中查找匹配 slug 的文件（用于 git pull 后修复被损坏的 DB 路径）
 * 按优先级：slug.ext → slug-N.ext → slug_N.ext
 */
function findFileBySlug(dir: string, slug: string, ext: string): string | null {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  // 精确匹配 slug.ext
  const exact = files.find(f => f === `${slug}.${ext}`)
  if (exact) return path.join(dir, exact)
  // 模糊匹配 slug-N.ext
  const pattern = new RegExp(`^${slug}-\\d+\\.${ext}$`)
  const suffix = files.find(f => pattern.test(f))
  if (suffix) return path.join(dir, suffix)
  return null
}

/**
 * Git 同步管理器
 * - 单例
 * - 封装 isomorphic-git 在 userData/notes 工作区的操作
 * - token 用 safeStorage 加密存
 * - 提供 init / clone / commit / push / pull / log / showFile
 *
 * 数据模型：Git 为 source of truth，SQLite 为缓存（reconcile 见 reconcile.ts）
 * 工作区结构（目录式）：
 *   .inkslate/notebooks.json
 *   notes/{id}/meta.json + content.{ext}
 *   files/{id}/meta.json + file.{ext}
 */
export class GitManager {
  private static instance: GitManager | null = null
  private config: AppSettings['gitSync'] | null = null
  private decryptedToken: string = ''

  static getInstance(): GitManager {
    if (!GitManager.instance) {
      GitManager.instance = new GitManager()
    }
    return GitManager.instance
  }

  private constructor() {
    try {
      const settings = dbApi.getSettings?.()
      if (settings?.gitSync?.configured) {
        this.configure(settings.gitSync)
      }
    } catch (e) {
      console.error('GitManager init failed:', e)
    }
  }

  /** 工作区目录 = userData/notes */
  getWorkDir(): string {
    return getNotesDir()
  }

  /** 是否已配置（URL + token 都填了） */
  isConfigured(): boolean {
    return !!(this.config?.configured && this.config.repoUrl && this.decryptedToken)
  }

  /** 工作区是否已 git init（.git 目录存在） */
  isInitialized(): boolean {
    return fs.existsSync(path.join(this.getWorkDir(), '.git'))
  }

  /**
   * 配置 Git：解密 token，保存到内存
   */
  configure(config: AppSettings['gitSync']): void {
    let decryptedToken = ''
    if (config.encryptedToken && safeStorage.isEncryptionAvailable()) {
      try {
        decryptedToken = safeStorage.decryptString(Buffer.from(config.encryptedToken, 'base64'))
      } catch (e) {
        console.error('decrypt git token failed:', e)
      }
    }
    this.decryptedToken = decryptedToken
    this.config = { ...config }
  }

  /** 暴露给 IPC：保存配置时调，先把密码/token 加密再写库 */
  saveConfig(repoUrl: string, branch: string, authorName: string, authorEmail: string, username: string, token: string): AppSettings['gitSync'] {
    // 检测 SSH URL：isomorphic-git 只支持 HTTP/HTTPS，不支持 SSH
    const sshHint = this.detectSshUrl(repoUrl)
    if (sshHint) {
      throw new Error(sshHint)
    }
    let encryptedToken: string | undefined
    if (token && safeStorage.isEncryptionAvailable()) {
      encryptedToken = safeStorage.encryptString(token).toString('base64')
    }
    const newConfig: AppSettings['gitSync'] = {
      repoUrl,
      branch: branch || 'main',
      authorName: authorName || 'inkslate',
      authorEmail: authorEmail || 'inkslate@local',
      username: username || '',
      encryptedToken,
      configured: !!(repoUrl && username && token),
      initialized: this.isInitialized()
    }
    // 写库
    dbApi.updateSettings({ gitSync: newConfig })
    // 内存同步
    this.configure(newConfig)
    return newConfig
  }

  /**
   * 检测 SSH 格式 URL。isomorphic-git 只支持 HTTP/HTTPS，不支持 SSH。
   * 返回错误提示字符串；返回空表示 URL 格式 OK。
   */
  private detectSshUrl(url: string): string {
    if (!url) return ''
    const trimmed = url.trim()
    // SSH 格式1：user@host:path  （如 zjb@homework.linkall.top:/home/git/repo.git）
    // SSH 格式2：ssh://user@host:port/path
    if (/^[\w.-]+@[\w.-]+:/.test(trimmed) || /^ssh:\/\//i.test(trimmed)) {
      return `不支持 SSH 协议（${trimmed}）。isomorphic-git 只支持 HTTP/HTTPS。\n请改用 HTTPS URL，例如：https://homework.linkall.top/.../note20260708.git\n（HTTPS 路径取决于你的 Git 服务器配置，通常在 Gitea/GitLab 仓库页面点"HTTPS"按钮复制）`
    }
    return ''
  }

  /** isomorphic-git 认证回调：username + password（password 可以是账号密码或 token） */
  private auth = () => {
    return {
      username: this.config?.username || this.config?.authorName || 'oauth2',
      password: this.decryptedToken
    }
  }

  /** 当前 author */
  private author() {
    const now = Math.floor(Date.now() / 1000)
    return {
      name: this.config?.authorName || 'inkslate',
      email: this.config?.authorEmail || 'inkslate@local',
      timestamp: now
    }
  }

  /** 当前 committer（同 author） */
  private committer() {
    return this.author()
  }

  // ============ 仓库初始化 ============

  /** git init + 配置 user + 初始空 commit */
  async initRepo(): Promise<void> {
    const dir = this.getWorkDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    await git.init({ fs, dir, defaultBranch: this.config?.branch || 'main' })
    // 初始空 commit（isomorphic-git 不支持 --allow-empty，先建一个 .gitignore）
    const gitignorePath = path.join(dir, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '# inkslate git sync\n', 'utf-8')
    }
    await git.add({ fs, dir, filepath: '.gitignore' })
    await git.commit({
      fs, dir,
      message: 'inkslate: initial commit',
      author: this.author(),
      committer: this.committer()
    })
    // 更新 initialized 状态
    this.markInitialized()
  }

  /** 从远端 clone 到工作区（工作区必须为空或不存在） */
  async cloneRepo(url: string): Promise<void> {
    const sshHint = this.detectSshUrl(url)
    if (sshHint) throw new Error(sshHint)
    const dir = this.getWorkDir()
    // clone 要求 dir 不存在或为空
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
      throw new Error('工作区非空，无法 clone。请先清空 notes 目录或备份后重试。')
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    await git.clone({
      fs, http, dir, url,
      ref: this.config?.branch || 'main',
      singleBranch: true,
      depth: 1,
      onAuth: this.auth
    })
    this.markInitialized()
    // clone 后全量替换本地 SQLite（clone 语义就是用远端覆盖本地，不做合并）
    try {
      const recon = this.replaceFromMetadata()
      if (recon.notebooksApplied || recon.notesApplied) {
        console.log(`[git] clone: replaced ${recon.notebooksApplied} notebooks, ${recon.notesApplied} notes from metadata`)
      }
    } catch (e) {
      console.error('[git] clone: replaceFromMetadata failed (non-fatal):', e)
    }
  }

  /** 确保 remote origin 存在且指向配置的 repoUrl */
  private async ensureRemote(): Promise<void> {
    const dir = this.getWorkDir()
    const remotes = await git.listRemotes({ fs, dir }).catch(() => [] as { remote: string; url: string }[])
    const origin = remotes.find(r => r.remote === 'origin')
    if (!origin) {
      await git.addRemote({ fs, dir, remote: 'origin', url: this.config!.repoUrl })
    } else if (origin.url !== this.config!.repoUrl) {
      // URL 变了，更新
      await git.deleteRemote({ fs, dir, remote: 'origin' }).catch(() => {})
      await git.addRemote({ fs, dir, remote: 'origin', url: this.config!.repoUrl })
    }
  }

  // ============ 提交 ============

  /** 拿工作区变更状态：返回有变更的文件路径列表 */
  async status(): Promise<{ filepath: string; status: string }[]> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) return []
    const matrix = await git.statusMatrix({ fs, dir })
    // matrix: [[filepath, HEAD, WORKDIR, STAGE], ...]
    // HEAD/WORKDIR/STAGE: 0=absent 1=tree 2=modified 3=added
    const changes: { filepath: string; status: string }[] = []
    for (const [filepath, head, workdir, stage] of matrix) {
      // 跳过 .git 目录（isomorphic-git 默认不返回）
      if (filepath === '.git' || filepath.startsWith('.git/')) continue
      if (head === 1 && workdir === 2) changes.push({ filepath, status: 'modified' })
      else if (head === 1 && workdir === 0) changes.push({ filepath, status: 'deleted' })
      else if (head === 0 && workdir === 2) changes.push({ filepath, status: 'new' })
      else if (head === 0 && workdir === 1) changes.push({ filepath, status: 'untracked' })
    }
    return changes
  }

  /** add 所有变更文件 + commit */
  async commitAll(message: string): Promise<string | null> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) throw new Error('Git 仓库未初始化')

    // ⚠️ 空库/残缺防覆盖（最后防线，防止把空或残缺元数据推上远端把线上覆盖掉）
    //
    // 事故复盘：本地 DB 为空（坏 clone / 新机器）时，如果直接 exportMetadata →
    // commit → push，会把 .inkslate/notes.json 覆盖成空并推上远端，线上 112 条
    // 笔记的元数据一夜变空。此防护必须放在 commitAll 里（仅推送/一键同步都会经过这里），
    // 并且 countNotesInHead 之前因 readBlob 无法解析 'HEAD' 而恒返回 0，导致防护从未生效。
    //
    // 规则：以 git HEAD 元数据（或工作区元数据）中的笔记数为基线，本地 DB 少于基线
    // 就先用元数据恢复本地 DB；恢复后仍不够则中止提交，绝不用残缺数据覆盖远端。
    const localNoteCount = dbApi.listActiveNotes().length
    const headNoteCount = await this.countNotesInHead()
    const workdirNoteCount = this.readWorkdirNotesCount()
    // 取两者中较大者作为"仓库应有的笔记数"参照（-1 = 读不到，忽略）
    const baseline = Math.max(headNoteCount, workdirNoteCount)
    if (baseline > 0 && localNoteCount < baseline) {
      console.warn(
        `[git] commitAll: 本地 DB 有 ${localNoteCount} 条笔记，少于元数据基线 ${baseline} 条（HEAD=${headNoteCount}, 工作区=${workdirNoteCount}），先从 HEAD 恢复本地 DB`
      )
      try {
        await this.restoreWorkdirFromHead()
        this.reconcileFromMetadata()
      } catch (e) {
        console.error('[git] commitAll: 恢复本地 DB 失败', e)
      }
      const afterCount = dbApi.listActiveNotes().length
      if (afterCount < baseline) {
        throw new Error(
          `本地数据库只有 ${afterCount} 条笔记，但 git 元数据有 ${baseline} 条，已中止提交，避免用残缺数据覆盖远端。请先执行"仅拉取"把远端笔记拉下来`
        )
      }
      console.log(`[git] commitAll: 已从 HEAD 恢复本地 DB 至 ${afterCount} 条笔记`)
    }

    // 关键：在 add 之前先导出 .inkslate/notebooks.json + notes.json
    // —— Git 是 source of truth，新机器拉取后靠这俩 metadata 重建 SQLite
    this.exportMetadata()

    const changes = await this.status()
    if (changes.length === 0) return null // 无变更不 commit

    for (const { filepath, status } of changes) {
      if (status === 'deleted') {
        await git.remove({ fs, dir, filepath })
      } else {
        await git.add({ fs, dir, filepath })
      }
    }

    const oid = await git.commit({
      fs, dir,
      message,
      author: this.author(),
      committer: this.committer()
    })
    return oid
  }

  // ============ 元数据导出/导入（Git 是 source of truth） ============

  /**
   * 把当前 SQLite 里的 notebook / note 元数据写到 .inkslate/notebooks.json / notes.json
   * 每次 commitAll 前自动调一次，确保 push 出去的 commit 带着最新的元数据
   *
   * 注意：content 字段不入 metadata —— 笔记内容在 notes/<path>/<slug>.<ext> 文件里
   */
  exportMetadata(): void {
    const dir = this.getWorkDir()
    const inkslateDir = path.join(dir, '.inkslate')
    try { fs.mkdirSync(inkslateDir, { recursive: true }) } catch {}

    const notebooks = dbApi.listActiveNotebooks()
    console.log(`[git] exportMetadata: writing ${notebooks.length} notebooks:`, notebooks.map(n => ({ id: n.id, name: n.name, parentId: n.parentId })))
    fs.writeFileSync(
      path.join(inkslateDir, 'notebooks.json'),
      JSON.stringify({
        version: 1,
        notebooks: notebooks.map(nb => ({
          id: nb.id,
          name: nb.name,
          parent_id: nb.parentId,
          icon: nb.icon ?? null,
          created_at: nb.createdAt,
          updated_at: nb.updatedAt,
          sort_order: nb.sortOrder
        }))
      }, null, 2),
      'utf-8'
    )

    const notes = dbApi.listActiveNotes()
    fs.writeFileSync(
      path.join(inkslateDir, 'notes.json'),
      JSON.stringify({
        version: 1,
        notes: notes.map(n => ({
          id: n.id,
          title: n.title,
          notebook_id: n.notebookId,
          parent_id: n.parentId,
          path: n.path ?? null,
          format: n.format,
          language: n.language ?? null,
          url: n.url ?? null,
          file_name: n.fileName ?? null,
          file_path: n.filePath ?? null,
          file_ext: n.fileExt ?? null,
          file_size: n.fileSize ?? null,
          icon: n.icon ?? null,
          created_at: n.createdAt,
          updated_at: n.updatedAt,
          sort_order: n.sortOrder
        }))
      }, null, 2),
      'utf-8'
    )

    const flashThoughts = dbApi.listFlashThoughts()
    fs.writeFileSync(
      path.join(inkslateDir, 'flash_thoughts.json'),
      JSON.stringify({
        version: 1,
        flash_thoughts: flashThoughts.map(ft => ({
          id: ft.id,
          content: ft.content,
          created_at: ft.createdAt,
          updated_at: ft.updatedAt
        }))
      }, null, 2),
      'utf-8'
    )
  }

  /**
   * Pull 完成后从 .inkslate/notebooks.json + notes.json 重建本地 SQLite
   * 让另一台机器（或者误删本地 DB 后）能从 git 历史恢复完整树
   *
   * 行为（增量合并，绝不清空本地数据）：
   *  - 文件不存在 → 不动（老版本 git 仓库没有这俩文件 → 当 legacy 处理）
   *  - 文件存在 → 仅 INSERT/UPDATE 远端有的记录，本地独有的记录保留不动
   *  - 笔记的 `path` / `file_path` 优先用元数据中保存的原始值，仅当文件在磁盘上不存在时
   *    才按 notebook_id + title + format 重新计算（防止同一台机器上 pull 后文件名错乱）
   *  - content 字段：优先保留本地已有 content，避免清空 url/richtext 等无文件笔记内容
   *
   * ⚠️ 此函数只在 pull 真正拉取到新 commit 时才被调用（见 pull()），
   *    且只做增量合并，不会 DELETE 本地数据，因此不会造成数据丢失。
   */
  reconcileFromMetadata(): { notebooksApplied: number; notesApplied: number } {
    const dir = this.getWorkDir()
    const inkslateDir = path.join(dir, '.inkslate')
    const nbFile = path.join(inkslateDir, 'notebooks.json')
    const noteFile = path.join(inkslateDir, 'notes.json')
    if (!fs.existsSync(nbFile) || !fs.existsSync(noteFile)) {
      return { notebooksApplied: 0, notesApplied: 0 }
    }

    let nbData: any
    let noteData: any
    try {
      nbData = JSON.parse(fs.readFileSync(nbFile, 'utf-8'))
      noteData = JSON.parse(fs.readFileSync(noteFile, 'utf-8'))
    } catch (e) {
      console.error('[git] reconcileFromMetadata: failed to parse JSON', e)
      return { notebooksApplied: 0, notesApplied: 0 }
    }

    const notebooks = Array.isArray(nbData.notebooks) ? nbData.notebooks : []
    const notes = Array.isArray(noteData.notes) ? noteData.notes : []

    // ⚠️ 防护：如果远端的 notes.json 是空的，但本地 DB 有笔记，
    // 说明 notes.json 是本地 exportMetadata() 写的（git 还没同步或从未提交）。
    // 这种情况下不应该清空本地笔记——否则 git 还没同步时启动一次就会丢数据。
    // 场景：用户在 A 端写了很多笔记但还没 push，本地 .inkslate/notes.json 是空的，
    // 此时启动 app → exportMetadata() 写成空文件 → reconcileFromMetadata() → 全没了。
    const localNoteCount = dbApi.listActiveNotes().length
    if (notes.length === 0 && localNoteCount > 0) {
      console.warn(
        `[git] reconcile: notes.json is empty but local DB has ${localNoteCount} notes. ` +
        `Skipping reconciliation to avoid data loss. ` +
        `This may happen if notes haven't been committed to git yet.`
      )
      return { notebooksApplied: 0, notesApplied: 0 }
    }

    // 1. 增量合并 notebooks 表（绝不 DELETE 本地数据）
    //    mergeNotebooks 返回远端 id → 本地 id 的重定向映射（同名去重时用）
    const notebookRemap = dbApi.mergeNotebooks(notebooks.map((nb: any) => ({
      id: nb.id,
      name: nb.name,
      parentId: nb.parent_id ?? null,
      icon: nb.icon,
      createdAt: nb.created_at,
      updatedAt: nb.updated_at,
      sortOrder: nb.sort_order
    })))
    console.log(`[git] reconcile: merged ${notebooks.length} remote notebooks, remap:`, JSON.stringify(notebookRemap))
    console.log(`[git] reconcile: local notebook count after merge: ${dbApi.listActiveNotebooks().length}`)

    // 2. 替换 notes 表
    //
    // 路径策略（按优先级）：
    //   ① 本地 DB 已有该笔记且 path 指向真实文件 → 保留（避免已损坏的 DB 再次被覆盖）
    //   ② 元数据中有 path 且文件在磁盘上 → 使用（远端同步来的正确路径）
    //   ③ 扫描笔记本目录，找 slug 匹配的文件 → 使用（修复已损坏的 path）
    //   ④ getUniqueFileName 重新算（仅用于跨机器恢复等场景）
    //
    // 先读取本地 DB 现有路径作为"锚点"
    const existingNotePaths = new Map<string, { path: string | null; filePath: string | null }>()
    try {
      for (const en of dbApi.listActiveNotes()) {
        existingNotePaths.set(en.id, { path: en.path ?? null, filePath: en.filePath ?? null })
      }
    } catch {}

    const finalNotes = notes.map((n: any) => {
      // 如果 notebook 被同名去重，把笔记的 notebook_id 重定向到本地 id
      const effectiveNotebookId = notebookRemap[n.notebook_id] ?? n.notebook_id
      const ext = n.format === 'html' ? 'html' : n.format === 'richtext' ? 'json' : n.format === 'code' ? 'code' : n.format === 'url' ? 'url' : n.format === 'file' ? 'file' : 'md'
      const nbDir = getNotebookPath(effectiveNotebookId)

      // === 笔记内容文件路径 ===
      const existing = existingNotePaths.get(n.id)
      let notePath: string | null = null

      // ① 本地 DB 路径且文件存在
      if (existing?.path && fs.existsSync(existing.path)) {
        notePath = existing.path
      }
      // ② 元数据路径且文件存在
      if (!notePath && n.path && fs.existsSync(n.path)) {
        notePath = n.path
      }
      // ③ 扫描目录找 slug 匹配的文件
      if (!notePath) {
        try {
          const slug = slugify(n.title)
          const found = findFileBySlug(nbDir, slug, ext)
          if (found) notePath = found
        } catch {}
      }
      // ③.5 递归搜索：用文件名在整个 notebook 目录乃至 notes 目录搜索
      if (!notePath) {
        try {
          const fileName = n.path ? path.basename(n.path) : `${slugify(n.title)}.${ext}`
          let found = findFileRecursively(nbDir, fileName)
          if (!found) found = findFileRecursively(getNotesDir(), fileName)
          if (found) notePath = found
        } catch {}
      }
      // ④ getUniqueFileName 兜底
      if (!notePath) {
        try {
          const slug = slugify(n.title)
          const unique = getUniqueFileName(slug, ext, nbDir)
          notePath = path.join(nbDir, unique)
        } catch (e) {
          console.error('[git] reconcile: failed to compute path for', n.id, e)
        }
      }

      // === 文件笔记源文件路径 ===
      let filePath: string | null = null
      if (n.format === 'file' && n.file_name) {
        // ① 本地 DB 路径且文件存在
        if (existing?.filePath && fs.existsSync(existing.filePath)) {
          filePath = existing.filePath
        }
        // ② 元数据路径且文件存在
        if (!filePath && n.file_path && fs.existsSync(n.file_path)) {
          filePath = n.file_path
        }
        // ③ 扫描目录
        if (!filePath) {
          try {
            const fp = getNotebookFilePath(effectiveNotebookId)
            const fileSlug = slugify(n.file_name.replace(/\.[^.]+$/, ''))
            const fileExt = n.file_ext || 'bin'
            const found = findFileBySlug(fp, fileSlug, fileExt)
            if (found) filePath = found
          } catch {}
        }
        // ④ getUniqueFileName 兜底
        if (!filePath) {
          try {
            const fp = getNotebookFilePath(effectiveNotebookId)
            const fileExt = n.file_ext || 'bin'
            const fileSlug = slugify(n.file_name.replace(/\.[^.]+$/, ''))
            const uniqueFile = getUniqueFileName(fileSlug, fileExt, fp)
            filePath = path.join(fp, uniqueFile)
          } catch {}
        }
      }
      return {
        id: n.id,
        title: n.title,
        notebookId: effectiveNotebookId,
        parentId: n.parent_id,
        path: notePath,
        format: n.format,
        language: n.language,
        url: n.url,
        fileName: n.file_name,
        filePath,
        fileExt: n.file_ext,
        fileSize: n.file_size,
        icon: n.icon,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
        sortOrder: n.sort_order
      }
    })
    dbApi.mergeNotes(finalNotes)
    console.log(`[git] reconcile: merged ${finalNotes.length} remote notes, local note count after: ${dbApi.listActiveNotes().length}`)

    // 3. 闪念：增量合并（本地有远端无的保留，远端有本地无的新增，id 冲突用远端覆盖）
    const ftFile = path.join(inkslateDir, 'flash_thoughts.json')
    let flashThoughtsApplied = 0
    if (fs.existsSync(ftFile)) {
      try {
        const ftData = JSON.parse(fs.readFileSync(ftFile, 'utf-8'))
        const remoteFts = Array.isArray(ftData.flash_thoughts) ? ftData.flash_thoughts : []
        const localIds = new Set(dbApi.listFlashThoughts().map(f => f.id))
        for (const ft of remoteFts) {
          if (!localIds.has(ft.id)) {
            dbApi.createFlashThought(ft.content)
            flashThoughtsApplied++
          }
        }
      } catch (e) {
        console.error('[git] reconcile: failed to parse flash_thoughts.json', e)
      }
    }
    console.log(`[git] reconcile: merged ${flashThoughtsApplied} remote flash thoughts`)

    return { notebooksApplied: notebooks.length, notesApplied: notes.length }
  }

  /**
   * 全量替换本地 SQLite（clone 用）
   * 与 reconcileFromMetadata 的区别：直接 DELETE 本地活跃记录再 INSERT，
   * 不做增量合并。clone 的语义就是用远端覆盖本地，不需要保留本地数据。
   *
   * 路径策略同 reconcileFromMetadata（见上）。
   */
  replaceFromMetadata(): { notebooksApplied: number; notesApplied: number } {
    const dir = this.getWorkDir()
    const inkslateDir = path.join(dir, '.inkslate')
    const nbFile = path.join(inkslateDir, 'notebooks.json')
    const noteFile = path.join(inkslateDir, 'notes.json')
    if (!fs.existsSync(nbFile) || !fs.existsSync(noteFile)) {
      return { notebooksApplied: 0, notesApplied: 0 }
    }

    let nbData: any
    let noteData: any
    try {
      nbData = JSON.parse(fs.readFileSync(nbFile, 'utf-8'))
      noteData = JSON.parse(fs.readFileSync(noteFile, 'utf-8'))
    } catch (e) {
      console.error('[git] replaceFromMetadata: failed to parse JSON', e)
      return { notebooksApplied: 0, notesApplied: 0 }
    }

    const notebooks = Array.isArray(nbData.notebooks) ? nbData.notebooks : []
    const notes = Array.isArray(noteData.notes) ? noteData.notes : []

    // 1. 全量替换 notebooks 表
    dbApi.replaceNotebooks(notebooks.map((nb: any) => ({
      id: nb.id,
      name: nb.name,
      parentId: nb.parent_id ?? null,
      icon: nb.icon,
      createdAt: nb.created_at,
      updatedAt: nb.updated_at,
      sortOrder: nb.sort_order
    })))

    // 2. 全量替换 notes 表（路径策略同 reconcileFromMetadata）
    const existingNotePaths = new Map<string, { path: string | null; filePath: string | null }>()
    try {
      for (const en of dbApi.listActiveNotes()) {
        existingNotePaths.set(en.id, { path: en.path ?? null, filePath: en.filePath ?? null })
      }
    } catch {}

    const finalNotes = notes.map((n: any) => {
      const ext = n.format === 'html' ? 'html' : n.format === 'richtext' ? 'json' : n.format === 'code' ? 'code' : n.format === 'url' ? 'url' : n.format === 'file' ? 'file' : 'md'
      const nbDir = getNotebookPath(n.notebook_id)
      const existing = existingNotePaths.get(n.id)
      let notePath: string | null = null

      if (existing?.path && fs.existsSync(existing.path)) {
        notePath = existing.path
      }
      if (!notePath && n.path && fs.existsSync(n.path)) {
        notePath = n.path
      }
      if (!notePath) {
        try {
          const slug = slugify(n.title)
          const found = findFileBySlug(nbDir, slug, ext)
          if (found) notePath = found
        } catch {}
      }
      if (!notePath) {
        try {
          const slug = slugify(n.title)
          const unique = getUniqueFileName(slug, ext, nbDir)
          notePath = path.join(nbDir, unique)
        } catch (e) {
          console.error('[git] replaceFromMetadata: failed to compute path for', n.id, e)
        }
      }

      let filePath: string | null = null
      if (n.format === 'file' && n.file_name) {
        if (existing?.filePath && fs.existsSync(existing.filePath)) {
          filePath = existing.filePath
        }
        if (!filePath && n.file_path && fs.existsSync(n.file_path)) {
          filePath = n.file_path
        }
        if (!filePath) {
          try {
            const fp = getNotebookFilePath(n.notebook_id)
            const fileSlug = slugify(n.file_name.replace(/\.[^.]+$/, ''))
            const fileExt = n.file_ext || 'bin'
            const found = findFileBySlug(fp, fileSlug, fileExt)
            if (found) filePath = found
          } catch {}
        }
        if (!filePath) {
          try {
            const fp = getNotebookFilePath(n.notebook_id)
            const fileExt = n.file_ext || 'bin'
            const fileSlug = slugify(n.file_name.replace(/\.[^.]+$/, ''))
            const uniqueFile = getUniqueFileName(fileSlug, fileExt, fp)
            filePath = path.join(fp, uniqueFile)
          } catch {}
        }
      }
      return {
        id: n.id,
        title: n.title,
        notebookId: n.notebook_id,
        parentId: n.parent_id,
        path: notePath,
        format: n.format,
        language: n.language,
        url: n.url,
        fileName: n.file_name,
        filePath,
        fileExt: n.file_ext,
        fileSize: n.file_size,
        icon: n.icon,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
        sortOrder: n.sort_order
      }
    })
    dbApi.replaceNotes(finalNotes)

    // 3. 闪念：全量替换
    const ftFileReplace = path.join(inkslateDir, 'flash_thoughts.json')
    if (fs.existsSync(ftFileReplace)) {
      try {
        const ftData = JSON.parse(fs.readFileSync(ftFileReplace, 'utf-8'))
        const remoteFts = Array.isArray(ftData.flash_thoughts) ? ftData.flash_thoughts : []
        for (const ft of dbApi.listFlashThoughts()) {
          dbApi.deleteFlashThought(ft.id)
        }
        for (const ft of remoteFts) {
          dbApi.createFlashThought(ft.content)
        }
      } catch (e) {
        console.error('[git] replaceFromMetadata: failed to parse flash_thoughts.json', e)
      }
    }

    console.log(`[git] replaceFromMetadata: replaced ${notebooks.length} notebooks, ${finalNotes.length} notes`)
    return { notebooksApplied: notebooks.length, notesApplied: notes.length }
  }

  // ============ 推送/拉取 ============

  /** push 到 origin/{branch} */
  async push(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) return { ok: false, message: 'Git 未配置' }
    if (!this.isInitialized()) return { ok: false, message: 'Git 仓库未初始化' }
    if (!this.decryptedToken) return { ok: false, message: 'Git 密码/Token 未配置，请打开 Git 设置填写' }
    const sshHint = this.detectSshUrl(this.config!.repoUrl)
    if (sshHint) return { ok: false, message: sshHint }
    const dir = this.getWorkDir()
    const branch = this.config?.branch || 'main'
    try {
      // 确保 remote origin 存在且 URL 正确
      await this.ensureRemote()
      const result = await git.push({
        fs, http, dir,
        remote: 'origin',
        ref: branch,
        onAuth: this.auth
      })
      // isomorphic-git push 返回 { ok, error? }
      if (result && !(result as any).ok) {
        return { ok: false, message: (result as any).error?.message || 'push 失败（可能需要先 pull）' }
      }
      return { ok: true, message: '推送成功' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'push 失败' }
    }
  }

  /**
   * 一键同步：pull → commit → push
   *
   * 为什么这个顺序：
   *   1. 先 pull 远端变更（新机器/重装后先从 git 恢复元数据），且只在 pull 拿到新 commit 时才
   *      增量合并本地 SQLite（绝不清空本地数据）
   *   2. 再 commit 本地变更（如果有）—— exportMetadata 把本地元数据写入工作区
   *   3. 最后 push 把本地 commit 推上去
   *
   * ⚠️ 关键防护：commit 在 pull 之后，避免空数据库的 exportMetadata 把远端元数据覆盖成空；
   *    且 reconcile 只在 updated 时触发、且只做增量合并，杜绝"本地空 → 覆盖远端 → 远端丢失"的循环。
   *
   * 错误处理：任一步失败立刻返回，不继续后续步骤。返回结构化 result 让 UI 区分阶段。
   *
   * 返回值：
   *   - ok: 是否整体成功（commit/pull/push 全成功）
   *   - message: 给用户看的整体消息
   *   - phase: 'commit' | 'pull' | 'push' —— 失败发生在哪个阶段
   *   - phases: { commit: 'ok'|'skipped'|'failed', pull: 'ok'|'up-to-date'|'failed', push: 'ok'|'up-to-date'|'failed' }
   *   - pulled: bool, pushed: bool —— 让 UI / 调用方知道哪几步实际动了数据
   */
  async sync(): Promise<{
    ok: boolean
    message: string
    phase?: 'commit' | 'pull' | 'push'
    phases?: { commit: 'ok' | 'skipped' | 'failed'; pull: 'ok' | 'up-to-date' | 'failed'; push: 'ok' | 'up-to-date' | 'failed' }
    pulled?: boolean
    pushed?: boolean
  }> {
    const phases: { commit: 'ok' | 'skipped' | 'failed'; pull: 'ok' | 'up-to-date' | 'failed'; push: 'ok' | 'up-to-date' | 'failed' } = {
      commit: 'skipped',
      pull: 'up-to-date',
      push: 'up-to-date'
    }
    // 预检
    if (!this.isConfigured()) {
      return { ok: false, message: 'Git 未配置', phases, phase: 'commit' }
    }
    if (!this.isInitialized()) {
      return { ok: false, message: 'Git 仓库未初始化', phases, phase: 'commit' }
    }
    if (!this.decryptedToken) {
      return { ok: false, message: 'Git 密码/Token 未配置，请打开 Git 设置填写', phases, phase: 'commit' }
    }
    const sshHint = this.detectSshUrl(this.config!.repoUrl)
    if (sshHint) {
      return { ok: false, message: sshHint, phases, phase: 'commit' }
    }

    // Step 1: pull 远端变更（新机器拉取后重建 SQLite）
    const pullResult = await this.pull()

    // Step 1.5 空库防覆盖防护（数据安全关键）
    //
    // 事故场景：本地 SQLite 为空（新机器 / DB 被误清），但 git HEAD 元数据里有完整数据。
    // 此时 pull 拿不到新 commit → reconcile 被跳过，随后 commitAll 的 exportMetadata
    // 会把空库导出成 .inkslate/*.json 并 push，直接覆盖远端完整数据（即本次事故根因）。
    //
    // 防护：若本地 DB 笔记数为 0 而 HEAD 元数据非空，先用 HEAD 元数据恢复本地 DB；
    //       若恢复后仍为空，则中止 sync，绝不把空数据推上远端。
    const localNoteCount = dbApi.listActiveNotes().length
    const headNoteCount = await this.countNotesInHead()
    if (localNoteCount === 0 && headNoteCount > 0) {
      console.warn(`[git] 空库防覆盖：本地 DB 有 ${localNoteCount} 条笔记，但 git HEAD 元数据有 ${headNoteCount} 条，先从元数据恢复本地 DB`)
      try {
        await this.restoreWorkdirFromHead()
        const recon = this.reconcileFromMetadata()
        console.log(`[git] 空库防覆盖：已从元数据恢复 ${recon.notesApplied} 条笔记 / ${recon.notebooksApplied} 个笔记本`)
      } catch (e) {
        console.error('[git] 空库防覆盖：恢复本地 DB 失败', e)
      }
      const afterCount = dbApi.listActiveNotes().length
      if (afterCount === 0) {
        phases.commit = 'failed'
        return {
          ok: false,
          message: `本地数据库为空但远端元数据存在 ${headNoteCount} 条笔记，已中止同步，避免用空数据覆盖远端`,
          phases,
          phase: 'commit'
        }
      }
    }

    // Step 2: commit 本地变更（如果有）
    // pull 必须在 commit 之前，否则空数据库的 exportMetadata 会覆盖远端元数据
    try {
      const oid = await this.commitAll(`sync: ${new Date().toLocaleString('zh-CN')}`)
      phases.commit = oid ? 'ok' : 'skipped'
    } catch (e: any) {
      phases.commit = 'failed'
      return { ok: false, message: e?.message ?? 'commit 失败', phases, phase: 'commit' }
    }
    if (!pullResult.ok) {
      phases.pull = 'failed'
      return { ok: false, message: '拉取失败：' + pullResult.message, phases, phase: 'pull' }
    }
    // pull 阶段标记为 'ok' 的条件：获取了新 commit，或者 reconcile 重建了数据
    phases.pull = (pullResult.updated || pullResult.reconciled) ? 'ok' : 'up-to-date'

    // Step 3: push（commit 或 pull 后通常都有新 commit 需要推上去）
    const pushResult = await this.push()
    if (!pushResult.ok) {
      phases.push = 'failed'
      return { ok: false, message: '推送失败：' + pushResult.message, phases, phase: 'push' }
    }
    // 推送成功 = 远端被更新了；如果刚 commit 没东西、pull 也是 up-to-date，push 会是 noop，
    // isomorphic-git push 在无 commit 时也返回 ok 视为成功
    phases.push = 'ok'

    // 拼一条总结给用户
    const parts: string[] = []
    if (phases.commit === 'ok') parts.push('已提交本地变更')
    if (phases.pull === 'ok') parts.push('已拉取远端更新')
    else if (phases.pull === 'up-to-date') parts.push('远端已是最新')
    parts.push('已推送到远端')
    return {
      ok: true,
      message: parts.join('，'),
      phases,
      pulled: phases.pull === 'ok',
      pushed: phases.push === 'ok'
    }
  }

  /** pull = fetch + merge（fastForward 优先，保持线性历史） */
  async pull(): Promise<{ ok: boolean; message: string; updated: boolean; reconciled: boolean }> {
    if (!this.isConfigured()) return { ok: false, message: 'Git 未配置', updated: false, reconciled: false }
    if (!this.isInitialized()) return { ok: false, message: 'Git 仓库未初始化', updated: false, reconciled: false }
    if (!this.decryptedToken) return { ok: false, message: 'Git 密码/Token 未配置，请打开 Git 设置填写', updated: false, reconciled: false }
    const sshHint = this.detectSshUrl(this.config!.repoUrl)
    if (sshHint) return { ok: false, message: sshHint, updated: false, reconciled: false }
    const dir = this.getWorkDir()
    const branch = this.config?.branch || 'main'
    try {
      // 确保 remote origin 存在且 URL 正确
      await this.ensureRemote()
      // 先记录 pull 前的本地分支 HEAD，用于判断是否真的拉到了新 commit
      // （isomorphic-git 1.38 的 git.pull 不返回任何结果，无法直接从返回值判断，
      //   只能比较 pull 前后 HEAD 是否变化 —— 快进合并或新建合并提交都会改变 HEAD）
      let headBefore: string | null = null
      try {
        headBefore = await git.resolveRef({ fs, dir, ref: branch })
      } catch {}

      // pull = fetch + merge，fastForward 模式（能 ff 就 ff，否则建 merge commit）
      await git.pull({
        fs, http, dir,
        ref: branch,
        remote: 'origin',
        remoteRef: branch,
        singleBranch: true,
        fastForward: true,
        author: this.author(),
        committer: this.committer(),
        onAuth: this.auth
      })

      // pull 后再次解析 HEAD，HEAD 变化即表示拉到了新 commit
      let headAfter: string | null = null
      try {
        headAfter = await git.resolveRef({ fs, dir, ref: branch })
      } catch {}
      const updated = !!headBefore && !!headAfter && headBefore !== headAfter

      // ⚠️ 关键护栏：只有在 pull 真正拉取到了新的 commit（updated === true）时，
      // 才根据远端元数据重建/合并本地 SQLite。
      //
      // 原因：远端元数据（.inkslate/*.json）可能是本地之前 exportMetadata 写出的、
      // 不完整甚至为空的内容（例如首次配置 git 时，本地空仓库被 push 上去）。
      // 如果无条件 reconcile，会把远端那份"残缺/空"的元数据当作真相覆盖本地，
      // 导致本地笔记被清空、随后又被 push 回远端 → 远程数据丢失的恶性循环。
      //
      // 只有当 fetch 拿到了别人写的真实 commit，才信任远端元数据并合并。
      let reconciled = false
      if (updated) {
        try {
          const recon = this.reconcileFromMetadata()
          if (recon.notebooksApplied || recon.notesApplied) {
            console.log(`[git] reconciled ${recon.notebooksApplied} notebooks, ${recon.notesApplied} notes from metadata`)
            reconciled = true
          }
        } catch (e) {
          console.error('[git] reconcile failed (non-fatal):', e)
        }
      } else {
        console.log('[git] pull: no new commits, skipping reconcile to avoid overwriting local data')
        // 空库恢复：本地 DB 为空但 HEAD 元数据有数据时，直接从元数据恢复。
        // 覆盖"clone 成功后 DB 重建失败 / 新机器尚未同步"等场景 —— 此时即便没有新 commit，
        // 也必须把远端已有的数据补进本地 DB，否则 UI 一直显示"已是最新"却一个笔记都没有。
        const localNoteCount = dbApi.listActiveNotes().length
        const headNoteCount = await this.countNotesInHead()
        if (localNoteCount === 0 && headNoteCount > 0) {
          console.warn(`[git] pull: 本地 DB 为空（${localNoteCount} 条），HEAD 元数据有 ${headNoteCount} 条，先从元数据恢复本地 DB`)
          try {
            await this.restoreWorkdirFromHead()
            const recon = this.reconcileFromMetadata()
            if (recon.notebooksApplied || recon.notesApplied) {
              console.log(`[git] pull: 已从元数据恢复 ${recon.notebooksApplied} 个笔记本 / ${recon.notesApplied} 条笔记`)
              reconciled = true
            }
          } catch (e) {
            console.error('[git] pull: 空库恢复失败 (non-fatal):', e)
          }
        }
      }

      return {
        ok: true,
        message: updated ? '拉取成功（有更新）' : reconciled ? '已从远端元数据恢复本地数据' : '已是最新',
        updated,
        reconciled
      }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'pull 失败', updated: false, reconciled: false }
    }
  }

  // ============ 历史快照 ============

  /** 拿指定路径（或全仓库）的提交历史 */
  async log(filepath?: string, maxCount: number = 50): Promise<{
    oid: string
    message: string
    author: { name: string; email: string; timestamp: number }
    committer: { name: string; email: string; timestamp: number }
  }[]> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) return []
    try {
      const opts: any = { fs, dir, depth: maxCount }
      if (filepath) opts.filepath = filepath
      const entries = await git.log(opts)
      return entries.map(e => ({
        oid: e.oid,
        message: e.commit.message,
        author: {
          name: e.commit.author.name,
          email: e.commit.author.email,
          timestamp: e.commit.author.timestamp
        },
        committer: {
          name: e.commit.committer.name,
          email: e.commit.committer.email,
          timestamp: e.commit.committer.timestamp
        }
      }))
    } catch (e) {
      return []
    }
  }

  /** 读指定 commit 的某个文件内容（文本）。
   *  oid 可以是完整 40 位哈希，也可以是 ref（如 'HEAD'）——isomorphic-git 1.38 的
   *  readBlob 不能直接解析 'HEAD' 这种 ref，必须先 resolveRef 成真实 oid。 */
  async showFile(oid: string, filepath: string): Promise<string | null> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) return null
    try {
      const resolvedOid = this.isFullOid(oid) ? oid : await git.resolveRef({ fs, dir, ref: oid })
      const { blob } = await git.readBlob({ fs, dir, oid: resolvedOid, filepath })
      return Buffer.from(blob).toString('utf-8')
    } catch (e) {
      return null
    }
  }

  /** 读指定 commit 的某个文件内容（二进制 Buffer，给附件用）。oid 同上可传 ref。 */
  async showFileBuffer(oid: string, filepath: string): Promise<Buffer | null> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) return null
    try {
      const resolvedOid = this.isFullOid(oid) ? oid : await git.resolveRef({ fs, dir, ref: oid })
      const { blob } = await git.readBlob({ fs, dir, oid: resolvedOid, filepath })
      return Buffer.from(blob)
    } catch (e) {
      return null
    }
  }

  /** 判断字符串是否已是完整 40 位十六进制 oid */
  private isFullOid(ref: string): boolean {
    return /^[0-9a-f]{40}$/i.test(ref)
  }

  // ============ 内部 ============

  /**
   * 统计 git HEAD 中 .inkslate/notes.json 的笔记条数
   * （空库防覆盖防护用：判断本地 DB 是否比 HEAD 元数据"空"很多）
   * 返回 -1 表示无法读取（HEAD 无该文件 / 读取失败）。
   */
  private async countNotesInHead(): Promise<number> {
    if (!this.isInitialized()) return -1
    try {
      const raw = await this.showFile('HEAD', '.inkslate/notes.json')
      if (raw == null) return -1
      const data = JSON.parse(raw)
      return Array.isArray(data.notes) ? data.notes.length : 0
    } catch (e) {
      return -1
    }
  }

  /** 读当前工作区 .inkslate/notes.json 的笔记条数；文件不存在/解析失败返回 -1 */
  private readWorkdirNotesCount(): number {
    const p = path.join(this.getWorkDir(), '.inkslate', 'notes.json')
    try {
      if (!fs.existsSync(p)) return -1
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      return Array.isArray(data.notes) ? data.notes.length : 0
    } catch (e) {
      return -1
    }
  }

  /**
   * 把 git HEAD 中的 .inkslate/*.json 恢复到工作区
   * （空库防覆盖防护用：恢复被本地空库 exportMetadata 覆盖掉的远端元数据）
   */
  private async restoreWorkdirFromHead(): Promise<void> {
    if (!this.isInitialized()) return
    const dir = this.getWorkDir()
    const inkslateDir = path.join(dir, '.inkslate')
    try { fs.mkdirSync(inkslateDir, { recursive: true }) } catch {}
    for (const name of ['notebooks.json', 'notes.json', 'flash_thoughts.json']) {
      const content = await this.showFile('HEAD', `.inkslate/${name}`)
      if (content != null) {
        fs.writeFileSync(path.join(inkslateDir, name), content, 'utf-8')
      }
    }
  }

  private markInitialized() {
    if (this.config) {
      const updated = { ...this.config, initialized: true }
      dbApi.updateSettings({ gitSync: updated })
      this.config = updated
    }
  }
}
