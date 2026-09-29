/**
 * 修复 x-data-spreadsheet「跨工作表无法复制 / 粘贴」的问题。
 *
 * 原因（库自身的设计缺陷）：
 *   库把剪贴板状态挂在每个工作表的 DataProxy 上（this.clipboard 只存一个
 *   CellRange，不含单元格内容），而切换工作表时 Sheet 会整体换成另一个
 *   DataProxy（sheet.resetData(d)）。于是「在 Sheet1 复制 → 切到 Sheet2 粘贴」
 *   时，新 DataProxy 的 clipboard 是 clear 状态，paste() 直接 return false；
 *   即使范围还在，粘贴也是按「源坐标」从目标表自己的 rows 里取数，取到的
 *   并不是源表内容。所以只有同一个工作表内复制粘贴是正常的。
 *
 * 修复思路（不改库源码，运行时在其原型上打补丁）：
 *   1. copy / cut 时，把选区内的单元格（含样式对象、合并信息）深拷贝成快照；
 *   2. 当粘贴的目标工作表与快照来源不是同一个 DataProxy 时，改用快照写入
 *      目标表；样式是「目标表 styles 数组的下标」，跨表不能直接复用，统一
 *      用 dest.addStyle() 重新映射；
 *   3. 同一个工作表内仍然走库原有的 copy/paste/cutPaste 逻辑，已有行为完全
 *      不变；
 *   4. 快照是模块级的（类似系统剪贴板），切换工作表、编辑器重建都仍然可用。
 */

type AnyObj = Record<string, any>

type SnapCell = {
  ri: number
  ci: number
  cell: AnyObj
  style?: AnyObj
}

type SnapMerge = { sri: number; sci: number; eri: number; eci: number }

export type ClipboardSnapshot = {
  state: 'copy' | 'cut'
  /** 来源工作表的数据代理，同一工作表粘贴时用于回退到库原有逻辑 */
  proxy: any
  /** 来源工作表所属的 Spreadsheet 实例（跨笔记粘贴时不误删来源数据） */
  owner: any
  sri: number
  sci: number
  eri: number
  eci: number
  cells: SnapCell[]
  merges: SnapMerge[]
}

/** 模块级剪贴板快照：跨工作表 / 跨编辑器重建都保留 */
let sharedSnapshot: ClipboardSnapshot | null = null

/**
 * 原型是否已打补丁的标记。
 * 用全局 Symbol 而不是模块内 WeakSet：dev 下 Vite HMR 会重新求值本模块，
 * 模块级状态会重置，若据此再包一层就会出现多层 patchedCopy/patchedPaste。
 */
const PATCHED_FLAG = Symbol.for('inkslate.spreadsheetClipboard.patched')

const clone = <T>(v: T): T => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)))

/** 摘取当前选区内容，生成一份脱离源工作表的快照 */
export function buildClipboardSnapshot(proxy: any, state: 'copy' | 'cut'): ClipboardSnapshot | null {
  const range = proxy?.selector?.range
  if (!range || !proxy.rows) return null
  const { sri, sci, eri, eci } = range

  const cells: SnapCell[] = []
  for (let ri = sri; ri <= eri; ri += 1) {
    const row = proxy.rows.get(ri)
    if (!row || !row.cells) continue
    for (let ci = sci; ci <= eci; ci += 1) {
      const cell = row.cells[ci]
      if (cell === undefined || cell === null) continue
      const styleIdx = cell.style
      const styleObj =
        styleIdx !== undefined && styleIdx !== null ? proxy.styles?.[styleIdx] : undefined
      cells.push({
        ri,
        ci,
        cell: clone(cell),
        style: styleObj ? clone(styleObj) : undefined
      })
    }
  }

  const merges: SnapMerge[] = []
  const mergeList: any[] = proxy.merges?._ || []
  for (const cr of mergeList) {
    if (cr && typeof cr.intersects === 'function' && cr.intersects(range)) {
      merges.push({ sri: cr.sri, sci: cr.sci, eri: cr.eri, eci: cr.eci })
    }
  }

  return {
    state,
    proxy,
    owner: proxy.__xSheetOwner,
    sri,
    sci,
    eri,
    eci,
    cells,
    merges
  }
}

/** 与库里的 canPaste 等价：把要写入的区域和合并单元格做冲突检查 */
function canPasteSnapshot(dest: any, snap: ClipboardSnapshot, dstRange: any, error: (msg: string) => void): boolean {
  const srn = snap.eri - snap.sri + 1
  const scn = snap.eci - snap.sci + 1
  const check = { sri: dstRange.sri, sci: dstRange.sci, eri: dstRange.eri, eci: dstRange.eci }
  if (srn > dstRange.eri - dstRange.sri + 1) check.eri = dstRange.sri + srn - 1
  if (scn > dstRange.eci - dstRange.sci + 1) check.eci = dstRange.sci + scn - 1
  if (dest.merges && typeof dest.merges.intersects === 'function' && dest.merges.intersects(check)) {
    // 与库中 locale 的 error.pasteForMergedCell 文案一致（应用固定使用简体中文）
    error('无法对合并的单元格执行此操作')
    return false
  }
  return true
}

function isSameDocument(snap: ClipboardSnapshot, dest: any): boolean {
  return !!(snap.owner && dest?.__xSheetOwner && snap.owner === dest.__xSheetOwner)
}

