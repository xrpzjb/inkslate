import { request as defaultRequest } from 'isomorphic-git/http/node'
import { Agent as HttpAgent, type ClientRequestArgs } from 'node:http'
import { Agent as HttpsAgent, type RequestOptions as HttpsRequestOptions } from 'node:https'
import { Readable, type Duplex } from 'node:stream'
import {
  backoffDelay,
  describeDuration,
  getGitNetTuning,
  isRetryableError,
  isRetryableStatus,
  sleep
} from './netRetry'

/**
 * Git HTTP 客户端（isomorphic-git 的 http 适配器）
 *
 * 为什么需要它：
 *   Windows 系统级 TCP 连接超时约 21 秒，且无法从 JS 侧拉长（请求层 timeout 选项
 *   不会覆盖连接阶段的 ETIMEDOUT）。网络不稳时（如访问境外 Git 服务）单次请求
 *   经常在连接阶段就被系统掐断，表现为 "git 同步总是超时"。
 *
 * 策略（网速特别慢时的三重保障）：
 *   1. 空闲断流判定：给连接挂一个 socket 空闲超时（默认 120 秒收不到任何数据就断开），
 *      这样"连上了但卡住不动"能在 2 分钟内被发现并重试，不用干等到整体超时；
 *   2. 单次请求整体超时（默认 30 分钟，可在「Git 同步设置」调整），避免大仓库传输
 *      中途被误杀；超时会真的把 socket 掐掉，不会留下僵尸连接；
 *   3. 网络类失败（连接错误、断流、整体超时、429/5xx）自动重试，指数退避 + 抖动；
 *      认证失败、权限不足、协议/冲突类错误直接抛出，不做无谓重试。
 *
 * 注意：发生在响应体读取中途的断流（push/fetch 传到一半断掉）不会经过这里，
 * 由 manager.ts 的操作级重试兜底。
 */

type ConnCallback = (err: Error | null, stream: Duplex) => void

/** 给 socket 挂空闲超时：这么久没有任何收发就 destroy，让上层当成网络错误重试 */
function applyIdleTimeout(socket: Duplex | null | undefined, idleMs: number): void {
  if (!socket || idleMs <= 0) return
  const s = socket as Duplex & { setTimeout?: (ms: number, cb?: () => void) => void }
  if (typeof s.setTimeout !== 'function') return
  s.setTimeout(idleMs, () => {
    // 不带 error 地 destroy：避免在 keep-alive 空闲连接上抛出未捕获的 'error' 事件，
    // 正在等待的请求会收到 socket hang up（属于可重试错误）
    try { s.destroy() } catch { /* ignore */ }
  })
}

class IdleTimeoutHttpAgent extends HttpAgent {
  constructor(private readonly idleMs: number) {
    super({ keepAlive: true, maxSockets: 8 })
  }
  createConnection(options: ClientRequestArgs, callback?: ConnCallback): Duplex | null | undefined {
    const socket = super.createConnection(options, callback)
    applyIdleTimeout(socket, this.idleMs)
    return socket
  }
}

class IdleTimeoutHttpsAgent extends HttpsAgent {
  constructor(private readonly idleMs: number) {
    super({ keepAlive: true, maxSockets: 8 })
  }
  createConnection(options: HttpsRequestOptions, callback?: ConnCallback): Duplex | null | undefined {
    const socket = super.createConnection(options, callback)
    applyIdleTimeout(socket, this.idleMs)
    return socket
  }
}

let cachedIdleMs = -1
let httpAgent: IdleTimeoutHttpAgent | null = null
let httpsAgent: IdleTimeoutHttpsAgent | null = null

/** 取（必要时重建）带空闲超时的 agent；空闲参数变了就换一批连接 */
function ensureAgents(idleMs: number): { http: IdleTimeoutHttpAgent; https: IdleTimeoutHttpsAgent } {
  if (cachedIdleMs !== idleMs || !httpAgent || !httpsAgent) {
    try { httpAgent?.destroy() } catch { /* ignore */ }
    try { httpsAgent?.destroy() } catch { /* ignore */ }
    httpAgent = new IdleTimeoutHttpAgent(idleMs)
    httpsAgent = new IdleTimeoutHttpsAgent(idleMs)
    cachedIdleMs = idleMs
  }
  return { http: httpAgent, https: httpsAgent }
}

