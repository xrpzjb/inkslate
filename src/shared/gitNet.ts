/**
 * Git 网络超时 / 重试的可调参数（默认值与允许范围）
 *
 * 放在 shared 下是因为：主进程（真正执行 git 操作）和设置界面（用户改参数、做输入校验）
 * 必须用同一份默认值与范围，否则界面能存进去的值和主进程实际生效的值会对不上。
 *
 * 单位说明（跟 settings.gitSync 里的字段一致）：
 *   - requestTimeoutMinutes：单次 HTTP 请求的整体超时（分钟）
 *   - idleTimeoutSeconds：连接空闲多久判定断流（秒），0 = 关闭该判定
 *   - maxRetries：网络类失败的最大尝试次数（含首次）
 */

export const GIT_NET_SETTINGS_DEFAULTS = {
  /** 慢网络默认给到 30 分钟，避免大仓库传到一半被误杀 */
  requestTimeoutMinutes: 30,
  /** 2 分钟没有收到任何数据就判定断流并重试 */
  idleTimeoutSeconds: 120,
  /** 网络抖动时最多尝试 5 次（含首次） */
  maxRetries: 5
} as const

export const GIT_NET_LIMITS = {
  requestTimeoutMinutes: { min: 1, max: 360 },
  idleTimeoutSeconds: { min: 0, max: 3600 },
  maxRetries: { min: 1, max: 20 }
} as const

/** 取整并钳到 [min, max]，非法输入回落到 fallback */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
