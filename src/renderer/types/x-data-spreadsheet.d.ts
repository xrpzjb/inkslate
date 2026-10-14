/**
 * x-data-spreadsheet 深路径导入的类型声明。
 * 库只给入口（src/index.d.ts）写了声明，深路径模块没有声明文件，
 * TS 会报 TS7016（implicitly has an 'any' type）；这里按实际导出补上。
 */
declare module 'x-data-spreadsheet/src/core/font' {
  /** pt → px（库 fontSizes 映射表；未列出的值原样返回） */
  export function getFontSizePxByPt(pt: number): number
}

declare module 'x-data-spreadsheet/src/locale/zh-cn' {
  const zhCN: Record<string, string>
  export default zhCN
}
