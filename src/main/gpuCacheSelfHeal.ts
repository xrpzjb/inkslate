/**
 * GPU 缓存自愈：让 Ctrl+C 掐掉开发进程之后，下一次仍然能正常启动。
 *
 * 背景（本项目真实踩到的坑，2026-10-14）：
 *   在 Windows 上 Ctrl+C 结束 `yarn dev` 时，concurrently 会直接
 *   TerminateProcess 掉 electron（Windows 没有真正的 SIGTERM 优雅退出）。
 *   如果此时 Chromium 正在写 GPU / WebGPU 磁盘缓存，缓存就会只写一半。
 *   下次启动时 Chromium 在**初始化阶段**读到坏缓存会直接原生崩溃：
 *   进程退出码 0x80000003（STATUS_BREAKPOINT），业务日志一行都打不出来，
 *   表现为"应用打不开 / 没有任何报错"，而 VS Code 等其它 Electron 应用正常
 *   （它们有自己的 userData 和缓存）。手动删掉这几个缓存目录即可恢复。
 *
 * 做法：启动时（app ready 之前、GPU 进程起来之前）读一个"运行中"标记：
 *   - 标记里的 PID 还活着  → 说明有实例正在运行，什么都不做；
 *   - 标记存在但 PID 已消失 → 上次是异常退出 → 先删掉白名单里的缓存目录再启动；
 *   - 正常退出（关窗口）会把标记删掉，所以正常启动路径零开销。
 *
 * 安全：
 *   - 只删 userData 下**固定白名单**内的子目录，且校验目标确实位于 userData 内；
 *   - 绝不触碰 mdtext.db / notes / Local State / Preferences 等任何数据；
 *   - 所有异常都静默吞掉，自愈失败也绝不影响应用启动。
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/** 运行中标记（放在 userData 根目录，正常退出时删除） */
const MARKER_FILE = 'inkslate-running.json'

/**
 * 异常退出后要清理的缓存目录白名单。
 * 只包含 Chromium 可再生的 GPU / 代码缓存；不含 HTTP 缓存（Cache），
 * 避免网址笔记的内容被无谓地重新下载。
 */
const CACHE_DIRS = [
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'DawnCache',
  'ShaderCache',
  'GrShaderCache',
  'Code Cache'
]

/** 目标目录是否确实位于 parent 内部（防御性校验，避免删错地方） */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** PID 对应的进程是否还活着（EPERM 表示存在但没权限操作 → 视为活着） */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

function readOwnerPid(markerPath: string): number | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
    const pid = Number(parsed?.pid)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/**
 * 安装自愈逻辑。必须在 app ready 之前调用（GPU 进程初始化之前）。
 */
export function installGpuCacheSelfHeal(): void {
  try {
    const userData = app.getPath('userData')
    const markerPath = path.join(userData, MARKER_FILE)
    const ownerPid = readOwnerPid(markerPath)

    if (ownerPid !== null && isProcessAlive(ownerPid)) {
      // 已有实例在运行：不清理、也不覆盖标记
      return
    }

    if (ownerPid !== null) {
      // 上次没有正常退出：清掉可能只写了一半的缓存
      let removed = 0
      for (const name of CACHE_DIRS) {
        const target = path.join(userData, name)
        if (!isInside(userData, target)) continue
        try {
          if (fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true })
            removed += 1
          }
        } catch {
          // 文件被占用 / 权限不足：忽略，继续启动
        }
      }
      console.warn(
        `[gpu-cache] 检测到上次未正常退出（pid ${ownerPid}）→ 已清理 ${removed} 个 GPU/代码缓存目录，`
        + '避免下次启动在 Chromium 初始化阶段崩溃（0x80000003）'
      )
    }

    fs.mkdirSync(userData, { recursive: true })
    fs.writeFileSync(markerPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }))

    // 正常退出（关窗口 → window-all-closed → app.quit）时删掉标记
    app.once('will-quit', () => {
      try {
        fs.rmSync(markerPath, { force: true })
      } catch {
        // 忽略：标记留着只会导致下次启动多清一次缓存
      }
    })
  } catch {
    // 自愈本身失败绝不影响启动
  }
}
