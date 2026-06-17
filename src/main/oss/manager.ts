import fs from 'node:fs'
import crypto from 'node:crypto'
import { safeStorage } from 'electron'
import { AppSettings, AssetUploadResult, Note, Notebook } from '../../shared/types'
import { getDatabase, getNotesDir, dbApi } from '../db'
import { AliyunOssClient } from './alioss'
import { IOssClient } from './interface'
import { sendToRenderer } from '..'
import { IPC_CHANNELS } from '../../shared/types'

/**
 * OSS 同步管理器
 * - 单例模式
 * - 支持多 OSS 客户端（当前默认 Aliyun）
 * - 配置通过 safeStorage 加密存储
 * - 提供 pushAll / pullAll 全量同步
 */
export class OssManager {
  private static instance: OssManager | null = null
  private client: IOssClient = new AliyunOssClient()
  private config: AppSettings['oss'] | null = null

  static getInstance(): OssManager {
    if (!OssManager.instance) {
      OssManager.instance = new OssManager()
    }
    return OssManager.instance
  }

  private constructor() {
    // 启动时读取已保存的 OSS 配置
    try {
      const settings = dbApi.getSettings?.()
      if (settings?.oss?.configured) {
        this.configure(settings.oss)
      }
    } catch (e) {
      console.error('OssManager init failed:', e)
    }
  }

  /**
   * 配置 OSS - 凭据用 safeStorage 加密
   */
  configure(config: AppSettings['oss']): void {
    let decryptedSecret = ''
    if (config.encryptedSecret && safeStorage.isEncryptionAvailable()) {
      try {
        decryptedSecret = safeStorage.decryptString(Buffer.from(config.encryptedSecret, 'base64'))
      } catch (e) {
        console.error('decrypt OSS secret failed:', e)
      }
    }

    this.config = {
      ...config,
      _decryptedSecret: decryptedSecret
    } as any

    this.client.configure(this.config as any)
  }

