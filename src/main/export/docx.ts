import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import path from 'node:path'
import fs from 'node:fs'
import { imageSize } from 'image-size'
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun,
  LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
  TableRow, TextRun, WidthType
} from 'docx'
import { NoteFormat } from '../../shared/types'

/** 主进程独立 markdown-it 实例：只负责解析 token 流，不接 katex / mermaid。
 *  数学公式保留 LaTeX 源码、mermaid 保留代码文本（Word 无法原生渲染）。 */
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false
})

const CODE_FONT = 'Consolas'
const EAST_ASIA_FONT = '宋体'

// A4 尺寸（twips）：210mm × 297mm；页边距：上下 2cm、左右 2.5cm
const PAGE_WIDTH = 11906
const PAGE_HEIGHT = 16838
const MARGIN_TOP = 1134
const MARGIN_BOTTOM = 1134
const MARGIN_LEFT = 1417
const MARGIN_RIGHT = 1417

export interface NoteExportPayload {
  title: string
  content: string
  format: NoteFormat
  /** 笔记文件路径（.md / .html），用于解析相对路径图片 */
  basePath?: string
  /** 代码笔记的语言（format === 'code' 时使用） */
  language?: string
}

// ===================== 基础类型 =====================

interface BlockNode {
  type: 'paragraph' | 'heading' | 'code' | 'hr' | 'html' | 'bulletList' | 'orderedList' | 'blockquote' | 'table'
  inline?: Token | null
  level?: number
  content?: string
  lang?: string
  items?: BlockNode[][]
  children?: BlockNode[]
  rows?: { type: 'th' | 'td'; inline: Token | null }[][]
}

interface BuildState {
  baseDir: string
  imageCache: Record<string, { data: Buffer; type: string }>
}

// ===================== markdown-it token 流 → 树 =====================

function matchClose(tokens: Token[], openIdx: number): number {
  const base = tokens[openIdx].type.replace(/_open$/, '')
  let depth = 0
  for (let k = openIdx; k < tokens.length; k++) {
    if (tokens[k].type === base + '_open') depth++
    else if (tokens[k].type === base + '_close') {
      depth--
      if (depth === 0) return k
    }
  }
  return tokens.length - 1
}

function splitListItems(tokens: Token[]): Token[][] {
  const items: Token[][] = []
  let i = 0
  while (i < tokens.length) {
    if (tokens[i].type === 'list_item_open') {
      const end = matchClose(tokens, i)
      items.push(tokens.slice(i + 1, end))
      i = end + 1
    } else i++
  }
  return items
}

function parseTable(tokens: Token[]): { type: 'th' | 'td'; inline: Token | null }[][] {
  const rows: { type: 'th' | 'td'; inline: Token | null }[][] = []
  let i = 0
  while (i < tokens.length) {
    if (tokens[i].type === 'tr_open') {
      const end = matchClose(tokens, i)
      const cells: { type: 'th' | 'td'; inline: Token | null }[] = []
      let j = i + 1
      while (j < end) {
        if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
          const cend = matchClose(tokens, j)
          const inline = tokens.slice(j + 1, cend).find(x => x.type === 'inline') ?? null
          cells.push({ type: tokens[j].type === 'th_open' ? 'th' : 'td', inline })
          j = cend + 1
        } else j++
      }
      rows.push(cells)
      i = end + 1
    } else i++
  }
  return rows
}

