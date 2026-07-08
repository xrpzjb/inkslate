import { BrowserWindow, dialog, app, Menu } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { THEME_LABELS } from '../shared/themeLabels'
import { sendToRenderer } from '.'

export interface MenuItemData {
  id?: string
  label?: string
  /** 子菜单 */
  submenu?: MenuItemData[]
  accelerator?: string
  /** 是否禁用 */
  disabled?: boolean
  type?: 'normal' | 'separator' | 'radio' | 'checkbox'
  checked?: boolean
  arg?: any
}

export interface MenuData {
  label: string
  submenu: MenuItemData[]
}

let currentThemeId = 'light'

/** 单选子菜单点击事件 */
function pickTheme(id: string) {
  console.log('[menu] pickTheme:', id)
  currentThemeId = id
  sendToRenderer(IPC_CHANNELS.THEME_CHANGE, id)
  sendToRenderer('menu:rebuild')
}

function pickNewNote(arg: { format: string; language?: string }) {
  sendToRenderer('menu:new-note', arg)
}

export function buildMenuData(): MenuData[] {
  const themeSubmenu: MenuItemData[] = [
    { id: 'theme-light', label: THEME_LABELS.light, type: 'radio', checked: currentThemeId === 'light', arg: 'light', accelerator: undefined },
    { id: 'theme-cyberpunk', label: THEME_LABELS.cyberpunk, type: 'radio', checked: currentThemeId === 'cyberpunk', arg: 'cyberpunk' },
    { id: 'theme-monet', label: THEME_LABELS.monet, type: 'radio', checked: currentThemeId === 'monet', arg: 'monet' },
    { id: 'theme-newspaper', label: THEME_LABELS.newspaper, type: 'radio', checked: currentThemeId === 'newspaper', arg: 'newspaper' },
    { id: 'theme-forest', label: THEME_LABELS.forest, type: 'radio', checked: currentThemeId === 'forest', arg: 'forest' },
    { id: 'theme-sunset', label: THEME_LABELS.sunset, type: 'radio', checked: currentThemeId === 'sunset', arg: 'sunset' },
    { id: 'theme-dracula', label: THEME_LABELS.dracula, type: 'radio', checked: currentThemeId === 'dracula', arg: 'dracula' },
    { id: 'theme-nordic', label: THEME_LABELS.nordic, type: 'radio', checked: currentThemeId === 'nordic', arg: 'nordic' },
    { id: 'theme-pastoral', label: THEME_LABELS.pastoral, type: 'radio', checked: currentThemeId === 'pastoral', arg: 'pastoral' },
    { id: 'theme-dark', label: THEME_LABELS.dark, type: 'radio', checked: currentThemeId === 'dark', arg: 'dark' },
    { id: 'theme-dune', label: THEME_LABELS.dune, type: 'radio', checked: currentThemeId === 'dune', arg: 'dune' },
    { type: 'separator' },
    { id: 'theme-solarized', label: THEME_LABELS.solarized, type: 'radio', checked: currentThemeId === 'solarized', arg: 'solarized' },
    { id: 'theme-auto', label: THEME_LABELS.auto, type: 'radio', checked: currentThemeId === 'auto', arg: 'auto' }
  ]

  return [
    {
      label: '文件',
      submenu: [
        {
          id: 'new', label: '新建',
          submenu: [
            { id: 'new-markdown', label: 'Markdown 笔记', accelerator: 'Ctrl+N', arg: { format: 'markdown' } },
            { id: 'new-html', label: 'HTML 笔记', accelerator: 'Ctrl+Shift+H', arg: { format: 'html' } },
            { id: 'new-richtext', label: '富文本笔记', accelerator: 'Ctrl+Shift+R', arg: { format: 'richtext' } },
            {
              id: 'new-code', label: '代码笔记',
              submenu: [
                { id: 'new-code-js', label: 'JavaScript', arg: { format: 'code', language: 'javascript' } },
                { id: 'new-code-ts', label: 'TypeScript', arg: { format: 'code', language: 'typescript' } },
                { id: 'new-code-py', label: 'Python', arg: { format: 'code', language: 'python' } },
                { id: 'new-code-java', label: 'Java', arg: { format: 'code', language: 'java' } },
                { id: 'new-code-go', label: 'Go', arg: { format: 'code', language: 'go' } },
                { id: 'new-code-rust', label: 'Rust', arg: { format: 'code', language: 'rust' } },
                { id: 'new-code-cpp', label: 'C++', arg: { format: 'code', language: 'cpp' } },
                { id: 'new-code-cs', label: 'C#', arg: { format: 'code', language: 'csharp' } },
                { id: 'new-code-py-web', label: 'HTML', arg: { format: 'code', language: 'html' } },
                { id: 'new-code-css', label: 'CSS', arg: { format: 'code', language: 'css' } },
                { id: 'new-code-json', label: 'JSON', arg: { format: 'code', language: 'json' } },
                { id: 'new-code-sql', label: 'SQL', arg: { format: 'code', language: 'sql' } },
                { id: 'new-code-shell', label: 'Shell', arg: { format: 'code', language: 'shell' } },
                { id: 'new-code-md', label: '纯文本', arg: { format: 'code', language: 'plaintext' } }
              ]
            }
          ]
        },
        { id: 'new-notebook', label: '新建笔记本', accelerator: 'Ctrl+Alt+N' },
        { type: 'separator' },
        { id: 'save', label: '保存', accelerator: 'Ctrl+S' },
        { type: 'separator' },
        {
          id: 'recycle-bin', label: '回收站',
          submenu: [
            { id: 'open-recycle-bin', label: '打开回收站', accelerator: 'Ctrl+Shift+Backspace' },
            { type: 'separator' },
            { id: 'empty-recycle-bin', label: '清空回收站' },
            { id: 'recycle-bin-settings', label: '保留天数设置...' }
          ]
        },
        { type: 'separator' },
        { id: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { id: 'undo', label: '撤销', accelerator: 'Ctrl+Z' },
        { id: 'redo', label: '重做', accelerator: 'Ctrl+Shift+Z' },
        { type: 'separator' },
        { id: 'cut', label: '剪切', accelerator: 'Ctrl+X' },
        { id: 'copy', label: '复制', accelerator: 'Ctrl+C' },
        { id: 'paste', label: '粘贴', accelerator: 'Ctrl+V' },
        { id: 'select-all', label: '全选', accelerator: 'Ctrl+A' },
        { type: 'separator' },
        { id: 'find', label: '查找', accelerator: 'Ctrl+F' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { id: 'toggle-sidebar', label: '切换侧栏', accelerator: 'Ctrl+B' },
        { id: 'toggle-preview', label: '切换预览', accelerator: 'Ctrl+P' },
        { id: 'toggle-editor', label: '切换编辑器', accelerator: 'Ctrl+Shift+E' },
        { type: 'separator' },
        { id: 'theme', label: '主题', submenu: themeSubmenu },
        { type: 'separator' },
        { id: 'reload', label: '重新加载' },
        { id: 'devtools', label: '开发者工具' },
        { type: 'separator' },
        { id: 'reset-zoom', label: '重置缩放' },
        { id: 'zoom-in', label: '放大' },
        { id: 'zoom-out', label: '缩小' },
        { type: 'separator' },
        { id: 'fullscreen', label: '全屏' }
      ]
    },
    {
      label: '笔记本',
      submenu: [
        { id: 'git-push', label: '推送到 Git 仓库', accelerator: 'Ctrl+Shift+S' },
        { id: 'git-pull', label: '从 Git 拉取', accelerator: 'Ctrl+Shift+D' },
        { type: 'separator' },
        { id: 'git-settings', label: 'Git 同步设置...' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { id: 'about', label: '关于 墨与石板' },
        { id: 'shortcuts', label: '快捷键' }
      ]
    }
  ]
}

export async function handleMenuClick(id: string, arg: any) {
  switch (id) {
    // 文件 → 新建
    case 'new-markdown': pickNewNote({ format: 'markdown' }); return
    case 'new-html': pickNewNote({ format: 'html' }); return
    case 'new-richtext': pickNewNote({ format: 'richtext' }); return
    case 'new-code-js': pickNewNote({ format: 'code', language: 'javascript' }); return
    case 'new-code-ts': pickNewNote({ format: 'code', language: 'typescript' }); return
    case 'new-code-py': pickNewNote({ format: 'code', language: 'python' }); return
    case 'new-code-java': pickNewNote({ format: 'code', language: 'java' }); return
    case 'new-code-go': pickNewNote({ format: 'code', language: 'go' }); return
    case 'new-code-rust': pickNewNote({ format: 'code', language: 'rust' }); return
    case 'new-code-cpp': pickNewNote({ format: 'code', language: 'cpp' }); return
    case 'new-code-cs': pickNewNote({ format: 'code', language: 'csharp' }); return
    case 'new-code-py-web': pickNewNote({ format: 'code', language: 'html' }); return
    case 'new-code-css': pickNewNote({ format: 'code', language: 'css' }); return
    case 'new-code-json': pickNewNote({ format: 'code', language: 'json' }); return
    case 'new-code-sql': pickNewNote({ format: 'code', language: 'sql' }); return
    case 'new-code-shell': pickNewNote({ format: 'code', language: 'shell' }); return
    case 'new-code-md': pickNewNote({ format: 'code', language: 'plaintext' }); return
    case 'new-notebook': sendToRenderer(IPC_CHANNELS.MENU_NEW_NOTEBOOK); return
    case 'save': sendToRenderer(IPC_CHANNELS.MENU_SAVE); return
    case 'open-recycle-bin': sendToRenderer(IPC_CHANNELS.MENU_OPEN_RECYCLE_BIN); return
    case 'recycle-bin-settings': sendToRenderer(IPC_CHANNELS.MENU_RECYCLE_BIN_SETTINGS); return
    case 'empty-recycle-bin': {
      const win = BrowserWindow.getFocusedWindow()
      const result = win
        ? await dialog.showMessageBox(win, {
            type: 'warning',
            title: '清空回收站',
            message: '确定要清空回收站吗？所有已删除的笔记和笔记本将被永久删除，无法恢复。',
            buttons: ['取消', '永久删除'],
            defaultId: 0,
            cancelId: 0
          })
        : { response: 0 }
      if (result.response === 1) {
        sendToRenderer('menu:empty-recycle-bin')
      }
      return
    }
    case 'quit': app.quit(); return
    // 编辑
    case 'undo': sendToRenderer('menu:edit', 'undo'); return
    case 'redo': sendToRenderer('menu:edit', 'redo'); return
    case 'cut': sendToRenderer('menu:edit', 'cut'); return
    case 'copy': sendToRenderer('menu:edit', 'copy'); return
    case 'paste': sendToRenderer('menu:edit', 'paste'); return
    case 'select-all': sendToRenderer('menu:edit', 'selectAll'); return
    case 'find': sendToRenderer('menu:find'); return
    // 视图
    case 'toggle-sidebar': sendToRenderer(IPC_CHANNELS.MENU_TOGGLE_SIDEBAR); return
    case 'toggle-preview': sendToRenderer(IPC_CHANNELS.MENU_TOGGLE_PREVIEW); return
    case 'toggle-editor': sendToRenderer('menu:toggle-editor'); return
    case 'theme-light': pickTheme('light'); return
    case 'theme-cyberpunk': pickTheme('cyberpunk'); return
    case 'theme-monet': pickTheme('monet'); return
    case 'theme-newspaper': pickTheme('newspaper'); return
    case 'theme-forest': pickTheme('forest'); return
    case 'theme-sunset': pickTheme('sunset'); return
    case 'theme-dracula': pickTheme('dracula'); return
    case 'theme-nordic': pickTheme('nordic'); return
    case 'theme-pastoral': pickTheme('pastoral'); return
    case 'theme-dark': pickTheme('dark'); return
    case 'theme-dune': pickTheme('dune'); return
    case 'theme-solarized': pickTheme('solarized'); return
    case 'theme-auto': pickTheme('auto'); return
    // 视图操作
    case 'reload': sendToRenderer('menu:reload'); return
    case 'devtools': {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.toggleDevTools()
      return
    }
    case 'reset-zoom': sendToRenderer('menu:zoom', 'reset'); return
    case 'zoom-in': sendToRenderer('menu:zoom', 'in'); return
    case 'zoom-out': sendToRenderer('menu:zoom', 'out'); return
    case 'fullscreen': sendToRenderer('menu:fullscreen'); return
    // 笔记本
    case 'git-push': sendToRenderer('menu:git-push'); return
    case 'git-pull': sendToRenderer('menu:git-pull'); return
    case 'git-settings': sendToRenderer('menu:git-settings'); return
    // 帮助
    case 'about':
      dialog.showMessageBox({
        type: 'info',
        title: '关于 墨与石板',
        message: '墨与石板',
        detail: `一款支持 HTML 显示的 Markdown 桌面笔记应用\n\n作者：heimin\n本项目全程使用 minimax m3 开发\n\n版本: ${app.getVersion()}`
      })
      return
    case 'shortcuts': sendToRenderer('menu:show-shortcuts'); return
  }
}

/** 通知主进程当前主题（让单选状态同步） */
export function setMenuThemeId(id: string) {
  currentThemeId = id
}

export function installAppMenu(): void {
  Menu.setApplicationMenu(null)
}
