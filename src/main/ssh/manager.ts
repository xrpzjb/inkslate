/**
 * SSH 远程服务器管理器
 * - 供 AI 写作的 SSH 工具使用（读写远程文件）
 * - 凭据由 AI 每次调用时通过工具参数传入（支持访问多台服务器），不在本地保存
 * - 连接复用：host/port/username 相同时复用连接
 */
import type { Client } from 'ssh2'

/** 单次 SSH 连接所需凭据（由 AI 工具调用参数提供） */
export interface SshConnection {
  host: string
  port: number
  username: string
  password: string
}

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

function connKey(cfg: SshConnection): string {
  return `${cfg.host}:${cfg.port || 22}:${cfg.username}`
}

function connect(cfg: SshConnection): Promise<Client> {
  return new Promise((resolve, reject) => {
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
        password: cfg.password,
        readyTimeout: 15000,
        keepaliveInterval: 15000
      })
    } catch (e: any) {
      fail(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/** 获取（必要时建立）连接 */
export async function getClient(cfg: SshConnection): Promise<Client> {
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
export async function testConnection(cfg: SshConnection): Promise<void> {
  const c = await getClient(cfg)
  await new Promise<void>((resolve, reject) => {
    c.exec('echo ok', (err: Error | undefined) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/** 列出远程目录内容 */
export async function listDir(cfg: SshConnection, dir: string): Promise<string> {
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
export async function readFile(cfg: SshConnection, file: string): Promise<string> {
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
export async function writeFile(cfg: SshConnection, file: string, content: string): Promise<void> {
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