function consume(tokens: Token[]): BlockNode[] {
  const nodes: BlockNode[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.type === 'inline') {
      nodes.push({ type: 'paragraph', inline: t })
      i++
    } else if (t.type === 'heading_open') {
      const end = matchClose(tokens, i)
      const inline = tokens.slice(i + 1, end).find(x => x.type === 'inline') ?? null
      nodes.push({ type: 'heading', level: Number(t.tag.slice(1)) || 1, inline })
      i = end + 1
    } else if (t.type === 'fence') {
      nodes.push({ type: 'code', content: t.content, lang: (t.info || '').trim().split(/\s+/)[0] })
      i++
    } else if (t.type === 'code_block') {
      nodes.push({ type: 'code', content: t.content, lang: '' })
      i++
    } else if (t.type === 'hr') {
      nodes.push({ type: 'hr' })
      i++
    } else if (t.type === 'html_block') {
      nodes.push({ type: 'html', content: t.content })
      i++
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const end = matchClose(tokens, i)
      const items = splitListItems(tokens.slice(i + 1, end)).map(g => consume(g))
      nodes.push({ type: t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList', items })
      i = end + 1
    } else if (t.type === 'blockquote_open') {
      const end = matchClose(tokens, i)
      nodes.push({ type: 'blockquote', children: consume(tokens.slice(i + 1, end)) })
      i = end + 1
    } else if (t.type === 'table_open') {
      const end = matchClose(tokens, i)
      nodes.push({ type: 'table', rows: parseTable(tokens.slice(i, end + 1)) })
      i = end + 1
    } else i++
  }
  return nodes
}

// ===================== 内联 token → Runs =====================

const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

function makeTextRun(text: string, fmt: { bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; code?: boolean }): TextRun {
  return new TextRun({
    text,
    bold: fmt.bold || undefined,
    italics: fmt.italic || undefined,
    strike: fmt.strike || undefined,
    underline: fmt.underline ? {} : undefined,
    font: fmt.code ? CODE_FONT : undefined,
    size: fmt.code ? 18 : undefined,
    color: fmt.code ? '1F2328' : undefined,
    shading: fmt.code ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined
  })
}

function loadImageRun(src: string, alt: string, state: BuildState): ImageRun | null {
  let data: Buffer | null = null
  let type = ''
  if (src.startsWith('data:')) {
    const m = src.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (m) { type = m[1]; data = Buffer.from(m[2], 'base64') }
  } else if (state.imageCache[src]) {
    data = state.imageCache[src].data
    type = state.imageCache[src].type
  } else if (/^https?:\/\//i.test(src)) {
    return null
  } else {
    const resolved = path.isAbsolute(src) ? src : path.resolve(state.baseDir, src)
    try {
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null
      data = fs.readFileSync(resolved)
      type = path.extname(resolved).slice(1).toLowerCase()
    } catch {
      return null
    }
  }
  if (!data || data.length === 0) return null

  let docxType: string
  if (type === 'jpeg') docxType = 'jpg'
  else if (['jpg', 'png', 'gif', 'bmp', 'svg'].includes(type)) docxType = type
  else return null

  let width = 0
  let height = 0
  try {
    const dim = imageSize(data)
    if (dim.width && dim.height) { width = dim.width; height = dim.height }
  } catch {
    if (docxType === 'svg') { width = 600; height = 400 } else return null
  }
  if (!width || !height) return null

  // 等比缩放到页宽内（A4 去掉 2.5cm 页边距后约 16cm ≈ 600px）
  const MAX_WIDTH = 560
  if (width > MAX_WIDTH) {
    height = Math.round((height * MAX_WIDTH) / width)
    width = MAX_WIDTH
  }
  try {
    return new ImageRun({ type: docxType as any, data, transformation: { width, height } })
  } catch {
    return null
  }
}

function buildInlineRuns(tokens: Token[], state: BuildState): (TextRun | ExternalHyperlink | ImageRun)[] {
  const out: (TextRun | ExternalHyperlink | ImageRun)[] = []
  let i = 0
  let bold = false
  let italic = false
  let strike = false
  let underline = false
  while (i < tokens.length) {
    const tok = tokens[i]
    switch (tok.type) {
      case 'text':
        out.push(makeTextRun(tok.content, { bold, italic, strike, underline }))
        i++
        break
      case 'code_inline':
        out.push(makeTextRun(tok.content, { bold, italic, strike, underline, code: true }))
        i++
        break
      case 'em_open': italic = true; i++; break
      case 'em_close': italic = false; i++; break
      case 'strong_open': bold = true; i++; break
      case 'strong_close': bold = false; i++; break
      case 's_open': strike = true; i++; break
      case 's_close': strike = false; i++; break
      case 'u_open': underline = true; i++; break
      case 'u_close': underline = false; i++; break
      case 'softbreak':
      case 'hardbreak':
        out.push(new TextRun({ break: 1 }))
        i++
        break
      case 'link_open': {
        const href = tok.attrGet('href') || ''
        let depth = 1
        let j = i + 1
        while (j < tokens.length && depth > 0) {
          if (tokens[j].type === 'link_open') depth++
          if (tokens[j].type === 'link_close') depth--
          j++
        }
        const inner = tokens.slice(i + 1, j - 1)
        out.push(new ExternalHyperlink({ children: buildInlineRuns(inner, state), link: href }))
        i = j
        break
      }
      case 'image': {
        const src = tok.attrGet('src') || ''
        const alt = tok.children?.[0]?.content || ''
        const img = loadImageRun(src, alt, state)
        if (img) out.push(img)
        i++
        break
      }
      case 'html_inline':
        out.push(makeTextRun(stripHtml(tok.content), { bold, italic, strike, underline }))
        i++
        break
      default:
        i++
        break
    }
  }
  return out
}

// ===================== 块 → docx 元素 =====================

const headingLevelMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
}

