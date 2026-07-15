/**
 * 主题调色板定义
 * 每个主题对应 [data-theme='X'] 块的 22 个 CSS 变量。
 * 编辑器配色在 CodeEditor.tsx 里根据 editorTheme id 单独写。
 */

export interface AppThemePalette {
  'bg-primary': string
  'bg-secondary': string
  'bg-tertiary': string
  'bg-sidebar': string
  'bg-hover': string
  'bg-active': string
  'bg-tabbar': string
  'bg-preview': string
  'text-primary': string
  'text-secondary': string
  'text-tertiary': string
  'text-inverse': string
  'border-color': string
  'border-strong': string
  'accent-color': string
  'accent-hover': string
  'accent-bg': string
  'code-bg': string
  'code-text': string
  'shadow-sm': string
  'shadow-md': string
  'scrollbar-thumb': string
  'scrollbar-thumb-hover': string
  'color-scheme': 'light' | 'dark'
}

const defaultLight: AppThemePalette = {
  'bg-primary': '#ffffff',
  'bg-secondary': '#f7f8fa',
  'bg-tertiary': '#f9fafb',
  'bg-sidebar': '#F2F2F2',
  'bg-hover': '#f5f5f5',
  'bg-active': '#dce3ed',
  'bg-tabbar': '#f5f7fa',
  'bg-preview': '#ffffff',
  'text-primary': '#1e293b',
  'text-secondary': '#64748b',
  'text-tertiary': '#94a3b8',
  'text-inverse': '#ffffff',
  'border-color': '#e2e8f0',
  'border-strong': '#cbd5e1',
  'accent-color': '#3b82f6',
  'accent-hover': '#2563eb',
  'accent-bg': '#eff6ff',
  'code-bg': '#f1f5f9',
  'code-text': '#1e293b',
  'shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
  'shadow-md': '0 4px 12px rgba(0, 0, 0, 0.08)',
  'scrollbar-thumb': '#cbd5e1',
  'scrollbar-thumb-hover': '#94a3b8',
  'color-scheme': 'light',
}

const darknight: AppThemePalette = {
  'bg-primary': '#1e1e1e',
  'bg-secondary': '#202020',
  'bg-tertiary': '#2a2a2b',
  'bg-sidebar': '#161616',
  'bg-hover': '#2d2d2e',
  'bg-active': '#094771',
  'bg-tabbar': '#1a1a1a',
  'bg-preview': '#252525',
  'text-primary': '#e8e8e8',
  'text-secondary': '#b0b0b0',
  'text-tertiary': '#808080',
  'text-inverse': '#1a1a1a',
  'border-color': '#3a3a3a',
  'border-strong': '#505050',
  'accent-color': '#4fc3f7',
  'accent-hover': '#81d4fa',
  'accent-bg': '#1e3a4c',
  'code-bg': '#2d2d2d',
  'code-text': '#e8e8e8',
  'shadow-sm': '0 1px 2px rgba(0,0,0,0.3)',
  'shadow-md': '0 4px 12px rgba(0,0,0,0.5)',
  'scrollbar-thumb': '#4a4a4a',
  'scrollbar-thumb-hover': '#6a6a6a',
  'color-scheme': 'dark',
}

const cyberpunk: AppThemePalette = {
  'bg-primary': '#0d0221',
  'bg-secondary': '#150734',
  'bg-tertiary': '#1d0e4a',
  'bg-sidebar': '#0a0118',
  'bg-hover': '#240a5e',
  'bg-active': '#3a1a7e',
  'bg-tabbar': '#1a0e50',
  'bg-preview': '#150734',
  'text-primary': '#f0f0ff',
  'text-secondary': '#c4b5fd',
  'text-tertiary': '#8b7fc7',
  'text-inverse': '#0d0221',
  'border-color': '#ff00aa55',
  'border-strong': '#ff00aa',
  'accent-color': '#ff00aa',
  'accent-hover': '#ff4dcd',
  'accent-bg': '#2a0d52',
  'code-bg': '#1a0a3e',
  'code-text': '#f0f0ff',
  'shadow-sm': '0 0 4px rgba(255, 0, 170, 0.3)',
  'shadow-md': '0 0 12px rgba(255, 0, 170, 0.4)',
  'scrollbar-thumb': '#ff00aa',
  'scrollbar-thumb-hover': '#ff4dcd',
  'color-scheme': 'dark',
}