  isConfigured(): boolean {
    return !!(this.config?.configured)
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: 'OSS 未配置' }
    }
    return this.client.testConnection()
  }

  async uploadAsset(buffer: Buffer, filename: string, contentType: string): Promise<AssetUploadResult> {
    if (!this.isConfigured()) {
      throw new Error('OSS 未配置，无法上传')
    }
    return this.client.uploadAsset(buffer, filename, contentType)
  }

  /**
   * 全量推送 - 把本地所有笔记推送到 OSS
   */
  async pushAll(): Promise<{ ok: boolean; uploaded: number; failed: number }> {
    if (!this.isConfigured()) {
      return { ok: false, uploaded: 0, failed: 0 }
    }

    sendToRenderer(IPC_CHANNELS.OSS_STATUS, { state: 'syncing', message: '正在推送...' })

    let uploaded = 0
    let failed = 0

    try {
      const notebooks: Notebook[] = dbApi.listNotebooks()
      const notes: Note[] = dbApi.listNotes()

      const prefix = this.config?.prefix ?? 'mdtext'

      // 推送笔记本元信息
      const metaKey = `${prefix}/meta/notebooks.json`
      const metaContent = JSON.stringify({ notebooks, lastSyncAt: Date.now() }, null, 2)
      try {
        await this.client.upload(metaKey, Buffer.from(metaContent), 'application/json')
        uploaded++
      } catch (e) {
        console.error('upload meta failed:', e)
        failed++
      }

      // 推送每个笔记
      for (const note of notes) {
        try {
          const noteKey = `${prefix}/notes/${note.notebookId}/${note.id}.md`
          const content = fs.readFileSync(note.path)
          await this.client.upload(noteKey, content, 'text/markdown')

          // 元信息
          const metaKey = `${prefix}/notes/${note.notebookId}/${note.id}.json`
          const metaContent = JSON.stringify({
            id: note.id,
            title: note.title,
            notebookId: note.notebookId,
            parentId: note.parentId,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            icon: note.icon,
            sha256: crypto.createHash('sha256').update(content).digest('hex')
          })
          await this.client.upload(metaKey, Buffer.from(metaContent), 'application/json')
          uploaded++
        } catch (e) {
          console.error(`upload note ${note.id} failed:`, e)
          failed++
        }
      }

      sendToRenderer(IPC_CHANNELS.OSS_STATUS, {
        state: failed > 0 ? 'error' : 'success',
        message: failed > 0 ? `${uploaded} 成功 / ${failed} 失败` : '同步成功',
        lastSyncAt: Date.now()
      })

      return { ok: failed === 0, uploaded, failed }
    } catch (e: any) {
      sendToRenderer(IPC_CHANNELS.OSS_STATUS, { state: 'error', message: e?.message ?? '同步失败' })
      return { ok: false, uploaded, failed }
    }
  }

  /**
   * 全量拉取 - 从 OSS 拉取最新到本地
   */
  async pullAll(): Promise<{ ok: boolean; downloaded: number; conflicts: number }> {
    if (!this.isConfigured()) {
      return { ok: false, downloaded: 0, conflicts: 0 }
    }

    sendToRenderer(IPC_CHANNELS.OSS_STATUS, { state: 'syncing', message: '正在拉取...' })

    let downloaded = 0
    let conflicts = 0

    try {
      const prefix = this.config?.prefix ?? 'mdtext'

      // 1. 拉取笔记本元信息
      const metaKey = `${prefix}/meta/notebooks.json`
      let remoteNotebooks: any[] = []
      try {
        const buf = await this.client.get(metaKey)
        const meta = JSON.parse(buf.toString())
        remoteNotebooks = meta.notebooks ?? []
      } catch (e) {
        // 文件不存在，说明云端是空的
      }

      const db = getDatabase()
      const localNotebooks = dbApi.listNotebooks()
      const localMap = new Map(localNotebooks.map(n => [n.id, n]))

      // 合并笔记本
      for (const remote of remoteNotebooks) {
        const local = localMap.get(remote.id)
        if (!local) {
          // 本地没有 → 插入
          db.prepare(`
            INSERT INTO notebooks (id, name, parent_id, created_at, updated_at, icon, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, 0)
          `).run(remote.id, remote.name, remote.parentId, remote.createdAt, remote.updatedAt, remote.icon ?? null)
          downloaded++
        } else if (remote.updatedAt > local.updatedAt) {
          // 云端更新 → 更新本地
          db.prepare(`
            UPDATE notebooks SET name = ?, parent_id = ?, updated_at = ?, icon = ? WHERE id = ?
          `).run(remote.name, remote.parentId, remote.updatedAt, remote.icon ?? null, remote.id)
          downloaded++
        }
      }

      // 2. 拉取所有笔记
      const notePrefix = `${prefix}/notes/`
      const remoteFiles = await this.client.list(notePrefix)
      const notesDir = getNotesDir()

      for (const file of remoteFiles) {
        if (!file.key.endsWith('.md')) continue
        const noteId = file.key.split('/').pop()!.replace('.md', '')
        const localNote = dbApi.getNote(noteId)

        if (!localNote) {
          // 本地没有 → 下载
          const content = await this.client.get(file.key)
          const filePath = `${notesDir}/${noteId}.md`
          fs.writeFileSync(filePath, content)

          // 拉取元信息
          const metaFileKey = file.key.replace('.md', '.json')
          let meta: any = {}
          try {
            const metaBuf = await this.client.get(metaFileKey)
            meta = JSON.parse(metaBuf.toString())
          } catch {}

          db.prepare(`
            INSERT INTO notes (id, title, notebook_id, parent_id, path, created_at, updated_at, icon, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(noteId, meta.title ?? '未命名', meta.notebookId ?? '', meta.parentId ?? null, filePath, meta.createdAt ?? Date.now(), meta.updatedAt ?? Date.now(), meta.icon ?? null)
          downloaded++
        } else if (file.lastModified > localNote.updatedAt) {
          // 云端更新 → 覆盖本地
          const content = await this.client.get(file.key)
          fs.writeFileSync(localNote.path, content)
          db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(file.lastModified, noteId)
          downloaded++
        } else if (file.lastModified < localNote.updatedAt) {
          conflicts++
        }
      }

      sendToRenderer(IPC_CHANNELS.OSS_STATUS, {
        state: conflicts > 0 ? 'error' : 'success',
        message: conflicts > 0 ? `下载完成，${conflicts} 个冲突` : '拉取成功',
        lastSyncAt: Date.now()
      })

      return { ok: true, downloaded, conflicts }
    } catch (e: any) {
      sendToRenderer(IPC_CHANNELS.OSS_STATUS, { state: 'error', message: e?.message ?? '拉取失败' })
      return { ok: false, downloaded, conflicts }
    }
  }
}
