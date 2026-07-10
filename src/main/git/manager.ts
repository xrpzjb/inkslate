import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import * as git from 'isomorphic-git'
// @ts-ignore - isomorphic-git/http/node 无类型声明
import http from 'isomorphic-git/http/node'
import { AppSettings, Note } from '../../shared/types'
import { dbApi, getNotesDir, getNotebookPath, getNotebookFilePath, slugify, getUniqueFileName } from '../db'

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
    fs.writeFileSync(
      path.join(inkslateDir, 'notebooks.json'),
      JSON.stringify({
        version: 1,
        exported_at: Date.now(),
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
        exported_at: Date.now(),
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
  }

  /**
   * Pull 完成后从 .inkslate/notebooks.json + notes.json 重建本地 SQLite
   * 让另一台机器（或者误删本地 DB 后）能从 git 历史恢复完整树
   *
   * 行为：
   *  - 文件不存在 → 不动（老版本 git 仓库没有这俩文件 → 当 legacy 处理）
   *  - 文件存在 → REPLACE 本地活跃记录（is_deleted=0）
   *  - 笔记的 `path` / `file_path` 优先用元数据中保存的原始值，仅当文件在磁盘上不存在时
   *    才按 notebook_id + title + format 重新计算（防止同一台机器上 pull 后文件名错乱）
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

    // 1. 替换 notebooks 表
    dbApi.replaceNotebooks(notebooks.map((nb: any) => ({
      id: nb.id,
      name: nb.name,
      parentId: nb.parent_id ?? null,
      icon: nb.icon,
      createdAt: nb.created_at,
      updatedAt: nb.updated_at,
      sortOrder: nb.sort_order
    })))

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
      const ext = n.format === 'html' ? 'html' : n.format === 'richtext' ? 'json' : n.format === 'code' ? 'code' : n.format === 'url' ? 'url' : n.format === 'file' ? 'file' : 'md'
      const nbDir = getNotebookPath(n.notebook_id)

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
            const fp = getNotebookFilePath(n.notebook_id)
            const fileSlug = slugify(n.file_name.replace(/\.[^.]+$/, ''))
            const fileExt = n.file_ext || 'bin'
            const found = findFileBySlug(fp, fileSlug, fileExt)
            if (found) filePath = found
          } catch {}
        }
        // ④ getUniqueFileName 兜底
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
   * 一键同步：commit → pull → push
   *
   * 为什么这个顺序：
   *   1. 先 commit 本地变更（如果有）—— 这样工作区是干净的，pull 时不会撞工作区
   *   2. pull 取回远端的新 commit —— 现在 git 是 source of truth，需要先把别人写的拉下来
   *   3. push 把本地 commit（自己的 + 拉取合并的）推上去
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

    // Step 1: commit 本地变更（如果有）
    try {
      const oid = await this.commitAll(`sync: ${new Date().toLocaleString('zh-CN')}`)
      phases.commit = oid ? 'ok' : 'skipped'
    } catch (e: any) {
      phases.commit = 'failed'
      return { ok: false, message: e?.message ?? 'commit 失败', phases, phase: 'commit' }
    }

    // Step 2: pull（即使本地没 commit 也要 pull；其他设备的 commit 也要拉过来）
    const pullResult = await this.pull()
    if (!pullResult.ok) {
      phases.pull = 'failed'
      return { ok: false, message: '拉取失败：' + pullResult.message, phases, phase: 'pull' }
    }
    phases.pull = pullResult.updated ? 'ok' : 'up-to-date'

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
  async pull(): Promise<{ ok: boolean; message: string; updated: boolean }> {
    if (!this.isConfigured()) return { ok: false, message: 'Git 未配置', updated: false }
    if (!this.isInitialized()) return { ok: false, message: 'Git 仓库未初始化', updated: false }
    if (!this.decryptedToken) return { ok: false, message: 'Git 密码/Token 未配置，请打开 Git 设置填写', updated: false }
    const sshHint = this.detectSshUrl(this.config!.repoUrl)
    if (sshHint) return { ok: false, message: sshHint, updated: false }
    const dir = this.getWorkDir()
    const branch = this.config?.branch || 'main'
    try {
      // 确保 remote origin 存在且 URL 正确
      await this.ensureRemote()
      // pull = fetch + merge，fastForward 模式（能 ff 就 ff，否则建 merge commit）
      const result = await git.pull({
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
      // isomorphic-git pull 返回 fastForward oid 数组或 merge commit oid
      // 无变更时返回 []
      const updated = Array.isArray(result) && result.length > 0

      // 拉取后用 .inkslate/{notebooks,notes}.json 重建本地 SQLite
      // —— 这样新机器/重装/误删 DB 后能从 git 历史恢复完整树
      try {
        const recon = this.reconcileFromMetadata()
        if (recon.notebooksApplied || recon.notesApplied) {
          console.log(`[git] reconciled ${recon.notebooksApplied} notebooks, ${recon.notesApplied} notes from metadata`)
        }
      } catch (e) {
        console.error('[git] reconcile failed (non-fatal):', e)
      }

      return { ok: true, message: updated ? '拉取成功（有更新）' : '已是最新', updated }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'pull 失败', updated: false }
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

  /** 读指定 commit 的某个文件内容（文本） */
  async showFile(oid: string, filepath: string): Promise<string | null> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) return null
    try {
      const { blob } = await git.readBlob({ fs, dir, oid, filepath })
      return Buffer.from(blob).toString('utf-8')
    } catch (e) {
      return null
    }
  }

  /** 读指定 commit 的某个文件内容（二进制 Buffer，给附件用） */
  async showFileBuffer(oid: string, filepath: string): Promise<Buffer | null> {
    const dir = this.getWorkDir()
    if (!this.isInitialized()) return null
    try {
      const { blob } = await git.readBlob({ fs, dir, oid, filepath })
      return Buffer.from(blob)
    } catch (e) {
      return null
    }
  }

  // ============ 内部 ============

  private markInitialized() {
    if (this.config) {
      const updated = { ...this.config, initialized: true }
      dbApi.updateSettings({ gitSync: updated })
      this.config = updated
    }
  }
}
