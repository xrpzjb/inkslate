import { app, BrowserWindow, ipcMain, shell, session } from 'electron'
import path from 'node:path'
import { setupIpcHandlers } from './ipc'
import { buildMenuData, handleMenuClick, installAppMenu, setMenuThemeId } from './menu'
import { initDatabase, closeDatabase, dbApi, repairNotePaths } from './db'
import { OssManager } from './oss/manager'
import { resolveDevServerOrigin, resolveDevServerUrl } from '../shared/devServer'
import { installGpuCacheSelfHeal } from './gpuCacheSelfHeal'
import { installStartupErrorLogging, logStartup, startupLogPath } from './startupLog'

// 启动黑匣子：从第一行代码就开始记录，崩在哪一步都有据可查
// （Electron 主进程原生崩溃时 stdout 往往什么都留不下来）
installStartupErrorLogging()
logStartup('module-loaded', { electron: process.versions.electron, node: process.versions.node, log: startupLogPath() })

// Electron 30+ webSecurity 行为变更：单设 webPreferences.webSecurity: false 不再
// 完全关掉 CSP/frame-ancestors 检查。需要同时加 Chromium 命令行开关。
logStartup('electron-app-object', { available: !!app, hasWhenReady: typeof app?.whenReady === 'function' })
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')

// 硬件加速兜底开关（排查用，默认不开）：
// 少数 Windows 机器上 Electron 会在 GPU / 显示初始化阶段原生崩溃
// （进程退出码 0x80000003 = STATUS_BREAKPOINT，日志里连 app ready 都到不了，
// 也不会打印任何业务日志）。这类问题与业务代码无关，用 MDTEXT_DISABLE_GPU=1
// 启动即可关闭硬件加速绕开；必须在 app ready 之前调用才生效。
if (process.env.MDTEXT_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
  logStartup('hardware-acceleration-disabled')
}

// Ctrl+C 掐掉 dev 进程会 TerminateProcess 掉 electron，可能留下只写了一半的
// GPU/WebGPU 磁盘缓存，导致之后每次启动都在 Chromium 初始化阶段原生崩溃
// （0x80000003，没有任何日志）。这里在 GPU 进程起来之前做自愈，详见该模块注释。
installGpuCacheSelfHeal()
logStartup('selfheal-done')

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/**
 * dev 模式下主窗口加载的地址。
 *
 * 曾经这里是写死的 `http://localhost:5173`：Vite 端口被别的项目占用时会静默换到
 * 5174，而主进程仍然去 5173 拉页面 —— 结果窗口里显示的是"占用 5173 的那个项目"
 * （曾把 Voxel English 游戏的界面当成 Inkslate 显示出来）。
 * 现在地址与 Vite 共用 src/shared/devServer.ts 里的同一份定义，可用
 * `MDTEXT_DEV_PORT` / `MDTEXT_DEV_URL` 覆盖，两边不会再错位。
 */
const devServerUrl = resolveDevServerUrl()
/** `will-navigate` 白名单用的 origin（解析失败时为空串 → 只允许 file://） */
const devServerOrigin = resolveDevServerOrigin()

/** dev 模式等待 Vite 就绪：重试间隔 / 最大次数（约 20s） */
const DEV_LOAD_RETRY_MS = 500
const DEV_LOAD_MAX_RETRIES = 40

/**
 * dev 模式下重试加载 dev server。
 *
 * `npm run dev` 里 Vite 与 Electron 是并行的，dev server 还没 listen 时 loadURL 会
 * 直接失败（白屏 + ERR_CONNECTION_REFUSED）；Vite 中途重启也一样。
 * 这里只重试"主文档加载失败"，-3（ERR_ABORTED，被新的加载顶掉）不重试。
 */
function attachDevLoadRetry(win: BrowserWindow): void {
  let retries = 0
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return
    if (retries >= DEV_LOAD_MAX_RETRIES) {
      console.error(
        `[dev] 加载 ${devServerUrl} 失败（${errorDescription}）。` +
        `请确认 Vite 已在监听该端口（端口可用 MDTEXT_DEV_PORT 覆盖）。`
      )
      return
    }
    retries++
    setTimeout(() => {
      win.loadURL(devServerUrl).catch(() => {})
    }, DEV_LOAD_RETRY_MS)
  })
}

