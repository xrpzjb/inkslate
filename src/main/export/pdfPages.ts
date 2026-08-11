/**
 * 用 pdfjs-dist 精确解析 PDF 每页文本，把标题映射到真实页码。
 * 背景：Chromium 的 printToPDF 按块（block）分页，图片/表格在页底放不下会被整块推到下一页，
 * 因此不能用 "标题位置 / 每页高度" 去估算页码 —— 那会在存在跨页块时整体偏移。
 * 这里改为直接搜索渲染出来的 PDF 文本，命中标题所在页，页码必然准确。
 */

/** 动态 import pdfjs（ESM）。主进程是 CommonJS，tsc 会把 import() 改写为 require()，
 *  而 pdfjs 只有 .mjs 构建，require 会抛 ERR_REQUIRE_ESM，所以用 Function 构造绕过改写。 */
function loadPdfjs(): Promise<any> {
  // @ts-ignore
  const dynImport = new Function('u', 'return import(u)')
  return dynImport('pdfjs-dist/legacy/build/pdf.mjs')
}

/** pdfjs 在 Node 下缺少浏览器全局对象，导入时顶层会 new DOMMatrix/Path2D，
 *  补最小实现即可正常做文本提取（不做渲染）。 */
function ensureNodePolyfills() {
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    ;(globalThis as any).DOMMatrix = class DOMMatrix {
      a: number
      b: number
      c: number
      d: number
      e: number
      f: number
      m11: number
      m12: number
      m21: number
      m22: number
      m41: number
      m42: number
      constructor(init?: string | number[]) {
        this.a = 1
        this.b = 0
        this.c = 0
        this.d = 1
        this.e = 0
        this.f = 0
        if (Array.isArray(init)) {
          this.a = init[0] ?? 1
          this.b = init[1] ?? 0
          this.c = init[2] ?? 0
          this.d = init[3] ?? 1
          this.e = init[4] ?? 0
          this.f = init[5] ?? 0
        }
        this.m11 = this.a
        this.m12 = this.b
        this.m21 = this.c
        this.m22 = this.d
        this.m41 = this.e
        this.m42 = this.f
      }
      multiply(): DOMMatrix { return this }
      inverse(): DOMMatrix { return this }
      transformPoint(p: { x: number; y: number }): { x: number; y: number } { return { x: p.x, y: p.y } }
    }
  }
  if (typeof (globalThis as any).Path2D === 'undefined') {
    ;(globalThis as any).Path2D = class Path2D {}
  }
}

function normalize(text: string): string {
  // NFKC：把 CJK 兼容字符（如 ⻓ ⾯ ⾆）规整为常用字（长 面 章），
  // Chromium 内嵌字体提取的文本常带兼容变体，直接 includes 会匹配失败
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

/**
 * 给定 PDF 字节与标题列表，返回每个标题对应的 0-based 页码。
 * 标题按文档顺序搜索：每个标题只从上一标题命中的页开始向后找，
 * 避免同名文本在前文出现导致错配。未命中时回退到 fallbackPage。
 */
export async function resolveHeadingPages(
  pdfBytes: Uint8Array,
  headings: { text: string; fallbackPage: number }[]
): Promise<number[]> {
  if (headings.length === 0) return []
  ensureNodePolyfills()
  const pdfjs = await loadPdfjs()

  const doc = await pdfjs.getDocument({
    data: pdfBytes,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
    useWorkerFetch: false,
  }).promise

  try {
    const pageTexts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pageTexts.push(normalize(content.items.map((it: any) => it.str ?? '').join('')))
    }

    const results: number[] = []
    let searchFrom = 0
    for (const h of headings) {
      const target = normalize(h.text)
      let hit = -1
      for (let p = searchFrom; p < pageTexts.length; p++) {
        if (target && pageTexts[p].includes(target)) {
          hit = p
          break
        }
      }
      if (hit < 0) {
        hit = h.fallbackPage
      } else {
        searchFrom = hit
      }
      results.push(hit)
    }
    return results
  } finally {
    if (doc && typeof doc.destroy === 'function') {
      await doc.destroy().catch(() => {})
    }
  }
}
