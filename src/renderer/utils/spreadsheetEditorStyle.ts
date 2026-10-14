/**
 * 让 x-data-spreadsheet 的"单元格编辑框"与单元格的显示完全一致。
 *
 * 库原本的问题（三个，叠加起来就是"双击编辑时字体变小、格式变了、边框错位"）：
 *
 *  1. 字体写死在 CSS 里：`font: 400 13px Arial, ...`，而画布上单元格文字是按
 *     单元格样式画的（本项目默认 12pt → 16px Helvetica，还可能带粗斜体/自定义颜色）。
 *     → 编辑时字变小、字形颜色都变了。
 *
 *  2. 编辑框背景是库/应用 CSS 给的固定色，不跟单元格自己的底色。
 *     （注意：背景必须**不透明**——进入编辑时单元格原文字仍由下层 canvas 绘制，
 *      透明会让两份文字叠成"双影"。）
 *
 *  3. resetTextareaSize() 按"最长一行不换行要占多宽"来估宽，会把 textarea 横向
 *     撑到比单元格还宽（实测 718px 的单元格被撑到 777px），蓝色编辑边框跟着溢出
 *     → 看起来就是"选中边框错位/变色"。
 *
 *  4. 编辑时库同时画了两个蓝框：选中框（尺寸 = 单元格 + 1.8、高度固定）和编辑框
 *     （高度按内容撑开）。两者左上角重合、下边缘差几个像素 → 看成"蓝框重影"。
 *     这里把**可见的选中框**对齐到编辑框的实际外框，于是只看到一个蓝框，
 *     而且选中框仍在——能清楚看出正在编辑哪个单元格（不要把它藏掉）。
 *
 * 修复思路（运行时不改库源码，与 utils/spreadsheetAutoRowHeight.ts 一致）：
 *   包住 Sheet 内部 Editor 的 setCell()，并在输入时重新同步：
 *     - 字体/行距/颜色/水平对齐 ← 当前选中单元格的合并样式（暗色对比度兜底也生效）
 *     - 背景 ← 单元格自己的底色（不透明，盖住画布上的旧文字）
 *     - 宽度 ← 锁死为单元格宽度（!important，库再想撑宽也改不动），文字像画布一样在格内换行
 *     - 高度 ← 按"换行后的行数"算，保证边打字边看得到全部内容
 *     - padding-top ← 与画布一致（画布是垂直居中：上下各留 (格高 - 行数*行距)/2）
 *     - 选中框 ← 与编辑框外框精确重合（保留可见，消除重影）
 *
 * 失败安全：任何异常都吞掉，绝不影响编辑功能。
 */
import { getFontSizePxByPt } from 'x-data-spreadsheet/src/core/font'
import { countWrappedLines, measureTextWidth } from './spreadsheetAutoRowHeight'

type AnyObj = Record<string, any>

/** Editor 上是否已打补丁的标记（全局 Symbol：dev 下 HMR 重算模块后不会重复包裹） */
const EDITOR_FLAG = Symbol.for('inkslate.spreadsheetEditorStyle.editor')
const ORIGINAL_SET_CELL = Symbol.for('inkslate.spreadsheetEditorStyle.originalSetCell')
const INPUT_BOUND = Symbol.for('inkslate.spreadsheetEditorStyle.inputBound')

/** 与库 editor.js / draw.js 保持一致的常量 */
const CELL_PADDING = 5 // 画布单元格左右内边距（table.js 的 cellPaddingWidth）
const LINE_GAP = 2 // draw.text 的行距：fontPx + 2
/** 编辑框/选中框的边框宽度（库 LESS 里的 2px） */
const FRAME_BORDER = 2

