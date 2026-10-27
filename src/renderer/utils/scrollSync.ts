/**
 * 编辑区 ↔ 预览区 滚动同步。
 *
 * 两边高度完全不一致（编辑器每行等宽等距、预览里代码块/图片/表格高度各异），
 * 所以不能用"滚动百分比"硬套，否则越到后面偏得越多。
 *
 * 做法：以标题为锚点。两侧各自提供「标题 id → 内容坐标」的锚点表，滚动时找到
 * 源侧当前视口顶部所在的那一段（相邻两个标题之间），再映射到目标侧的同一段。
 * 段内怎么映射见 mapScrollTop 的注释 —— 端点 1:1 对齐、高度差压到中段，保证
 * 标题在视口顶部附近时左右完全对齐。
 * 首尾各补一个伪锚点（0→0、底部→底部），保证文档开头结尾是对齐的。
 *
 * 防环：程序化设置目标侧 scrollTop 后短期加锁，忽略它自己被触发的 scroll 事件。
 */
import { uniqueSlug } from './headings'

export type SyncPaneKind = 'editor' | 'preview'

/** 锚点：id 用来在两侧配对，top 是该标题在滚动内容坐标系里的偏移 */
export interface ScrollAnchor {
  id: string
  top: number
}

export interface SyncPane {
  /** 实际滚动容器 */
  el: HTMLElement
  /** 实时收集锚点（每次同步时调用，内容变化后无需重新登记） */
  anchors: () => ScrollAnchor[]
}

const panes: Partial<Record<SyncPaneKind, SyncPane>> = {}
// 程序化滚动的静默窗口：这之前该侧自己的 scroll 事件不算用户滚动
const quietUntil: Record<SyncPaneKind, number> = { editor: 0, preview: 0 }
const QUIET_MS = 120

let frame = 0
let pendingSource: SyncPaneKind | null = null

const other = (kind: SyncPaneKind): SyncPaneKind => (kind === 'editor' ? 'preview' : 'editor')

/** 登记某一侧的滚动容器；返回注销函数 */
export function registerSyncPane(kind: SyncPaneKind, pane: SyncPane): () => void {
  panes[kind] = pane
  return () => {
    if (panes[kind] === pane) delete panes[kind]
  }
}

/** 某一侧发生用户滚动时调用（内部按帧合并，避免每个 scroll 事件都算一遍） */
export function notifyPaneScroll(kind: SyncPaneKind): void {
  if (performance.now() < quietUntil[kind]) return
  pendingSource = kind
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const source = pendingSource
    pendingSource = null
    if (source) syncFrom(source)
  })
}

function syncFrom(sourceKind: SyncPaneKind): void {
  const source = panes[sourceKind]
  const targetKind = other(sourceKind)
  const target = panes[targetKind]
  if (!source || !target) return

  const sourceEl = source.el
  const targetEl = target.el
  if (!sourceEl.isConnected || !targetEl.isConnected) return

  const targetY = mapScrollTop(
    sourceEl.scrollTop,
    maxScroll(sourceEl),
    source.anchors(),
    target.anchors(),
    maxScroll(targetEl)
  )
  if (targetY === null) return
  if (Math.abs(targetEl.scrollTop - targetY) < 1) return

  quietUntil[targetKind] = performance.now() + QUIET_MS
  targetEl.scrollTop = targetY
}

const maxScroll = (el: HTMLElement) => Math.max(0, el.scrollHeight - el.clientHeight)

/**
 * 把源侧滚动位置映射到目标侧。
 *
 * 关键点在「段内怎么插值」。两栏排版不同（编辑器行高 1.4、预览 1.7，代码块/表格/图片
 * 高度也完全不同），所以一段里两侧的高度差是实打实的。如果按比例线性插值，段越往深处
 * 偏差越大——标题在视口顶时会左右对齐，往下滚 100px 就错开几十像素，看起来就是"标题
 * 对不上"。
 *
 * 这里改成「端点钉住 + 中段均摊」：
 *   - 段首、段尾各留一段 1:1（斜率 1）的区间，让标题在视口顶部附近时两侧完全对齐；
 *   - 高度差全部压进中间那段用线性爬升吸收，中段长度按高度差自适应：中段速度约为 2 倍
 *     （两栏高度差超过段长 40% 时会更陡一些），所以不会出现"猛地一跳"；
 *   - 剩余预算里尾端占大头（1:9）：向下滚动时用户盯的是即将露头的标题，尾端更重要。
 *
 * 导出仅为可单测/复用；页面里由 syncFrom 调用。
 */
