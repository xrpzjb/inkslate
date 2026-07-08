import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import * as git from 'isomorphic-git'
// @ts-ignore - isomorphic-git/http/node 无类型声明
import http from 'isomorphic-git/http/node'
import { AppSettings, Note } from '../../shared/types'
import { dbApi, getNotesDir } from '../db'

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