function paraFromInline(inline: Token | null | undefined, state: BuildState, opts?: { numbering?: { reference: string; level: number }; blockquote?: boolean }): Paragraph {
  const runs = inline?.children ? buildInlineRuns(inline.children, state) : []
  return new Paragraph({
    children: runs.length ? runs : [new TextRun('')],
    spacing: { after: 120 },
    numbering: opts?.numbering,
    ...(opts?.blockquote ? blockquoteParagraphProps() : {})
  })
}

/** 引用块段落样式：左缩进 + 左边框 */
function blockquoteParagraphProps() {
  return {
    indent: { left: 360, right: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } }
  }
}

function codeParagraphs(node: BlockNode, state: BuildState, indent = 0, blockquote = false): Paragraph[] {
  const lines = (node.content ?? '').replace(/\n$/, '').split('\n')
  if (lines.length === 0) return []
  const leftIndent = indent + (blockquote ? 360 : 0)
  return lines.map((line, idx) => new Paragraph({
    indent: leftIndent ? { left: leftIndent } : undefined,
    spacing: { before: idx === 0 ? 100 : 0, after: idx === lines.length - 1 ? 100 : 0 },
    shading: { type: ShadingType.CLEAR, fill: 'F6F8FA', color: 'auto' },
    ...(blockquote ? blockquoteParagraphProps() : {}),
    children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: 18, color: '1F2328' })]
  }))
}

function hrParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } },
    children: [new TextRun('')]
  })
}

function htmlParagraphs(content: string): Paragraph[] {
  const text = stripHtml(content).replace(/\n{3,}/g, '\n\n').trim()
  if (!text) return []
  return text.split(/\n{2,}/).map(p => new Paragraph({
    children: [new TextRun(p)],
    spacing: { after: 120 }
  }))
}

function renderTable(node: BlockNode, state: BuildState): Table {
  const rows = node.rows ?? []
  const colCount = Math.max(1, ...rows.map(r => r.length))
  // 正文可用宽度（twips）：A4 页宽减左右页边距
  const textWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
  const colWidth = Math.floor(textWidth / colCount)
  const tableRows = rows.map(cells =>
    new TableRow({
      children: cells.map(cell =>
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          shading: cell.type === 'th' ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({
            children: cell.inline?.children ? buildInlineRuns(cell.inline.children, state) : [new TextRun('')],
            spacing: { after: 0 }
          })]
        })
      )
    })
  )
  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: textWidth, type: WidthType.DXA },
    columnWidths: Array.from({ length: colCount }, () => colWidth),
    borders: {
      top: border, bottom: border, left: border, right: border,
      insideHorizontal: border, insideVertical: border
    },
    rows: tableRows
  })
}

function renderList(node: BlockNode, state: BuildState, level: number, blockquote = false): (Paragraph | Table)[] {
  const reference = node.type === 'bulletList' ? 'word-bullet' : 'word-number'
  const lv = Math.min(level, 3)
  const out: (Paragraph | Table)[] = []
  for (const item of node.items ?? []) {
    let first = true
    for (const child of item) {
      if (child.type === 'paragraph') {
        if (first) {
          out.push(paraFromInline(child.inline, state, { numbering: { reference, level: lv }, blockquote }))
          first = false
        } else {
          out.push(paraFromInline(child.inline, state, { blockquote }))
        }
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...renderList(child, state, level + 1, blockquote))
        first = false
      } else if (child.type === 'code') {
        out.push(...codeParagraphs(child, state, 480 * (level + 1), blockquote))
      } else if (child.type === 'blockquote') {
        out.push(...renderBlocks([child], state, true))
      } else if (child.type === 'html') {
        out.push(...htmlParagraphs(child.content ?? ''))
      } else if (child.type === 'table') {
        out.push(renderTable(child, state))
      }
    }
  }
  return out
}

