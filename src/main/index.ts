import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { setupIpcHandlers } from './ipc'
import { buildMenuData, handleMenuClick, installAppMenu, setMenuThemeId } from './menu'
import { initDatabase, closeDatabase, dbApi } from './db'
import { OssManager } from './oss/manager'

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
      nodeIntegration: false
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

  // 创建窗口
  createMainWindow()

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
