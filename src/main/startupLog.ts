/**
 * 启动黑匣子（flight recorder）。
 *
 * 为什么需要：Electron 的主进程在启动阶段发生原生崩溃时，进程会直接消失，
 * stdout/stderr 常常一行都留不下来（GUI 子系统、被 concurrently/npx 转发吞掉、
 * 或者根本来不及 attach 控制台）。这时唯一能确定"死在哪一步"的办法，
 * 就是在每个关键节点往文件里追加一行日志——文件写入是同步的，
 * 崩溃前已经落盘的内容一定读得到。
 *
 * 用法：排查启动问题时让应用启动一次，然后看
 *   %TEMP%\inkslate-startup.log
 * 日志里最后一个 stage 就是崩溃点；如果文件根本不存在，
 * 说明主进程 JS 在运行之前就崩了（Electron/Chromium 运行时问题，与业务代码无关）。
 *
 * 安全：所有写入都在 try/catch 里，日志失败绝不影响应用启动；
 * 未捕获异常会先记日志再原样交回 Electron 默认处理（不吞异常）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 日志文件路径（%TEMP%\inkslate-startup.log） */
export function startupLogPath(): string {
  const dir = process.env.TEMP || process.env.TMP || os.tmpdir()
  return path.join(dir, 'inkslate-startup.log')
}

/** 追加一行启动日志（同步写，保证崩溃前已落盘） */
export function logStartup(stage: string, extra?: unknown): void {
  try {
    const detail = extra === undefined
      ? ''
      : ` ${typeof extra === 'string' ? extra : safeJson(extra)}`
    const line = `${new Date().toISOString()} [pid ${process.pid}] ${stage}${detail}\n`
    fs.appendFileSync(startupLogPath(), line)
    // 同时打到控制台：dev 下 concurrently 能看到就省得翻文件
    console.log(`[startup] ${stage}${detail}`)
  } catch {
    // 日志失败不影响启动
  }
}

function safeJson(v: unknown): string {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * 安装未捕获异常/未处理 Promise 的日志钩子。
 * 记录之后**把异常原样交回** Electron 的默认处理（先摘掉自己的监听器再抛），
 * 避免改变应用原有的错误行为。
 */
export function installStartupErrorLogging(): void {
  try {
    const onUncaught = (err: unknown): void => {
      logStartup('uncaughtException', err)
      process.removeListener('uncaughtException', onUncaught)
      setTimeout(() => { throw err }, 0)
    }
    process.on('uncaughtException', onUncaught)

    process.on('unhandledRejection', (reason) => {
      logStartup('unhandledRejection', reason)
    })
  } catch {
    // 忽略
  }
}
