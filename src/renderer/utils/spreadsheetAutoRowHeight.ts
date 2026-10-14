/**
 * 智能表格：文字超出单元格时自动换行 + 行高自适应。
 *
 * 背景（库的行为）：
 *   x-data-spreadsheet 的「自动换行」（textwrap）只影响画布上的文字排布：
 *   超出列宽的文字会被拆成多行画出来，但行高（rows.getHeight）完全不变，
 *   于是多出来的行会压到下面的行上，看起来像是"文字溢出、把别的行盖住"。
 *   库自身没有"按内容自动调整行高"的能力（只有手动拖拽行边框）。
 *
 * 修复思路（不改库源码，运行时在实例上打补丁，与 utils/spreadsheetClipboard.ts 一致）：
 *   1. 给每个工作表的 DataProxy.rows.getHeight 包一层：返回
 *      max(原行高, 按内容算出的最小行高)。库的所有布局/渲染/滚动条
 *      （sumHeight / cellRect / viewRange / rowEach / totalHeight）
 *      都走 rows.getHeight，因此这一处补丁即可让整表联动；
 *   2. 行高是"算出来的"而不是写进数据的：不会被存进笔记 content，
 *      也不会触发 change → 不会污染历史记录 / 不会写盘；
 *   3. 计算方式与库 draw.text 的换行算法逐字对齐（逐字符累加宽度、
 *      每字符 +1px、行距 font.size + 2），保证"算出来的高度"正好
 *      容得下"画出来的行数"；
 *   4. 默认行高只增不减：单元格手动拖矮的行，内容需要时仍然会撑高
 *      （max(原行高, 需要高度)）；
 *   5. 结果按行缓存（缓存键包含文本 / 样式 / 列宽 / 默认样式指纹，
 *      数据一变键就变），避免每次渲染都对所有可见行重复测量。
 */

type AnyObj = Record<string, any>

export type SpreadsheetFont = {
  name?: string
  size?: number
  bold?: boolean
  italic?: boolean
}

// 库 renderCell 在画文字前会把 font.size 从 pt 换算成 px
// （getFontSizePxByPt），行距 / 换行宽度都按 px 算，
// 这里必须用同一套换算，否则量出来的行数对不上。
import { getFontSizePxByPt } from 'x-data-spreadsheet/src/core/font'

/** 单元格字体的 px 口径（与库 renderCell 的换算一致） */
function fontPxOf(font: SpreadsheetFont): number {
  return getFontSizePxByPt(font.size ?? 12)
}

/** 文字宽度测量函数（按 CSS px 返回） */
export type MeasureTextFn = (text: string, font: SpreadsheetFont) => number

/** 单元格左右内边距，与库 table.js 的 cellPaddingWidth 一致 */
const CELL_PADDING = 5
/** 库 DrawBox.innerWidth/innerHeight 的额外扣除（-2） */
const CELL_INSET = 2
/** 库 draw.text 的行距：font.size + 2 */
const LINE_GAP = 2
/** 自动行高上限（Excel 的行高上限量级），避免超长文本把一行撑到几千 px */
const MAX_AUTO_ROW_HEIGHT = 409

// ===== 文字测量 =====

let sharedCanvas: HTMLCanvasElement | null | undefined

/**
 * 用 canvas 测文字宽度（与库 draw.text 用的是同一套 font 字符串，
 * 度量结果才可能对得上）。无 canvas 的环境（Node 自检）退化成按字符估算。
 */
export function measureTextWidth(text: string, font: SpreadsheetFont): number {
  const size = font.size ?? 12
  const name = font.name || 'Arial'
  if (sharedCanvas === undefined) {
    try {
      sharedCanvas = typeof document === 'undefined' ? null : document.createElement('canvas')
    } catch {
      sharedCanvas = null
    }
  }
  const ctx = sharedCanvas ? sharedCanvas.getContext('2d') : null
  if (ctx) {
    // 与库 draw.text 的 font 拼接方式保持一致（多余的空格会被 CSS 解析忽略）
    ctx.font = `${font.italic ? 'italic' : ''} ${font.bold ? 'bold' : ''} ${size}px ${name}`
    return ctx.measureText(text).width
  }
  // 粗略估算：CJK / 全角按 1em，其余按 0.56em
  let width = 0
  for (const ch of String(text)) {
    width += isWideChar(ch) ? size : size * 0.56
  }
  return width
}