/** 超时/放弃本次请求时，把这对 agent 上的连接都掐掉，避免僵尸连接继续占带宽 */
function destroyAgents(): void {
  try { httpAgent?.destroy() } catch { /* ignore */ }
  try { httpsAgent?.destroy() } catch { /* ignore */ }
}

function errText(e: unknown): string {
  return String((e as any)?.message || (e as any)?.code || e)
}

/** 丢掉这次响应体（重试 5xx 前调用），避免 socket 泄漏 */
async function discardBody(res: any): Promise<void> {
  const body = res?.body
  if (!body) return
  try {
    if (typeof body.return === 'function') await body.return()
    else if (typeof body.destroy === 'function') body.destroy()
  } catch { /* ignore */ }
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout?.() } catch { /* ignore */ }
      reject(new Error(`Git 请求超时（单次请求超过 ${describeDuration(ms)} 没有结果），已中断本次连接`))
    }, ms)
  })
  try {
    return await Promise.race([fn(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 重试耗尽后的最终错误：网络类给出可操作的提示，非网络类原样抛回 */
function finalizeError(e: unknown, attempts: number, requestTimeoutMs: number): Error {
  if (!isRetryableError(e)) return e instanceof Error ? e : new Error(errText(e))
  return new Error(
    `Git 网络连接失败（已尝试 ${attempts} 次，单次最长等待 ${describeDuration(requestTimeoutMs)}）：${errText(e)}。` +
    '网速慢时可在「Git 同步设置」里调大「请求超时」和「重试次数」后再试'
  )
}

/** git smart HTTP 的服务端点 POST：/git-receive-pack（push）、/git-upload-pack（fetch） */
function isReceivePackPost(opts: any): boolean {
  const method = String(opts?.method || 'GET').toUpperCase()
  if (method !== 'POST') return false
  return String(opts?.url || '').endsWith('/git-receive-pack')
}

/** 同一端点只提示一次，避免每次推送都刷日志 */
const noRetryPostNotified = new Set<string>()

/** ref 广告请求：GET .../info/refs（push 用 receive-pack，fetch 用 upload-pack） */
function isInfoRefsGet(opts: any): boolean {
  const method = String(opts?.method || 'GET').toUpperCase()
  return method === 'GET' && String(opts?.url || '').includes('/info/refs')
}

/**
 * 完整读取 ref 广告的响应体后再交给 isomorphic-git。
 *
 * 为什么必须自己做：isomorphic-git 的 pkt-line 读取器把「流中断 / 读取出错」一律当作
 * flush 包处理（GitPktLine.streamReader 的 catch 里 `return true`），而
 * parseRefsAdResponse 见到第二个包是 flush 就认为「远端没有任何 ref」，且不抛错。
 * 于是广告一旦被截断，push 就会用 old=全 0 去「创建」一个已存在的分支，服务端回
 * `refs/heads/main: reference already exists` —— 这跟 ref 锁/冲突无关，重试也没有意义。
 * 这里先把响应体读全：出错或读到空体就抛可重试的网络错误，绝不把半截广告交上去。
 */
async function bufferInfoRefsBody(res: any): Promise<any> {
  const body = res?.body
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') return res
  const chunks: Buffer[] = []
  try {
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
  } catch (e) {
    const err: any = new Error(`读取 Git ref 广告时连接中断（响应体未读完）：${errText(e)}`)
    err.code = 'ECONNRESET'
    throw err
  }
  const buf = Buffer.concat(chunks)
  if (buf.length === 0) {
    const err: any = new Error('Git ref 广告响应体为空（连接被截断），本次结果不可信')
    err.code = 'ECONNRESET'
    throw err
  }
  res.body = Readable.from([buf])
  return res
}

async function gitRequest(opts: any): Promise<any> {
  const tuning = getGitNetTuning()
  const agents = ensureAgents(tuning.idleTimeoutMs)
  const isHttps = typeof opts?.url === 'string' && opts.url.startsWith('https:')

  // ⚠️ 重试安全（两条规则，都踩过坑）
  //
  // 规则一：请求体必须能重放。isomorphic-git 的 POST body 是「Uint8Array 数组」或 Buffer，
  //   可以原样复用；如果拿到的是流/异步迭代器，第一次尝试就把它消费掉了，再重试只会发出
  //   空 body（比不重试更糟）——这种情况交给 manager.ts 的操作级重试整轮重做。
  //
  // 规则二：**push 的 POST（/git-receive-pack）永远不在请求层重发**。
  //   慢网络下这个 POST 的响应一旦断掉，服务端那边其实还在跑（unpack → 钩子 → 提交 ref），
  //   把同一条 POST 原样重发，第二个 receive-pack 进程就会撞上第一个进程持有的 ref 锁，
  //   服务端返回 `refs/heads/main: reference already exists`
  //   （git 的 REF_TRANSACTION_ERROR_CREATE_EXISTS，意思是 ref 被锁着，不是冲突）。
  //   正确做法：重试交给 manager.ts —— 它会重新发现远端 ref、先确认服务端是否已经收下，
  //   再决定是否重推。
  const body = opts?.body
  const bodyReplayable =
    body == null || Array.isArray(body) || Buffer.isBuffer(body) || typeof body === 'string'
  const receivePackPost = isReceivePackPost(opts)
  const attempts = bodyReplayable && !receivePackPost ? tuning.maxRetries : 1

  if (!bodyReplayable && tuning.maxRetries > 1) {
    console.warn('[git] 本次请求的 body 不可重放（流式），跳过请求级重试，交给操作级重试整轮重做')
  }
  if (receivePackPost && !noRetryPostNotified.has(String(opts?.url))) {
    noRetryPostNotified.add(String(opts?.url))
    console.warn('[git] push 的 POST 不做请求级重试（重发会撞服务端 ref 锁，报 "reference already exists"）；重试由操作级重新发现远端后执行')
  }

  // 每次尝试都用一份干净的请求参数：simple-get 会就地改写它收到的 options 对象
  const buildRequestOpts = () => ({
    ...opts,
    headers: opts?.headers ? { ...opts.headers } : opts?.headers,
    agent: opts?.agent ?? (isHttps ? agents.https : agents.http)
  })

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await withTimeout(
        () => defaultRequest(buildRequestOpts()),
        tuning.requestTimeoutMs,
        destroyAgents
      )
      // 服务端临时故障 / 限流：丢掉响应后按网络错误重试
      if (isRetryableStatus(res?.statusCode)) {
        await discardBody(res)
        const e: any = new Error(`服务端返回 ${res.statusCode} ${res.statusMessage ?? ''}`.trim())
        e.statusCode = res.statusCode
        throw e
      }
      // ref 广告必须完整读完再返回：被截断的广告会被 isomorphic-git 误当成「远端没有 ref」
      if (isInfoRefsGet(opts)) return await bufferInfoRefsBody(res)
      return res
    } catch (e) {
      lastErr = e
      if (attempt >= attempts || !isRetryableError(e)) {
        throw finalizeError(e, attempt, tuning.requestTimeoutMs)
      }
      const delay = backoffDelay(attempt, tuning.retryBaseDelayMs)
      console.warn(
        `[git] 网络请求失败（第 ${attempt}/${attempts} 次，空闲超时 ${describeDuration(tuning.idleTimeoutMs)}）：` +
        `${errText(e)}；${describeDuration(delay)} 后重试`
      )
      await sleep(delay)
    }
  }
  throw finalizeError(lastErr, attempts, tuning.requestTimeoutMs)
}

export const gitHttp = { request: gitRequest }

/** 供测试/诊断：当前生效的网络参数与连接重建 */
export function __resetGitHttpAgents(): void {
  destroyAgents()
  cachedIdleMs = -1
  httpAgent = null
  httpsAgent = null
}