const dracula: AppThemePalette = {
  'bg-primary': '#282a36',
  'bg-secondary': '#1c1c28',
  'bg-tertiary': '#343746',
  'bg-sidebar': '#21222c',
  'bg-hover': '#44475a',
  'bg-active': '#44475a',
  'bg-tabbar': '#343746',
  'bg-preview': '#21222c',
  'text-primary': '#f8f8f2',
  'text-secondary': '#bd93f9',
  'text-tertiary': '#6272a4',
  'text-inverse': '#282a36',
  'border-color': '#44475a',
  'border-strong': '#6272a4',
  'accent-color': '#bd93f9',
  'accent-hover': '#caa9ff',
  'accent-bg': '#44475a',
  'code-bg': '#1e1f29',
  'code-text': '#f8f8f2',
  'shadow-sm': '0 1px 2px rgba(0,0,0,0.3)',
  'shadow-md': '0 4px 12px rgba(0,0,0,0.5)',
  'scrollbar-thumb': '#44475a',
  'scrollbar-thumb-hover': '#6272a4',
  'color-scheme': 'dark',
}

const dune: AppThemePalette = {
  'bg-primary': '#f4e4bc',
  'bg-secondary': '#d9c896',
  'bg-tertiary': '#efe0c0',
  'bg-sidebar': '#e6d3a3',
  'bg-hover': '#d9c088',
  'bg-active': '#c9a96e',
  'bg-tabbar': '#e0cba0',
  'bg-preview': '#e6d3a3',
  'text-primary': '#3d2817',
  'text-secondary': '#6b4a2b',
  'text-tertiary': '#8b6a45',
  'text-inverse': '#f4e4bc',
  'border-color': '#c9a96e',
  'border-strong': '#a88650',
  'accent-color': '#c87533',
  'accent-hover': '#a85d20',
  'accent-bg': '#e6d3a3',
  'code-bg': '#e6d3a3',
  'code-text': '#3d2817',
  'shadow-sm': '0 1px 2px rgba(61, 40, 23, 0.1)',
  'shadow-md': '0 4px 12px rgba(61, 40, 23, 0.15)',
  'scrollbar-thumb': '#c9a96e',
  'scrollbar-thumb-hover': '#a88650',
  'color-scheme': 'light',
}

const monet: AppThemePalette = {
  'bg-primary': '#f5f1ff',
  'bg-secondary': '#dcd2ef',
  'bg-tertiary': '#f0eaf9',
  'bg-sidebar': '#ebe4f7',
  'bg-hover': '#ddd0ec',
  'bg-active': '#cab8e0',
  'bg-tabbar': '#e0d8f2',
  'bg-preview': '#ebe4f7',
  'text-primary': '#3d3a5c',
  'text-secondary': '#5b5780',
  'text-tertiary': '#7d7a9e',
  'text-inverse': '#f5f1ff',
  'border-color': '#cab8e0',
  'border-strong': '#a89bc8',
  'accent-color': '#a48bd9',
  'accent-hover': '#8a6fc4',
  'accent-bg': '#ddd0ec',
  'code-bg': '#ebe4f7',
  'code-text': '#3d3a5c',
  'shadow-sm': '0 1px 2px rgba(61, 58, 92, 0.08)',
  'shadow-md': '0 4px 12px rgba(61, 58, 92, 0.12)',
  'scrollbar-thumb': '#cab8e0',
  'scrollbar-thumb-hover': '#a89bc8',
  'color-scheme': 'light',
}