/** 是否宽字符（CJK / 全角符号），用于无 canvas 时的宽度估算 */
function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x115f) // Hangul Jamo
    || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) // CJK 部首 / 汉字 / 假名
    || (code >= 0xac00 && code <= 0xd7a3) // Hangul 音节
    || (code >= 0xf900 && code <= 0xfaff) // CJK 兼容表意文字
    || (code >= 0xfe30 && code <= 0xfe6f) // CJK 兼容形式
    || (code >= 0xff00 && code <= 0xff60) // 全角 ASCII
    || (code >= 0xffe0 && code <= 0xffe6) // 全角符号
  )
}

// ===== 换行行数计算（与库 draw.text 的换行算法一致） =====

/**
 * 计算 text 在 innerWidth 宽的盒子里会画成几行。
 * wrap=false 时只做"显式换行符分行"（库对 \n 总是分行，与 textwrap 无关）。
 */
export function countWrappedLines(
  text: string,
  innerWidth: number,
  font: SpreadsheetFont,
  measureText: MeasureTextFn = measureTextWidth,
  wrap = true,
): number {
  const src = String(text ?? '')
  if (src === '') return 1
  // 盒子窄到放不下任何字符时按"显式换行符分多少行"算，避免行数异常
  if (innerWidth <= 0) return src.split('\n').length
  let count = 0
  for (const line of src.split('\n')) {
    if (line === '') {
      count += 1
      continue
    }
    if (!wrap || measureText(line, font) <= innerWidth) {
      count += 1
      continue
    }
    // 逐字符换行：与打过 inkslate-wrap-v3 补丁的库 draw.text 完全一致——
    // 先判断"加上这个字符会不会超宽"，超了就换行（库原始版本是"已经超宽"之后
    // 才换行，会让每行末尾溢出一个字符被人看见"被切掉"）。
    let lineWidth = 0
    let lineLen = 0
    for (let i = 0; i < line.length; i += 1) {
      const charWidth = measureText(line[i], font) + 1
      if (lineLen > 0 && lineWidth + charWidth > innerWidth) {
        count += 1
        lineWidth = 0
        lineLen = 0
      }
      lineLen += 1
      lineWidth += charWidth
    }
    if (lineLen > 0) count += 1
  }
  return Math.max(count, 1)
}

// ===== 行高计算 =====

/** 单元格的字体（单元格样式覆盖默认样式，与库 helper.merge 的结果一致） */
function effectiveFont(rawStyle: AnyObj | null | undefined, defaultFont: SpreadsheetFont): SpreadsheetFont {
  return { ...defaultFont, ...(rawStyle?.font || {}) }
}

/** 单元格是否自动换行（未显式设置时取表格默认样式） */
function effectiveWrap(rawStyle: AnyObj | null | undefined, defaultWrap: boolean): boolean {
  if (!rawStyle || rawStyle.textwrap === undefined || rawStyle.textwrap === null) {
    return defaultWrap
  }
  return rawStyle.textwrap === true
}

/**
 * 算出 ri 行"内容需要的最小行高"（不含手动设置的行高）。
 * 没有需要撑高的内容时返回 0。
 */