function renderBlocks(nodes: BlockNode[], state: BuildState, blockquote = false): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        out.push(paraFromInline(node.inline, state, { blockquote }))
        break
      case 'heading': {
        const level = Math.min(Math.max(node.level || 1, 1), 6)
        out.push(new Paragraph({
          heading: headingLevelMap[level],
          spacing: { before: 240, after: 120 },
          ...(blockquote ? blockquoteParagraphProps() : {}),
          children: node.inline?.children ? buildInlineRuns(node.inline.children, state) : [new TextRun('')]
        }))
        break
      }
      case 'code':
        out.push(...codeParagraphs(node, state, 0, blockquote))
        break
      case 'hr':
        out.push(hrParagraph())
        break
      case 'html':
        out.push(...htmlParagraphs(node.content ?? ''))
        break
      case 'bulletList':
      case 'orderedList':
        out.push(...renderList(node, state, 0, blockquote))
        break
      case 'blockquote':
        out.push(...renderBlocks(node.children ?? [], state, true))
        break
      case 'table':
        out.push(renderTable(node, state))
        break
    }
  }
  return out
}

// ===================== 远程图片预取 =====================

async function prefetchRemoteImages(tokens: Token[], state: BuildState): Promise<void> {
  const tasks: Promise<void>[] = []
  const walk = (arr: Token[]) => {
    for (const t of arr) {
      if (t.type === 'inline' && t.children) {
        for (const c of t.children) {
          if (c.type === 'image') {
            const src = c.attrGet('src') || ''
            if (/^https?:\/\//i.test(src) && !state.imageCache[src]) {
              tasks.push((async () => {
                try {
                  const resp = await fetch(src)
                  if (resp.ok) {
                    const buf = Buffer.from(await resp.arrayBuffer())
                    const ct = resp.headers.get('content-type') || ''
                    let type = ''
                    if (ct.includes('jpeg')) type = 'jpg'
                    else {
                      const m = ct.match(/image\/([a-zA-Z0-9.+-]+)/)
                      type = m ? m[1] : path.extname(new URL(src).pathname).slice(1).toLowerCase()
                    }
                    if (type) state.imageCache[src] = { data: buf, type }
                  }
                } catch {}
              })())
            }
          }
        }
      }
    }
  }
  walk(tokens)
  await Promise.all(tasks)
}

// ===================== HTML 笔记兜底（html-to-docx） =====================

