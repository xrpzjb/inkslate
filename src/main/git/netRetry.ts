/**
 * Git 网络层的超时 / 重试调参（给慢网络用）
 *
 * 背景：Git 同步跑在 isomorphic-git + HTTP(S) 之上，网速特别慢时有两类典型失败：
 *   1. 连接阶段被掐断 —— Windows 系统级 TCP 连接超时约 21 秒，且无法从 JS 侧拉长
 *      （simple-get / Node 的请求层 timeout 不覆盖连接阶段的 ETIMEDOUT）；
 *   2. 传输中途断流 —— 连接没断但长时间收不到数据，表现为 socket hang up / premature close。
 *
 * 对策是两层重试：
 *   - 请求层（httpClient.ts）：单次 HTTP 请求的连接错误、空闲断流、整体超时、5xx/429 都可重试；
 *   - 操作层（manager.ts）：整个 push / fetch / clone 失败后重跑，覆盖「传到一半断掉」的场景
 *     （这种错误发生在响应体读取期间，请求层已经返回，只能靠操作层兜住）。
 *
 * 本文件集中放默认值、允许范围、错误分类和退避算法，供上面两层共用；
 * 数值可通过应用内「Git 同步设置」调整并持久化到 settings.gitSync。
 */

import { GIT_NET_LIMITS, GIT_NET_SETTINGS_DEFAULTS, clampInt } from '../../shared/gitNet'

export interface GitNetTuning {
  /** 单次 HTTP 请求的整体超时（毫秒）：超过就中断并重试 */
  requestTimeoutMs: number
  /** 连接空闲超时（毫秒）：这么久没有收发数据就判定断流并重试；0 表示关闭该判定 */
  idleTimeoutMs: number
  /** 网络类失败的最大尝试次数（含首次；1 表示不重试） */
  maxRetries: number
  /** 重试基础退避（毫秒），按 1x/2x/4x… 指数增长并加抖动 */
  retryBaseDelayMs: number
}

/** 默认值：单次请求最长 30 分钟、空闲 120 秒判定断流、网络失败最多尝试 5 次 */
export const GIT_NET_DEFAULTS: GitNetTuning = {
  requestTimeoutMs: GIT_NET_SETTINGS_DEFAULTS.requestTimeoutMinutes * 60_000,
  idleTimeoutMs: GIT_NET_SETTINGS_DEFAULTS.idleTimeoutSeconds * 1000,
  maxRetries: GIT_NET_SETTINGS_DEFAULTS.maxRetries,
  retryBaseDelayMs: 2000
}

/** 设置界面里的默认值（单位：分钟 / 秒 / 次） */
export const DEFAULT_REQUEST_TIMEOUT_MINUTES = GIT_NET_SETTINGS_DEFAULTS.requestTimeoutMinutes
export const DEFAULT_IDLE_TIMEOUT_SECONDS = GIT_NET_SETTINGS_DEFAULTS.idleTimeoutSeconds
export const DEFAULT_MAX_RETRIES = GIT_NET_SETTINGS_DEFAULTS.maxRetries

/** 原样转出给调用方（manager 等），避免各处 import 两个模块 */
export { GIT_NET_LIMITS, clampInt }

let current: GitNetTuning = { ...GIT_NET_DEFAULTS }

/**
 * 覆盖生效参数（来自 settings.gitSync），未提供的项回落到默认值。
 * 返回实际生效的配置，便于日志确认。
 */
export function configureGitNet(partial?: Partial<GitNetTuning> | null): GitNetTuning {
  const next: GitNetTuning = { ...GIT_NET_DEFAULTS }
  if (partial) {
    for (const key of Object.keys(GIT_NET_DEFAULTS) as (keyof GitNetTuning)[]) {
      const v = partial[key]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) next[key] = Math.round(v)
    }
  }
  // 整体超时必须大于 0，否则每次请求都会立刻超时
  if (next.requestTimeoutMs <= 0) next.requestTimeoutMs = GIT_NET_DEFAULTS.requestTimeoutMs
  if (next.maxRetries < 1) next.maxRetries = 1
  current = next
  return getGitNetTuning()
}