export function computeAutoRowHeight(
  proxy: AnyObj,
  ri: number,
  measureText: MeasureTextFn = measureTextWidth,
): number {
  const rows = proxy?.rows
  const row = rows?.get?.(ri)
  if (!row || !row.cells) return 0
  const styles: AnyObj[] = proxy.styles || []
  const defaultStyle = proxy.settings?.style || {}
  const defaultFont: SpreadsheetFont = defaultStyle.font || {}
  const defaultWrap = defaultStyle.textwrap === true
  const cols = proxy.cols

  let needed = 0
  for (const ciKey of Object.keys(row.cells)) {
    const ci = parseInt(ciKey, 10)
    const cell = row.cells[ciKey]
    const text = cell?.text
    if (typeof text !== 'string' || text.length === 0) continue

    const rawStyle = (cell.style !== undefined && cell.style !== null)
      ? styles[cell.style] || null
      : null
    const font = effectiveFont(rawStyle, defaultFont)
    const wrap = effectiveWrap(rawStyle, defaultWrap)

    // 合并单元格：横向合并把宽度加起来；跨行合并的行高变化会牵连多行，
    // 暂不参与自动撑高（保持原行高）
    let width = typeof cols?.getWidth === 'function' ? cols.getWidth(ci) || 0 : 0
    if (Array.isArray(cell.merge)) {
      const [rn, cn] = cell.merge
      if (rn > 0) continue
      for (let i = 1; i <= cn; i += 1) {
        width += typeof cols?.getWidth === 'function' ? cols.getWidth(ci + i) || 0 : 0
      }
    }
    const innerWidth = width - CELL_PADDING * 2 - CELL_INSET
    if (innerWidth <= 0) continue

    const lines = countWrappedLines(text, innerWidth, { ...font, size: fontPxOf(font) }, measureText, wrap)
    if (lines <= 1) continue

    // 行距与库 draw.text 一致（px 口径的 font.size + 2），上下各留一个单元格内边距
    const lineHeight = fontPxOf(font) + LINE_GAP
    needed = Math.max(needed, lines * lineHeight + CELL_PADDING * 2)
  }
  return Math.min(needed, MAX_AUTO_ROW_HEIGHT)
}

/**
 * 行内容的指纹：文本 / 样式 / 列宽 / 表格默认样式任一变化都会变。
 * 注意样式不能只记样式下标——loadData 换内容后同一个下标可能指向完全不同的样式。
 */
function rowSignature(proxy: AnyObj, ri: number): string {
  const rows = proxy.rows
  const row = rows?.get?.(ri)
  if (!row || !row.cells) return ''
  const styles: AnyObj[] = proxy.styles || []
  const defaultStyle = proxy.settings?.style || {}
  const defaultFont: SpreadsheetFont = defaultStyle.font || {}
  const defaultWrap = defaultStyle.textwrap === true
  const cols = proxy.cols

  let sig = `${defaultWrap ? 1 : 0}|${defaultFont.name || ''}|${defaultFont.size || 0}`
  for (const ciKey of Object.keys(row.cells)) {
    const ci = parseInt(ciKey, 10)
    const cell = row.cells[ciKey]
    const text = cell?.text
    if (typeof text !== 'string' || text.length === 0) continue

    const rawStyle = (cell.style !== undefined && cell.style !== null)
      ? styles[cell.style] || null
      : null
    const rawFont = rawStyle?.font
    const wrap = effectiveWrap(rawStyle, defaultWrap)

    let width = typeof cols?.getWidth === 'function' ? cols.getWidth(ci) || 0 : 0
    let mergedFlag = ''
    if (Array.isArray(cell.merge)) {
      const [rn, cn] = cell.merge
      if (rn > 0) {
        // 跨行合并不参与撑高，但要占一个指纹位，否则合并/取消合并后指纹不变
        sig += `\u0002${ciKey}\u0001m`
        continue
      }
      for (let i = 1; i <= cn; i += 1) {
        width += typeof cols?.getWidth === 'function' ? cols.getWidth(ci + i) || 0 : 0
      }
      mergedFlag = `\u0001${cn}`
    }
    sig += `\u0002${ciKey}\u0001${wrap ? 1 : 0}${mergedFlag}\u0001${rawFont?.name || ''}\u0001${rawFont?.size || 0}\u0001${rawFont?.bold ? 1 : 0}\u0001${rawFont?.italic ? 1 : 0}\u0001${width}\u0001${text}`
  }
  return sig
}

// ===== 安装到工作表实例 =====