/** 把单元格样式与几何同步到编辑框上 */
function applyCellStyle(editor: AnyObj, proxy: AnyObj): void {
  let style: AnyObj | null = null
  let rect: AnyObj | null = null
  try {
    style = typeof proxy?.getSelectedCellStyle === 'function'
      ? proxy.getSelectedCellStyle()
      : (proxy?.settings?.style || null)
    rect = typeof proxy?.getSelectedRect === 'function' ? proxy.getSelectedRect() : null
  } catch {
    style = null
  }
  if (!style) return

  const font: AnyObj = style.font || {}
  const sizePx = getFontSizePxByPt(font.size ?? 12)
  const lineHeight = sizePx + LINE_GAP
  const wrap = style.textwrap === true
  // 与库 draw.text 的 font 拼接方式一致
  const fontCss = `${font.italic ? 'italic ' : ''}${font.bold ? 'bold ' : ''}${sizePx}px ${font.name || 'Arial'}`

  // textarea 显示文字；textline 是库用来估宽的隐藏元素，两者字体必须一致
  for (const el of [editor.textEl, editor.textlineEl]) {
    if (!el || typeof el.css !== 'function') continue
    el.css('font', fontCss)
    el.css('line-height', `${lineHeight}px`)
    el.css('color', style.color || '')
    el.css('text-align', style.align || 'left')
  }
  const ta = editor.textEl && editor.textEl.el
  if (!ta) return

  // 底色必须用"单元格自己的底色"且不透明：画布上单元格的文字此时还画在下面，
  // 透明底会让两层文字叠在一起（看起来行叠行）；用单元格底色既盖住画布文字，
  // 又保持了原来的格式观感。
  editor.textEl.css('background', style.bgcolor || '#ffffff')

  if (!rect || !ta.style || typeof ta.style.setProperty !== 'function') return

  // 高度：按换行后的行数算（库只按显式 \n 的行数 *默认行高* 估，换行时不够）
  const text = String(editor.inputText != null ? editor.inputText : '')
  let lines = 1
  try {
    const innerWidth = Math.max(20, rect.width - CELL_PADDING * 2)
    lines = wrap && text
      ? countWrappedLines(text, innerWidth, { ...font, size: sizePx }, measureTextWidth, true)
      : Math.max(1, text.split('\n').length)
  } catch {
    lines = Math.max(1, text.split('\n').length)
  }
  const textHeight = lines * lineHeight
  const frameHeight = Math.round(Math.max(rect.height, textHeight + CELL_PADDING * 2))

  /* ⚠️ 关键：把蓝框画在单元格【内部】（border-box，边框内缩）。
   *
   * 库原本把编辑框/选中框放到单元格外面约 1.8px（left - 0.8 + 2px 边框向外），
   * 而祖先容器是 overflow: hidden —— 超出的那一圈会被裁掉，表现就是
   * **只有上边框和左边框有颜色，右边框和下边框消失**（真实截图逐像素确认过）。
   * 改成"外框 = 单元格矩形 + box-sizing: border-box"后边框全部落在格内，
   * 永远不会有超出部分被裁，观感也与 Excel/WPS 一致。 */
  const frame = editor.areaEl && editor.areaEl.el
  if (frame && frame.style && typeof frame.style.setProperty === 'function') {
    frame.style.setProperty('left', `${rect.left}px`, 'important')
    frame.style.setProperty('top', `${rect.top}px`, 'important')
    frame.style.setProperty('width', `${rect.width}px`, 'important')
    frame.style.setProperty('height', `${frameHeight}px`, 'important')
    frame.style.setProperty('box-sizing', 'border-box', 'important')
  }

  // textarea 填满外框内沿（减去左右边框），左右内边距与画布一致（5px）
  const border = FRAME_BORDER
  ta.style.setProperty('box-sizing', 'border-box', 'important')
  ta.style.setProperty('width', `${Math.max(20, rect.width - border * 2)}px`, 'important')
  ta.style.setProperty('height', `${Math.max(12, frameHeight - border * 2)}px`, 'important')
  ta.style.setProperty('padding', `0 ${CELL_PADDING - border}px`, 'important')
  // 垂直位置对齐画布（画布把文字块在单元格里垂直居中）
  const padTop = Math.max(0, Math.round((rect.height - textHeight) / 2) - border)
  ta.style.setProperty('padding-top', `${padTop}px`, 'important')
}

/**
 * 让"选中框"与"编辑框"精确重合。
 *
 * 库在编辑时同时画了两个蓝框：
 *   - 选中框 .x-spreadsheet-selector-area：尺寸 = 单元格 + 1.8，高度固定为单元格高
 *   - 编辑框 .x-spreadsheet-editor-area  ：宽度同，但高度按内容撑开
 * 两者左上角一致、下边缘差几像素，叠在一起就是"蓝框重影/错位"。
 * 这里把**可见的选中框**按编辑框的实际外框对齐（用 bounding rect 差值算，冻结窗格也适用），
 * 于是只看到一个蓝框、而且它仍然在，能清楚看出正在编辑哪个单元格。
 * 关闭编辑时清掉这里加的样式，交回库自己定位。
 */