function createMainWindow(): void {
  logStartup('window-create-start')
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    title: '墨与石板',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // 关闭 webSecurity：本地桌面应用需要主窗口可以加载任意外部 URL（网址笔记的 iframe）。
      // 关闭后 iframe 不受主窗口 CSP 限制，可以嵌入任何网站。
      // —— 桌面 app 风险可接受；如果未来支持渲染远程内容，需要重新评估
      webSecurity: false
    }
  })

  const loadMode = process.env.MDTEXT_LOAD
  const useDevServer = loadMode === 'dev' || (loadMode !== 'file' && isDev)
  logStartup('window-created', { useDevServer, devServerUrl })
  if (useDevServer) {
    // 打出真实地址：以后"界面怎么不是笔记"这类问题看日志一眼就能定位
    console.log('[dev] loading renderer from', devServerUrl)
    mainWindow.loadURL(devServerUrl).catch(() => {})
    attachDevLoadRetry(mainWindow)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch(() => {})
  }
  // 仅开发模式自动打开开发者工具；打包后的正式版绝不自动打开
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function bootstrap(): Promise<void> {
  logStartup('bootstrap-start')
  // 初始化本地数据库
  await initDatabase()
  logStartup('db-ready')

  // 启动时修复因移动/删除笔记本导致的路径错乱
  try { repairNotePaths() } catch (e) { console.error('[db] repairNotePaths failed:', e) }
  logStartup('paths-repaired')

  OssManager.getInstance()
  logStartup('oss-manager-ready')

  // 注册所有业务 IPC handler
  setupIpcHandlers()
  logStartup('ipc-ready')

  // CSP 放宽：把主窗口响应的 frame-src 改成 *
  // —— 网址笔记的 iframe 需要主窗口允许加载任意外部 URL
  // 同时挂在 defaultSession 和主窗口 webContents.session（renderer 进程 iframe 走的是后者）
  const relaxCsp = (details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void) => {
    const headers: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(details.responseHeaders ?? {})) {
      headers[k.toLowerCase()] = v as string[]
    }
    const csp = headers['content-security-policy']?.[0]
    if (csp) {
      let newCsp = csp
        .replace(/frame-src [^;]*/gi, 'frame-src *')
        .replace(/child-src [^;]*/gi, 'child-src *')
      if (!/frame-src\s/i.test(newCsp)) {
        newCsp = newCsp.trim().endsWith(';')
          ? `${newCsp} frame-src *;`
          : `${newCsp}; frame-src *;`
      }
      console.log('[csp-debug] original:', csp)
      console.log('[csp-debug] new     :', newCsp)
      headers['content-security-policy'] = [newCsp]
      callback({ responseHeaders: headers })
      return
    }
    callback({ responseHeaders: details.responseHeaders })
  }
  session.defaultSession.webRequest.onHeadersReceived(relaxCsp)

  // 创建窗口
  createMainWindow()

  // 关键：把 CSP 放宽也挂到主窗口自己的 session 上。
  // —— iframe 是 renderer 进程里的资源，挂在 defaultSession 不一定拦得到；
  //   必须挂到主窗口 webContents.session 才行
  mainWindow?.webContents.session.webRequest.onHeadersReceived(relaxCsp)

  installAppMenu()

  // 启动后自动清理回收站过期项（按 settings.recycleBin.autoCleanup + retentionDays）
  setTimeout(() => {
    try {
      const settings = dbApi.getSettings()
      if (settings.recycleBin?.autoCleanup && settings.recycleBin.retentionDays > 0) {
        const result = dbApi.purgeExpired(settings.recycleBin.retentionDays)
        if (result.notes + result.notebooks > 0) {
          console.log(`[recycleBin] auto-purged ${result.notes} notes, ${result.notebooks} notebooks`)
        }
      }
    } catch (e) {
      console.error('[recycleBin] auto-purge failed:', e)
    }
  }, 3000)

  ipcMain.handle('menu:get-data', () => buildMenuData())
  // 接收菜单点击
  ipcMain.on('menu:clicked', (_e, id: string, arg: any) => {
    handleMenuClick(id, arg).catch(err => console.error('[menu] handler failed:', err))
  })
  ipcMain.on('menu:theme-changed', (_e, id: string) => {
    setMenuThemeId(id)
  })

  // 窗口控制
  ipcMain.on('window:minimize', () => { mainWindow?.minimize() })
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => { mainWindow?.close() })
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
  // 通知渲染进程最大化状态变化
  mainWindow?.on('maximize', () => { mainWindow?.webContents.send('window:maximize-change', true) })
  mainWindow?.on('unmaximize', () => { mainWindow?.webContents.send('window:maximize-change', false) })
}

app.whenReady().then(() => {
  logStartup('app-ready')
  return bootstrap()
}).catch((err) => {
  logStartup('bootstrap-failed', err)
  console.error('[inkslate] bootstrap failed:', err)
  app.quit()
})

app.on('window-all-closed', () => {
  logStartup('window-all-closed')
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // 白名单与上面加载的地址同源（同样来自 src/shared/devServer.ts）：
    // 端口换了以后站内跳转不会被误判成外链丢给系统浏览器。
    if (parsedUrl.origin !== devServerOrigin && parsedUrl.origin !== 'file://') {
      event.preventDefault()
      shell.openExternal(navigationUrl)
    }
  })
})

/** 暴露 mainWindow 供其他模块使用 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args)
}
