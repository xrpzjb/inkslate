/**
 * 开发服务器（Vite dev server）地址的唯一定义处。
 *
 * 为什么需要这个文件：
 * 主进程曾在 `loadURL()` 里把 `http://localhost:5173` 写死，而 Vite 的端口是可漂移的
 * （被占用、又没开 strictPort 时会静默换到 5174、5175…）。两边一旦错位，Electron 就会
 * 加载"占用该端口的别的项目"—— 真的发生过：启动 Inkslate 却显示成同一台机器上另一个
 * 项目（Voxel English 游戏）的界面。
 *
 * 所以端口/地址只在这里定义一次，主进程（src/main/index.ts）与 Vite 配置
 * （vite.config.ts）共用，不再各自写一份字面量。
 */

/**
 * Inkslate 开发服务器默认端口。
 *
 * 刻意不用 Vite 默认的 5173：同一台机器上常有别的 Vite 项目（例如
 * E:\workspace\idea\study-english-game）占用它，而主进程在 dev 模式下必须精确命中
 * 本项目的 dev server，否则就会把别人的界面当成自己的。
 */
export const DEV_SERVER_PORT = 5199

/** 开发服务器主机名 */
export const DEV_SERVER_HOST = 'localhost'

/** 读取环境变量的最小接口（不依赖 @types/node 也能用） */
export type Env = Record<string, string | undefined>

function currentEnv(): Env {
  return typeof process !== 'undefined' && process.env ? (process.env as Env) : {}
}

/**
 * 解析实际使用的端口。
 *
 * 优先级：`MDTEXT_DEV_PORT` 环境变量 > {@link DEV_SERVER_PORT}。
 * 端口冲突时不需要改代码：设一个环境变量即可，主进程与 Vite 读的是同一个变量，
 * 因此不会出现"Vite 在 A 端口、主进程去 B 端口找人"的情况。
 */
export function resolveDevServerPort(env: Env = currentEnv()): number {
  const parsed = Number.parseInt(env.MDTEXT_DEV_PORT ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEV_SERVER_PORT
}

/**
 * 解析 dev 模式下主窗口要加载的地址。
 *
 * 优先级：`MDTEXT_DEV_URL`（完整地址，适合反向代理 / 局域网调试）> 由
 * {@link resolveDevServerPort} 拼出的 `http://host:port`。
 * 末尾斜杠会被去掉，保证与 `will-navigate` 里的 origin 比较结果稳定。
 */
export function resolveDevServerUrl(env: Env = currentEnv()): string {
  const override = env.MDTEXT_DEV_URL?.trim()
  if (override) return override.replace(/\/+$/, '')
  return `http://${DEV_SERVER_HOST}:${resolveDevServerPort(env)}`
}

/**
 * dev 地址的 origin —— 主进程 `will-navigate` 白名单用。
 * 解析失败时返回空串（调用方据此退化为"只允许 file://"）。
 */
export function resolveDevServerOrigin(env: Env = currentEnv()): string {
  try {
    return new URL(resolveDevServerUrl(env)).origin
  } catch {
    return ''
  }
}