/** rows 上是否已挂自动行高的标记（全局 Symbol：dev 下 HMR 重算模块后不会重复包裹） */
const ROWS_FLAG = Symbol.for('inkslate.spreadsheetAutoRowHeight.rows')
/** sheet 上是否已包 resetData 的标记 */
const SHEET_FLAG = Symbol.for('inkslate.spreadsheetAutoRowHeight.sheet')
/** sheet 上保存的原始 resetData（重复安装 / 卸载时都能恢复原样） */
const ORIGINAL_RESET_DATA = Symbol.for('inkslate.spreadsheetAutoRowHeight.originalResetData')

/**
 * 给一个工作表数据代理挂上"自动行高"。
 * 返回是否安装成功（已装过 / 不是合法的 DataProxy 时返回 false）。
 *
 * 失败安全：包装函数整体包在 try/catch 里，任何意外（样式字段形状异常、
 * 度量失败、数据被外部改成奇怪结构…）都退回库的原始行高。
 * 自动行高是纯增强，绝不允许它影响表格渲染，更不允许影响应用启动。
 */
export function installAutoRowHeight(proxy: AnyObj): boolean {
  try {
    const rows = proxy?.rows
    if (!rows || typeof rows.getHeight !== 'function' || rows[ROWS_FLAG]) return false
    const original = rows.getHeight.bind(rows)
    // 每行缓存：key 是行内容指纹，value 是内容需要的最小行高
    const cache = new Map<number, { key: string; height: number }>()
    rows[ROWS_FLAG] = true
    rows.getHeight = (ri: number): number => {
      const base = original(ri)
      // 隐藏行高度为 0，保持原样
      if (!base) return base
      try {
        const key = rowSignature(proxy, ri)
        const hit = cache.get(ri)
        if (hit && hit.key === key) return Math.max(base, hit.height)
        const auto = computeAutoRowHeight(proxy, ri)
        cache.set(ri, { key, height: auto })
        return Math.max(base, auto)
      } catch {
        // 量不出来就用原始行高：宁可少撑高，也不能让渲染出错
        return base
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * 给整个 Spreadsheet 装上自动行高。
 *
 * ⚠️ 关键点：`resetData` 不在 `Spreadsheet` 实例上，而在它内部的 `Sheet` 对象上
 * （`Spreadsheet.sheet.resetData`）。`Spreadsheet.loadData()` 会为每个工作表
 * 新建 DataProxy，然后调用 `this.sheet.resetData(nd)` 切过去——所以**必须**包住
 * Sheet 的 resetData，否则 loadData / 切换工作表之后渲染用的新 DataProxy
 * 完全没被覆盖（曾经的 bug：行高一直停留在构造时那个空代理上，永远 25px）。
 *
 * 参数既接受 Spreadsheet 实例，也接受 Sheet 实例（内部会自己找到对的那个）。
 * 返回卸载函数（恢复 resetData）。任何异常都不会向外抛。
 */
export function installSpreadsheetAutoRowHeight(spreadsheet: AnyObj): () => void {
  const noop = () => {}
  if (!spreadsheet) return noop
  try {
    // Spreadsheet -> 它的 Sheet 对象；如果本身就是 Sheet（有 resetData）则直接用
    const sheet = typeof spreadsheet.resetData === 'function'
      ? spreadsheet
      : (spreadsheet.sheet || spreadsheet)

    installAutoRowHeight(sheet.data)
    const originalResetData = typeof sheet.resetData === 'function'
      ? sheet.resetData.bind(sheet)
      : null
    // symbol 标记挂在 any 上，避开 Record<string, any> 的索引类型限制
    const markedSheet = sheet as any
    if (originalResetData && !markedSheet[SHEET_FLAG]) {
      markedSheet[SHEET_FLAG] = true
      // 保存原始方法：重复安装时不会把"包装方法"误存成原始方法
      markedSheet[ORIGINAL_RESET_DATA] = originalResetData
      markedSheet.resetData = (data: AnyObj) => {
        // 新工作表挂载失败也不能影响这次 resetData
        try { installAutoRowHeight(data) } catch { /* 忽略 */ }
        return originalResetData(data)
      }
    }
    return () => {
      try {
        const original = markedSheet[ORIGINAL_RESET_DATA]
        if (original) markedSheet.resetData = original
      } catch { /* 忽略 */ }
    }
  } catch {
    return noop
  }
}