function alignSelectionToEditor(sheet: AnyObj, editor: AnyObj): void {
  try {
    const root = sheet?.el?.el || sheet?.el
    const edEl = editor?.areaEl?.el
    if (!root || typeof root.querySelectorAll !== 'function' || !edEl) return
    const areas = root.querySelectorAll('.x-spreadsheet-selector-area')
    if (!areas || !areas.length) return
    const edRect = edEl.getBoundingClientRect()
    if (edRect.width <= 0 || edRect.height <= 0) return
    for (const a of areas) {
      if (getComputedStyle(a).display === 'none') continue
      const r = a.getBoundingClientRect()
      // 用"当前外框 → 目标外框"的差值移动，天然兼容冻结窗格/滚动
      const left = parseFloat(a.style.left || '0') + (edRect.left - r.left)
      const top = parseFloat(a.style.top || '0') + (edRect.top - r.top)
      // 与编辑框同样的 border-box：边框画在格内，右/下边框不会被祖先的 overflow 裁掉
      a.style.setProperty('box-sizing', 'border-box', 'important')
      a.style.setProperty('left', `${left}px`, 'important')
      a.style.setProperty('top', `${top}px`, 'important')
      a.style.setProperty('width', `${edRect.width}px`, 'important')
      a.style.setProperty('height', `${edRect.height}px`, 'important')
    }
  } catch {
    /* 忽略 */
  }
}

/** 清掉 alignSelectionToEditor 加的强制样式，交回库自己定位 */
function releaseSelection(sheet: AnyObj): void {
  try {
    const root = sheet?.el?.el || sheet?.el
    if (!root || typeof root.querySelectorAll !== 'function') return
    const areas = root.querySelectorAll('.x-spreadsheet-selector-area')
    for (const a of areas || []) {
      a.style.removeProperty('left')
      a.style.removeProperty('top')
      a.style.removeProperty('width')
      a.style.removeProperty('height')
    }
    const sel = sheet.selector
    if (sel && typeof sel.resetData === 'function') sel.resetData(sheet.data)
  } catch {
    /* 忽略 */
  }
}

/**
 * 给整个 Spreadsheet 装上"编辑框跟随单元格"。
 * 参数既接受 Spreadsheet 实例，也接受 Sheet 实例。返回卸载函数。
 */
export function installSpreadsheetEditorStyle(spreadsheet: AnyObj): () => void {
  const noop = () => {}
  if (!spreadsheet) return noop
  try {
    const sheet = typeof spreadsheet.resetData === 'function'
      ? spreadsheet
      : (spreadsheet.sheet || spreadsheet)
    const editor = sheet?.editor
    if (!editor || typeof editor.setCell !== 'function' || editor[EDITOR_FLAG]) return noop

    const original = editor.setCell.bind(editor)
    const originalClear = typeof editor.clear === 'function' ? editor.clear.bind(editor) : null
    editor[EDITOR_FLAG] = true
    editor[ORIGINAL_SET_CELL] = original

    const sync = () => {
      // 样式/尺寸同步失败绝不能影响编辑本身
      try {
        applyCellStyle(editor, sheet.data)
        alignSelectionToEditor(sheet, editor)
      } catch { /* 忽略 */ }
    }

    editor.setCell = (cell: AnyObj, validator: AnyObj) => {
      const result = original(cell, validator)
      sync()
      return result
    }
    if (originalClear) {
      editor.clear = () => {
        const result = originalClear()
        releaseSelection(sheet)
        return result
      }
    }

    // 打字过程中也要重新算高度（库自己那套估高在换行时不够）
    if (editor.textEl && editor.textEl.el && !editor[INPUT_BOUND]) {
      editor[INPUT_BOUND] = true
      try {
        editor.textEl.el.addEventListener('input', sync)
      } catch { /* 忽略 */ }
    }

    return () => {
      try {
        const orig = editor[ORIGINAL_SET_CELL]
        if (orig) editor.setCell = orig
        if (originalClear) editor.clear = originalClear
        if (editor.textEl && editor.textEl.el) editor.textEl.el.removeEventListener('input', sync)
      } catch { /* 忽略 */ }
    }
  } catch {
    return noop
  }
}
