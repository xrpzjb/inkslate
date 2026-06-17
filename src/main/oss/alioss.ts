import crypto from 'node:crypto'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OSS = require('ali-oss')
import { AppSettings, AssetUploadResult } from '../../shared/types'
import { IOssClient } from './interface'

type OssClient = any

/**
 * 阿里云 OSS 客户端实现
 */
export class AliyunOssClient implements IOssClient {
  private client: OssClient = null
  private config: AppSettings['oss'] | null = null
  private bucket: string = ''

  configure(config: AppSettings['oss']): void {
    this.config = config
    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.encryptedSecret) {
      this.client = null
      return
    }
    this.client = new OSS({
      endpoint: config.endpoint,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      accessKeySecret: (config as any)._decryptedSecret ?? '',
      secure: true
    })
    this.bucket = config.bucket
  }

  private ensureClient(): OssClient {
    if (!this.client) throw new Error('OSS 客户端未配置')
    return this.client
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const client = this.ensureClient()
      await client.getBucketInfo(this.bucket)
      return { ok: true, message: '连接成功' }
    } catch (e: any) {
      return { ok: false, message: e?.message ?? '未知错误' }
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<AssetUploadResult> {
    const client = this.ensureClient()
    const result = await client.put(key, buffer, {
      headers: { 'Content-Type': contentType }
    })
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    return {
      url: result.url,
      hash,
      size: buffer.length
    }
  }

  async uploadAsset(buffer: Buffer, filename: string, contentType: string): Promise<AssetUploadResult> {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    const ext = filename.split('.').pop() ?? 'bin'
    const prefix = this.config?.prefix ?? 'mdtext'
    const key = `${prefix}/assets/images/${hash}.${ext}`
    return this.upload(key, buffer, contentType)
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = this.ensureClient()
      await client.head(key)
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<void> {
    const client = this.ensureClient()
    await client.delete(key)
  }

  async list(prefix: string): Promise<{ key: string; size: number; lastModified: number }[]> {
    const client = this.ensureClient()
    const result = await client.list({ prefix, 'max-keys': 1000 }, {})
    return (result.objects ?? []).map((obj: any) => ({
      key: obj.name,
      size: parseInt(obj.size, 10),
      lastModified: new Date(obj.lastModified).getTime()
    }))
  }

  async get(key: string): Promise<Buffer> {
    const client = this.ensureClient()
    const result = await this.client.get(key)
    return result.content as Buffer
  }
}
