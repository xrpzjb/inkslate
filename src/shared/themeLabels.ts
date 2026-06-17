/** 主题 id 到中文显示名的统一映射
 *  - main 进程的菜单（src/main/menu.ts）和 renderer 进程的 StatusBar
 *    都从这里取值，避免命名漂移
 */
export const THEME_LABELS: Record<string, string> = {
  light: '默认主题',
  cyberpunk: '赛博朋克',
  monet: '莫奈',
  newspaper: '报纸风',
  forest: '森林',
  sunset: '落日',
  dracula: '德古拉',
  nordic: '北欧',
  pastoral: '田园',
  dark: '暗黑',
  dune: '沙丘',
  solarized: '护眼配色',
  auto: '跟随系统'
}

export function getThemeLabel(id: string): string {
  return THEME_LABELS[id] ?? id
}