// ============ 7. 鎶ョ焊椋庯紙缇婄毊绾革紝妫曢粍琛嚎鎰燂級 ============
const newspaper: AppThemePalette = {
  'bg-primary': '#f4ecd8',
  'bg-secondary': '#d4c8a0',
  'bg-tertiary': '#eee2c8',
  'bg-sidebar': '#e8dec0',
  'bg-hover': '#d9caa0',
  'bg-active': '#c9b888',
  'bg-tabbar': '#e0d4b0',
  'bg-preview': '#e8dec0',
  'text-primary': '#3a2a18',
  'text-secondary': '#5c4530',
  'text-tertiary': '#8a7050',
  'text-inverse': '#f4ecd8',
  'border-color': '#c9b888',
  'border-strong': '#a89868',
  'accent-color': '#8b4513',
  'accent-hover': '#6b350f',
  'accent-bg': '#e8dec0',
  'code-bg': '#e8dec0',
  'code-text': '#3a2a18',
  'shadow-sm': '0 1px 2px rgba(58, 42, 24, 0.1)',
  'shadow-md': '0 4px 12px rgba(58, 42, 24, 0.15)',
  'scrollbar-thumb': '#c9b888',
  'scrollbar-thumb-hover': '#a89868',
  'color-scheme': 'light',
}

const forest: AppThemePalette = {
  'bg-primary': '#1a2820',
  'bg-secondary': '#243a2e',
  'bg-tertiary': '#2d4638',
  'bg-sidebar': '#1f2e25',
  'bg-hover': '#345a45',
  'bg-active': '#467057',
  'bg-tabbar': '#2d4638',
  'bg-preview': '#243a2e',
  'text-primary': '#d8e4dc',
  'text-secondary': '#a8c0b0',
  'text-tertiary': '#7a9484',
  'text-inverse': '#1a2820',
  'border-color': '#345a45',
  'border-strong': '#467057',
  'accent-color': '#7fc285',
  'accent-hover': '#9ed5a3',
  'accent-bg': '#243a2e',
  'code-bg': '#243a2e',
  'code-text': '#d8e4dc',
  'shadow-sm': '0 1px 2px rgba(0,0,0,0.4)',
  'shadow-md': '0 4px 12px rgba(0,0,0,0.5)',
  'scrollbar-thumb': '#345a45',
  'scrollbar-thumb-hover': '#467057',
  'color-scheme': 'dark',
}

const sunset: AppThemePalette = {
  'bg-primary': '#fff0e5',
  'bg-secondary': '#ffe0c8',
  'bg-tertiary': '#ffe8d5',
  'bg-sidebar': '#ffe0c8',
  'bg-hover': '#ffcca8',
  'bg-active': '#ffb088',
  'bg-tabbar': '#ffd8b8',
  'bg-preview': '#ffe0c8',
  'text-primary': '#5c2818',
  'text-secondary': '#8a4028',
  'text-tertiary': '#b86850',
  'text-inverse': '#fff0e5',
  'border-color': '#ffb088',
  'border-strong': '#e89060',
  'accent-color': '#e85d2a',
  'accent-hover': '#c44a18',
  'accent-bg': '#ffe0c8',
  'code-bg': '#ffe0c8',
  'code-text': '#5c2818',
  'shadow-sm': '0 1px 2px rgba(92, 40, 24, 0.1)',
  'shadow-md': '0 4px 12px rgba(92, 40, 24, 0.15)',
  'scrollbar-thumb': '#ffb088',
  'scrollbar-thumb-hover': '#e89060',
  'color-scheme': 'light',
}

const nordic: AppThemePalette = {
  'bg-primary': '#f5f7fa',
  'bg-secondary': '#d4dce6',
  'bg-tertiary': '#eef1f5',
  'bg-sidebar': '#e8ecf1',
  'bg-hover': '#d8dfe6',
  'bg-active': '#c0cad4',
  'bg-tabbar': '#e0e6ec',
  'bg-preview': '#e8ecf1',
  'text-primary': '#2c3e50',
  'text-secondary': '#4a5d72',
  'text-tertiary': '#7a8a9c',
  'text-inverse': '#ffffff',
  'border-color': '#d0d8e0',
  'border-strong': '#b0bccc',
  'accent-color': '#5b8cb8',
  'accent-hover': '#4677a3',
  'accent-bg': '#dde6f0',
  'code-bg': '#e8ecf1',
  'code-text': '#2c3e50',
  'shadow-sm': '0 1px 2px rgba(44, 62, 80, 0.08)',
  'shadow-md': '0 4px 12px rgba(44, 62, 80, 0.12)',
  'scrollbar-thumb': '#c0cad4',
  'scrollbar-thumb-hover': '#a0acb8',
  'color-scheme': 'light',
}

