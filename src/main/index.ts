import { app, BrowserWindow, ipcMain, shell, session } from 'electron'
import path from 'node:path'
import { setupIpcHandlers } from './ipc'
import { buildMenuData, handleMenuClick, installAppMenu, setMenuThemeId } from './menu'
import { initDatabase, closeDatabase, dbApi } from './db'
import { OssManager } from './oss/manager'

// Electron 30+ webSecurity 行为变更：单设 webPreferences.webSecurity: false 不再
// 完全关掉 CSP/frame-ancestors 检查。需要同时加 Chromium 命令行开关。
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    backgroundColor: '#ffffff',
    title: '墨与石板',
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
  if (loadMode === 'dev' || (loadMode !== 'file' && isDev)) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
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
  // 初始化本地数据库
  await initDatabase()

  OssManager.getInstance()

  // 注册所有业务 IPC handler
  setupIpcHandlers()

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
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error('[inkslate] bootstrap failed:', err)
  app.quit()
})

app.on('window-all-closed', () => {
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
    if (parsedUrl.origin !== 'http://localhost:5173' && parsedUrl.origin !== 'file://') {
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