export function mapScrollTop(
  sourceY: number,
  sourceMax: number,
  sourceAnchors: ScrollAnchor[],
  targetAnchors: ScrollAnchor[],
  targetMax: number
): number | null {
  const clampTarget = (y: number) => Math.min(Math.max(y, 0), targetMax)

  if (sourceMax <= 0) return null

  // 两侧按 id 配对
  const targetById = new Map<string, number>()
  for (const a of targetAnchors) {
    if (!targetById.has(a.id)) targetById.set(a.id, a.top)
  }
  const pairs: Array<{ s: number; t: number }> = []
  for (const a of sourceAnchors) {
    const t = targetById.get(a.id)
    if (t === undefined) continue
    pairs.push({ s: a.top, t })
  }

  // 没有任何配对锚点（文档没标题 / 标题对不上）：整体比例
  if (pairs.length === 0) {
    return clampTarget((sourceY / sourceMax) * targetMax)
  }

  pairs.push({ s: 0, t: 0 })
  pairs.push({ s: sourceMax, t: targetMax })
  pairs.sort((a, b) => a.s - b.s)

  // 目标坐标必须单调递增，否则映射会来回跳：丢弃倒挂的锚点
  const mono: Array<{ s: number; t: number }> = []
  for (const p of pairs) {
    const prev = mono[mono.length - 1]
    if (prev && (p.s <= prev.s || p.t < prev.t)) continue
    mono.push(p)
  }
  if (mono.length < 2) return clampTarget((sourceY / sourceMax) * targetMax)

  const y = Math.min(Math.max(sourceY, 0), sourceMax)
  // 找到 y 所在的段 [a, b]
  let i = 0
  for (let k = 0; k < mono.length - 1; k++) {
    if (mono[k].s <= y && y <= mono[k + 1].s) { i = k; break }
    if (k === mono.length - 2) i = k
  }
  const a = mono[i]
  const b = mono[i + 1]
  const span = b.s - a.s
  if (span <= 4) return clampTarget(a.t)

  const mismatch = (b.t - a.t) - span
  const p = y - a.s

  // 中段占比：至少 10%（留出吸收空间），至多 40%，按高度差自适应；
  // 上限决定中段最陡能到多少速度（1 + 1/0.4 ≈ 2.5 倍），也决定了 1:1 对齐区能伸多远
  const midFrac = Math.min(0.4, Math.max(0.1, Math.abs(mismatch) / span))
  const pinFrac = 1 - midFrac
  const headPin = span * pinFrac * 0.1
  const tailPin = span * pinFrac * 0.9
  const mid = span - headPin - tailPin

  let extra: number
  if (p <= headPin) extra = 0
  else if (p >= span - tailPin) extra = mismatch
  else extra = mid > 0 ? (mismatch * (p - headPin)) / mid : mismatch

  return clampTarget(a.t + p + extra)
}

/**
 * 预览侧锚点：所有带 id 的标题相对预览滚动容器的内容坐标。
 * 标题 id 由 utils/headings.ts 的 attachHeadingIds 注入，与编辑器侧一致。
 */
export function collectPreviewAnchors(root: HTMLElement, scrollEl: HTMLElement): ScrollAnchor[] {
  const containerTop = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop
  const nodes = Array.from(root.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')) as HTMLElement[]
  const anchors: ScrollAnchor[] = []
  for (const el of nodes) {
    const id = el.id
    if (!id) continue
    anchors.push({ id, top: el.getBoundingClientRect().top - containerTop })
  }
  return anchors
}

/** 编辑器侧的只读文档视图（结构化类型，避免 utils 反向依赖 CodeMirror） */
export interface EditorDocSource {
  /** 文档总行数 */
  lines: number
  /** 第 i 行（1 基）的纯文本 */
  lineText: (i: number) => string
}

/**
 * 扫出文档里的 ATX 标题行：id 规则与 utils/headings.ts 的 attachHeadingIds 完全一致
 * （同一份 uniqueSlug、同样的顺序），这样两边 id 才能配上。
 * 代码块（``` / ~~~）里的 # 不算标题，否则 "`# 注释`" 这类行会让后续 id 全部错位。
 */
export function scanEditorHeadings(doc: EditorDocSource): Array<{ id: string; line: number }> {
  const headings: Array<{ id: string; line: number }> = []
  const usedIds = new Set<string>()
  let fenceChar = ''
  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.lineText(i)
    const fence = /^\s*(`{3,}|~{3,})/.exec(text)
    if (fence) {
      const ch = fence[1][0]
      if (!fenceChar) fenceChar = ch
      else if (fenceChar === ch) fenceChar = ''
      continue
    }
    if (fenceChar) continue
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(text)
    if (!m) continue
    headings.push({ id: uniqueSlug(m[1], usedIds), line: i })
  }
  return headings
}