const pastoral: AppThemePalette = {
  'bg-primary': '#f5f7e8',
  'bg-secondary': '#d4d8b8',
  'bg-tertiary': '#eef0d8',
  'bg-sidebar': '#e8ecd0',
  'bg-hover': '#d8dcb0',
  'bg-active': '#c0c890',
  'bg-tabbar': '#e2e6c0',
  'bg-preview': '#e8ecd0',
  'text-primary': '#3a4818',
  'text-secondary': '#5a6828',
  'text-tertiary': '#7a8850',
  'text-inverse': '#f5f7e8',
  'border-color': '#c0c890',
  'border-strong': '#a8b070',
  'accent-color': '#7a9a3a',
  'accent-hover': '#5e7c28',
  'accent-bg': '#e8ecd0',
  'code-bg': '#e8ecd0',
  'code-text': '#3a4818',
  'shadow-sm': '0 1px 2px rgba(58, 72, 24, 0.08)',
  'shadow-md': '0 4px 12px rgba(58, 72, 24, 0.12)',
  'scrollbar-thumb': '#c0c890',
  'scrollbar-thumb-hover': '#a8b070',
  'color-scheme': 'light',
}

// ============ 主题注册表 ============
export type AppThemeId =
  | 'light'        // 默认
  | 'dark'         // 暗黑
  | 'cyberpunk'    // 赛博朋克
  | 'dracula'      // 德古拉
  | 'dune'         // 沙丘
  | 'monet'        // 莫奈（待做）
  | 'newspaper'    // 报纸风（待做）
  | 'forest'       // 森林（待做）
  | 'sunset'       // 落日（待做）
  | 'nordic'       // 北欧（待做）
  | 'pastoral'     // 田园（待做）
  | 'solarized'    // 护眼配色（保留）

export const appThemes: Record<AppThemeId, AppThemePalette> = {
  'light': defaultLight,
  'dark': darknight,
  'cyberpunk': cyberpunk,
  'dracula': dracula,
  'dune': dune,
  'monet': monet,
  'newspaper': newspaper,
  'forest': forest,
  'sunset': sunset,
  'nordic': nordic,
  'pastoral': pastoral,
    'solarized': {
    'bg-primary': '#fdf6e3',
    'bg-secondary': '#d8d0b0',
    'bg-tertiary': '#f5efd8',
    'bg-sidebar': '#d8d2bc',
    'bg-hover': '#e3dfc8',
    'bg-active': '#d8d1ba',
    'bg-tabbar': '#e5e0c8',
    'bg-preview': '#f0e8d2',
    'text-primary': '#586e75',
    'text-secondary': '#657b83',
    'text-tertiary': '#93a1a1',
    'text-inverse': '#fdf6e3',
    'border-color': '#d8d1ba',
    'border-strong': '#c0b894',
    'accent-color': '#268bd2',
    'accent-hover': '#1a6cb0',
    'accent-bg': '#eee8d5',
    'code-bg': '#eee8d5',
    'code-text': '#586e75',
    'shadow-sm': '0 1px 2px rgba(0,0,0,0.05)',
    'shadow-md': '0 4px 12px rgba(0,0,0,0.08)',
    'scrollbar-thumb': '#c0b894',
    'scrollbar-thumb-hover': '#93a1a1',
    'color-scheme': 'light',
  },
}

export const appThemeLabels: Record<AppThemeId, string> = {
  'light': '默认主题',
  'dark': '暗黑',
  'cyberpunk': '赛博朋克',
  'dracula': '德古拉',
  'dune': '沙丘',
  'monet': '莫奈',
  'newspaper': '报纸风',
  'forest': '森林',
  'sunset': '落日',
  'nordic': '北欧',
  'pastoral': '田园',
  'solarized': '护眼配色',
}