export function getGitNetTuning(): GitNetTuning {
  return { ...current }
}

/** 设置字段（分钟/秒/次）→ 内部毫秒制参数 */
export function tuningFromSettings(gitSync: {
  requestTimeoutMinutes?: number
  idleTimeoutSeconds?: number
  maxRetries?: number
} | null | undefined): GitNetTuning {
  return {
    requestTimeoutMs:
      clampInt(gitSync?.requestTimeoutMinutes, GIT_NET_LIMITS.requestTimeoutMinutes.min, GIT_NET_LIMITS.requestTimeoutMinutes.max, DEFAULT_REQUEST_TIMEOUT_MINUTES) * 60_000,
    idleTimeoutMs:
      clampInt(gitSync?.idleTimeoutSeconds, GIT_NET_LIMITS.idleTimeoutSeconds.min, GIT_NET_LIMITS.idleTimeoutSeconds.max, DEFAULT_IDLE_TIMEOUT_SECONDS) * 1000,
    maxRetries:
      clampInt(gitSync?.maxRetries, GIT_NET_LIMITS.maxRetries.min, GIT_NET_LIMITS.maxRetries.max, DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: GIT_NET_DEFAULTS.retryBaseDelayMs
  }
}

/** 网络类错误关键字：都是"可能是抖动"的信号，值得重试 */
const RETRYABLE_ERROR_RE =
  /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ECONNABORTED|EPIPE|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ENETDOWN|ERR_SOCKET_CONNECTION_TIMEOUT|ERR_STREAM_PREMATURE_CLOSE|socket hang up|premature close|other side closed|Request timed out|aborted|超时/i

/** 明确不该重试的错误：认证/权限/仓库不存在/冲突/引用问题 */
const FATAL_ERROR_RE =
  /MergeConflict|CheckoutConflict|FastForward|not fast[- ]forward|non-fast-forward|Unauthorized|Forbidden|Authentication|MissingRef|NoRefspec|already exists|HttpError: 40[134]/i

/** HTTP 状态码是否值得重试：限流/请求超时/服务端临时故障 */
export function isRetryableStatus(status?: number): boolean {
  if (typeof status !== 'number') return false
  if (status === 408 || status === 425 || status === 429) return true
  return status >= 500 && status <= 599
}

/** 错误是否属于"网络抖动，可以重试" */
export function isRetryableError(e: unknown): boolean {
  if (!e) return false
  const err = e as any
  const status =
    typeof err.statusCode === 'number' ? err.statusCode
      : typeof err.data?.statusCode === 'number' ? err.data.statusCode
        : typeof err.data?.response?.statusCode === 'number' ? err.data.response.statusCode
          : undefined
  if (typeof status === 'number') return isRetryableStatus(status)

  const text = `${err.code ?? ''} ${err.message ?? ''} ${typeof e === 'string' ? e : ''}`
  if (FATAL_ERROR_RE.test(text)) return false
  return RETRYABLE_ERROR_RE.test(text)
}

/** 第 attempt 次失败后的等待时长：指数退避 + 抖动，封顶 60 秒 */
export function backoffDelay(attempt: number, baseMs = current.retryBaseDelayMs): number {
  const exp = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), 60_000)
  const jitter = Math.random() * Math.min(exp * 0.25, 5_000)
  return Math.round(exp + jitter)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 把毫秒说成人话，用在错误提示里 */
export function describeDuration(ms: number): string {
  if (ms >= 60_000) {
    const min = ms / 60_000
    return `${Number.isInteger(min) ? min : min.toFixed(1)} 分钟`
  }
  return `${Math.round(ms / 1000)} 秒`
}
