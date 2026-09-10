/**
 * SSH 远程服务器管理器
 * - 供 AI 写作的 SSH 工具使用（读写远程文件）
 * - 密码用 safeStorage 加密存储（encryptedPassword），运行时解密
 * - 连接复用：配置（host/port/username）变化时自动重建
 */
import type { Client } from 'ssh2'
import { safeStorage } from 'electron'
import type { AppSettings } from '../../shared/types'

export type SshConfig = NonNullable<AppSettings['ssh']>

let client: Client | null = null
let connectedKey = ''

/**
 * 延迟加载 ssh2 的 Client 构造器。
 * 用 require 而不是顶层 import，避免 ssh2 加载异常时拖垮整个主进程（导致应用白屏）。
 */
let ClientCtor: (new () => Client) | null = null
function getClientCtor(): new () => Client {
  if (!ClientCtor) {
    ClientCtor = (require('ssh2') as any).Client
  }
  return ClientCtor as new () => Client
}

/** 用 safeStorage 加密密码 */
export function encryptPassword(plain: string): string | undefined {
  if (!plain) return undefined
  try {
    if (!safeStorage.isEncryptionAvailable()) return undefined
    return safeStorage.encryptString(plain).toString('base64')
  } catch {
    return undefined
  }
}

/** 解密密码；失败返回 null */
export function decryptPassword(cfg: SshConfig): string | null {
  if (!cfg.encryptedPassword) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(cfg.encryptedPassword, 'base64'))
  } catch {
    return null
  }
}

function connKey(cfg: SshConfig): string {
  return `${cfg.host}:${cfg.port || 22}:${cfg.username}`
}

function connect(cfg: SshConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const password = decryptPassword(cfg)
    if (password == null) {
      reject(new Error('SSH 密码未配置或无法解密，请在设置中重新填写'))
      return
    }
    const Ctor = getClientCtor()
    const c = new Ctor()
    let settled = false
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      try { c.end() } catch {}
      reject(err)
    }
    c.on('ready', () => {
      if (settled) return
      settled = true
      resolve(c)
    })
    c.on('error', (err: Error) => fail(err))
    c.on('close', () => {
      if (client === c) {
        client = null
        connectedKey = ''
      }
    })
    try {
      c.connect({
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.username,
        password,
        readyTimeout: 15000,
        keepaliveInterval: 15000
      })
    } catch (e: any) {
      fail(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/** 获取（必要时建立）连接 */
export async function getClient(cfg: SshConfig): Promise<Client> {
  const key = connKey(cfg)
  if (client && connectedKey === key) return client
  if (client) {
    try { client.end() } catch {}
    client = null
    connectedKey = ''
  }
  const c = await connect(cfg)
  client = c
  connectedKey = key
  return c
}

/** 主动断开当前连接 */
export function closeClient(): void {
  if (client) {
    try { client.end() } catch {}
  }
  client = null
  connectedKey = ''
}

function withSftp<T>(c: Client, fn: (sftp: any) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    c.sftp((err: Error | undefined, sftp: any) => {
      if (err) {
        reject(err)
        return
      }
      fn(sftp).then(resolve).catch(reject)
    })
  })
}

/** 测试连接 */
export async function testConnection(cfg: SshConfig): Promise<void> {
  const c = await getClient(cfg)
  await new Promise<void>((resolve, reject) => {
    c.exec('echo ok', (err: Error | undefined) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/** 列出远程目录内容 */
export async function listDir(cfg: SshConfig, dir: string): Promise<string> {
  const c = await getClient(cfg)
  return withSftp(c, (sftp) => new Promise<string>((resolve, reject) => {
    sftp.readdir(dir || '.', (err: Error | undefined, list: any[]) => {
      if (err) {
        reject(err)
        return
      }
      const lines = (list || [])
        .filter((it) => it.filename !== '.' && it.filename !== '..')
        .map((it) => {
          const isDir = (it.attrs?.mode & 0o40000) === 0o40000
          const size = it.attrs?.size ?? 0
          return `${isDir ? '📁' : '📄'} ${it.filename}${isDir ? '/' : `  (${size} bytes)`}`
        })
      resolve(lines.join('\n') || '(空目录)')
    })
  }))
}

/** 读取远程文件（文本） */
export async function readFile(cfg: SshConfig, file: string): Promise<string> {
  const c = await getClient(cfg)
  return withSftp(c, (sftp) => new Promise<string>((resolve, reject) => {
    sftp.readFile(file, (err: Error | undefined, buf: Buffer) => {
      if (err) {
        reject(err)
        return
      }
      let text = buf.toString('utf-8')
      if (text.length > 50000) text = text.slice(0, 50000) + '\n...(内容过长已截断)'
      resolve(text)
    })
  }))
}

/** 写入远程文件（覆盖） */
export async function writeFile(cfg: SshConfig, file: string, content: string): Promise<void> {
  const c = await getClient(cfg)
  return withSftp(c, (sftp) => new Promise<void>((resolve, reject) => {
    sftp.writeFile(file, content, (err: Error | undefined) => {
      if (err) reject(err)
      else resolve()
    })
  }))
}

/** 判断当前是否已建立连接 */
export function isConnected(): boolean {
  return !!client
}