/** 跨表「剪切」：粘贴完成后清空来源工作表的原选区 */
function clearSnapshotSource(snap: ClipboardSnapshot): void {
  const src = snap.proxy
  if (!src || !src.rows) return
  for (let ri = snap.sri; ri <= snap.eri; ri += 1) {
    const row = src.rows.get(ri)
    if (!row || !row.cells) continue
    for (let ci = snap.sci; ci <= snap.eci; ci += 1) {
      const cell = row.cells[ci]
      if (cell && cell.editable === false) continue
      delete row.cells[ci]
    }
  }
  const list: any[] = src.merges?._
  if (Array.isArray(list)) {
    src.merges._ = list.filter(
      cr =>
        !(
          cr.sri >= snap.sri &&
          cr.sci >= snap.sci &&
          cr.eri <= snap.eri &&
          cr.eci <= snap.eci
        )
    )
  }
}

/**
 * 把快照写入目标工作表（复刻库中 copyPaste 的平铺行为，但数据来自快照）。
 * what: all | text | format；剪切语义下与库一致，忽略 what 整体搬移。
 */
export function pasteSnapshotInto(
  dest: any,
  snap: ClipboardSnapshot,
  dstRange: any,
  what: 'all' | 'text' | 'format'
): void {
  const mode = snap.state === 'cut' ? 'all' : what
  dest.changeData(() => {
    if (mode === 'all' || mode === 'format') {
      dest.rows.deleteCells(dstRange, mode)
      dest.merges.deleteWithin(dstRange)
    }
    const srn = snap.eri - snap.sri + 1
    const scn = snap.eci - snap.sci + 1
    const { sri: dsri, sci: dsci, eri: deri, eci: deci } = dstRange
    const CellRange = dest.selector.range.constructor

    for (const item of snap.cells) {
      const i = item.ri - snap.sri
      const j = item.ci - snap.sci
      // 与库一致：选区比源区域大时平铺重复
      for (let ii = dsri; ii <= deri; ii += srn) {
        for (let jj = dsci; jj <= deci; jj += scn) {
          const nri = ii + i
          const nci = jj + j
          const ncell: AnyObj = clone(item.cell)
          if (mode !== 'text') {
            // 样式下标是「每张表各自 styles 数组的下标」，跨表必须重映射
            if (item.style !== undefined) ncell.style = dest.addStyle(clone(item.style))
            else delete ncell.style
          }
          dest.rows.setCell(nri, nci, ncell, mode)
          if (mode !== 'text' && ncell.merge) {
            const [rn, cn] = ncell.merge
            if (rn > 0 || cn > 0) {
              dest.merges.add(new CellRange(nri, nci, nri + rn, nci + cn))
            }
          }
        }
      }
    }

    if (snap.state === 'cut' && isSameDocument(snap, dest)) {
      clearSnapshotSource(snap)
    }
  })
}

/** 给工作表的数据代理打上 owner 标记，便于判断来源/目标是否同一份表格 */
function tagSheetProxies(sheet: any): void {
  const tag = (d: any) => {
    if (d && typeof d === 'object') d.__xSheetOwner = sheet
  }
  tag(sheet?.sheet?.data)
  if (Array.isArray(sheet?.datas)) sheet.datas.forEach(tag)
  // 后续新增的工作表（bottombar 底部标签 / loadData）也要带上标记
  if (typeof sheet?.addSheet === 'function' && !sheet.__xSheetAddSheetWrapped) {
    const origAddSheet = sheet.addSheet
    sheet.addSheet = function wrappedAddSheet(this: any, ...args: any[]) {
      const d = origAddSheet.apply(this, args)
      tag(d)
      return d
    }
    sheet.__xSheetAddSheetWrapped = true
  }
}

/**
 * 安装跨工作表复制粘贴修复。传入 Spreadsheet 实例即可，重复调用安全。
 * 应在 sheet.loadData() 之前调用，这样 loadData 新建的 DataProxy 也会被标记。
 */
export function installCrossSheetClipboardFix(sheet: any): void {
  const active = sheet?.sheet?.data
  if (!active) return
  tagSheetProxies(sheet)

  const proto = Object.getPrototypeOf(active)
  if (!proto || proto[PATCHED_FLAG]) return
  const origCopy = proto.copy
  const origCut = proto.cut
  const origPaste = proto.paste
  if (
    typeof origCopy !== 'function' ||
    typeof origCut !== 'function' ||
    typeof origPaste !== 'function'
  ) {
    // 库结构变化时不打补丁，宁可保持原样也不要弄坏
    console.warn('[spreadsheet] 未找到 DataProxy.copy/cut/paste，跳过跨表剪贴板修复')
    return
  }
  proto[PATCHED_FLAG] = true

  proto.copy = function patchedCopy(this: any) {
    const snap = buildClipboardSnapshot(this, 'copy')
    if (snap) sharedSnapshot = snap
    return origCopy.call(this)
  }

  proto.cut = function patchedCut(this: any) {
    const snap = buildClipboardSnapshot(this, 'cut')
    if (snap) sharedSnapshot = snap
    return origCut.call(this)
  }

  proto.paste = function patchedPaste(this: any, what: 'all' | 'text' | 'format' = 'all', error: (msg: string) => void = () => {}) {
    const snap = sharedSnapshot
    // 同表粘贴：完全走库原有逻辑，保持既有行为（含撤消/画笔格式等）
    if (snap && snap.proxy !== this) {
      const dstRange = this.selector.range
      if (!canPasteSnapshot(this, snap, dstRange, error)) return false
      pasteSnapshotInto(this, snap, dstRange, what)
      // 剪切只生效一次（与库的 cutPaste 会 clear clipboard 保持一致）
      if (snap.state === 'cut') sharedSnapshot = null
      return true
    }
    const ok = origPaste.call(this, what, error)
    if (ok && snap && snap.state === 'cut' && snap.proxy === this) sharedSnapshot = null
    return ok
  }
}