const mimeMap: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', ico: 'image/x-icon'
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function embedLocalImages(html: string, basePath?: string): string {
  const baseDir = basePath ? path.dirname(basePath) : ''
  const imgRe = /(<img\b[^>]*\bsrc=")([^"]*)("[^>]*>)/g
  return html.replace(imgRe, (full, pre, src, post) => {
    if (!src || src.startsWith('data:') || /^https?:\/\//i.test(src)) return full
    const resolved = path.isAbsolute(src) ? src : path.resolve(baseDir, src)
    try {
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return full
      const ext = path.extname(resolved).slice(1).toLowerCase()
      const mime = mimeMap[ext] || 'application/octet-stream'
      const b64 = fs.readFileSync(resolved).toString('base64')
      return `${pre}data:${mime};base64,${b64}${post}`
    } catch {
      return full
    }
  })
}

function decorateTables(html: string): string {
  return html
    .replace(/<table\b/gi, '<table style="border-collapse: collapse"')
    .replace(/<(th|td)\b/gi, '<$1 style="border: 1px solid #999999; padding: 4px 8px"')
}

/** HTML 笔记（format === 'html'）走 html-to-docx 兜底 */
async function fallbackHtmlToDocx(payload: NoteExportPayload): Promise<Buffer> {
  const html = decorateTables(embedLocalImages(payload.content ?? '', payload.basePath))
  const HTMLtoDOCX = require('html-to-docx') as (html: string, header: string | null, options: Record<string, any>) => Promise<Buffer>
  return HTMLtoDOCX(html, null, {
    title: payload.title,
    creator: '墨与石板 (Inkslate)',
    description: '由 墨与石板 导出的 Word 文档',
    font: EAST_ASIA_FONT,
    fontSize: '10.5pt',
    complexScriptFontSize: '10.5pt',
    lang: 'zh-CN',
    decodeUnicode: true,
    orientation: 'portrait',
    pageSize: 'A4',
    margins: { top: '2cm', right: '2.5cm', bottom: '2cm', left: '2.5cm' },
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false
  })
}

// ===================== 文档组装 =====================

const NUMBERING_CONFIG = [
  {
    reference: 'word-bullet',
    levels: [0, 1, 2, 3].map(lv => ({
      level: lv,
      format: LevelFormat.BULLET,
      text: lv === 0 ? '•' : lv === 1 ? '◦' : '▪',
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (lv + 1) - 240, hanging: 240 } } }
    }))
  },
  {
    reference: 'word-number',
    levels: [0, 1, 2, 3].map(lv => ({
      level: lv,
      format: LevelFormat.DECIMAL,
      text: `%${lv + 1}.`,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (lv + 1) - 240, hanging: 240 } } }
    }))
  }
]

function titleParagraph(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 240 },
    children: [new TextRun({ text: title || '未命名笔记' })]
  })
}

async function packDocx(payload: NoteExportPayload, children: (Paragraph | Table)[]): Promise<Buffer> {
  const doc = new Document({
    creator: '墨与石板 (Inkslate)',
    title: payload.title,
    description: '由 墨与石板 导出的 Word 文档',
    styles: {
      default: {
        document: { run: { font: EAST_ASIA_FONT, size: 21 } },
        title: { run: { font: EAST_ASIA_FONT, size: 40, bold: true, color: '1F2328' } },
        heading1: { run: { font: EAST_ASIA_FONT, size: 36, bold: true, color: '1F2328' } },
        heading2: { run: { font: EAST_ASIA_FONT, size: 32, bold: true, color: '1F2328' } },
        heading3: { run: { font: EAST_ASIA_FONT, size: 28, bold: true, color: '1F2328' } },
        heading4: { run: { font: EAST_ASIA_FONT, size: 24, bold: true } },
        heading5: { run: { font: EAST_ASIA_FONT, size: 22, bold: true } },
        heading6: { run: { font: EAST_ASIA_FONT, size: 21, bold: true } }
      }
    },
    numbering: { config: NUMBERING_CONFIG },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT }
        }
      },
      children
    }]
  })
  return Packer.toBuffer(doc)
}

/**
 * 把笔记导出为 .docx 文件内容（Buffer）。
 * - markdown / code：markdown-it token → docx 库直接构建（原生标题/列表/表格/代码块底色/图片）
 * - html：html-to-docx 兜底转换
 */
export async function exportNoteToWord(payload: NoteExportPayload): Promise<Buffer> {
  if (payload.format === 'markdown') {
    const tokens = md.parse(payload.content ?? '', {})
    const state: BuildState = {
      baseDir: payload.basePath ? path.dirname(payload.basePath) : '',
      imageCache: {}
    }
    await prefetchRemoteImages(tokens, state)
    const blocks = consume(tokens)
    const children = renderBlocks(blocks, state)
    children.unshift(titleParagraph(payload.title))
    return packDocx(payload, children)
  }
  if (payload.format === 'code') {
    const state: BuildState = { baseDir: '', imageCache: {} }
    const children: (Paragraph | Table)[] = codeParagraphs(
      { type: 'code', content: payload.content ?? '', lang: payload.language || '' },
      state
    )
    children.unshift(titleParagraph(payload.title))
    return packDocx(payload, children)
  }
  if (payload.format === 'html') {
    return fallbackHtmlToDocx(payload)
  }
  throw new Error(`暂不支持导出该格式（${payload.format}）为 Word`)
}
