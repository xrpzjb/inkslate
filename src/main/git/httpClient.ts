import { request as defaultRequest } from 'isomorphic-git/http/node'

/**
 * Git HTTP 客户端（isomorphic-git 的 http 适配器）
 *
 * 为什么需要它：
 *   Windows 系统级 TCP 连接超时约 21 秒，且无法从 JS 侧拉长（请求层 timeout 选项
 *   不会覆盖连接阶段的 ETIMEDOUT）。网络不稳时（如访问境外 Git 服务）单次请求
 *   经常在连接阶段就被系统掐断，表现为 "git 同步总是超时"。
 *
 * 策略：
 *   1. 连接阶段错误（ETIMEDOUT / ECONNREFUSED / ENOTFOUND 等）自动重试，每次重试
 *      都是一个新的 21 秒窗口，给慢网络多次机会；
 *   2. 单次请求设一个很长的整体超时（默认 10 分钟），避免大仓库传输中途被误杀；
 *   3. 非连接类错误（认证失败、协议错误等）直接抛出，不做无谓重试。
 */

/** 单次请求整体超时：10 分钟 */
const GIT_HTTP_TIMEOUT_MS = 10 * 60 * 1000
/** 连接阶段错误的最大重试次数 */
const MAX_RETRIES = 3
/** 重试基础退避（毫秒），按 1x/2x/3x 递增 */
const RETRY_BASE_DELAY_MS = 1500

function isConnectError(e: unknown): boolean {
  const msg = String((e as any)?.code || (e as any)?.message || e)
  return /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH/.test(msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Git 请求超时（超过 ${Math.round(ms / 60000)} 分钟），请检查网络后重试`)), ms)
  })
  try {
    return await Promise.race([fn(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function gitRequest(opts: any): Promise<any> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withTimeout(() => defaultRequest(opts), GIT_HTTP_TIMEOUT_MS)
    } catch (e) {
      lastErr = e
      const connectErr = isConnectError(e)
      if (!connectErr || attempt === MAX_RETRIES) {
        if (connectErr) {
          throw new Error(`Git 连接失败（已重试 ${MAX_RETRIES} 次）：${(e as any)?.message || e}，请检查网络后重试`)
        }
        throw e
      }
      console.warn(`[git] 连接错误，第 ${attempt} 次重试：${(e as any)?.message || e}`)
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }
  throw lastErr
}

export const gitHttp = { request: gitRequest }