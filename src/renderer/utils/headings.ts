import MarkdownIt from 'markdown-it'

export interface Heading {
  level: number
  text: string
  id: string
}

/** 把标题原文转成可作 id 的 slug：小写、去 markdown 标记、中文保留、连续非字母数字字符压成 - */
export function slugify(s: string): string {
  const stripped = s
    .toLowerCase()
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1') // 去转义
    .replace(/`([^`]+)`/g, '$1')                 // `code` -> code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](url) -> text
    .replace(/<[^>]+>/g, '')                      // 原始 HTML
    .replace(/[*_~]+/g, '')                       // emphasis/del/strikethrough 标记
    .replace(/[^\w\u4e00-\u9fa5\- ]+/g, '-')     // 非 \w/中文/横线/空格 -> -
    .replace(/\s+/g, '-')                         // 空白 -> -
    .replace(/-+/g, '-')                          // 多横线压成一个
    .replace(/^-+|-+$/g, '')                      // 去首尾 -
  return stripped || 'heading'
}

/** 在已用的 id 集合里找一个不重复的 id */
export function uniqueSlug(s: string, used: Set<string>): string {
  const base = slugify(s)
  let id = base
  let n = 1
  while (used.has(id)) id = `${base}-${n++}`
  used.add(id)
  return id
}

// 仅用于解析的 md 实例。配置必须和 Preview.tsx 里的渲染实例保持一致，
// 这样 extractHeadings 得到的 id 才会和注入到 heading 元素的 id 完全一致。
const parseMd = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false
})

/** 从 Markdown 源文本里提取所有标题（h1-h6） */
export function extractHeadings(source: string): Heading[] {
  if (!source) return []
  const tokens = parseMd.parse(source, {})
  const headings: Heading[] = []
  const usedIds = new Set<string>()
  let openToken: any = null
  for (const t of tokens) {
    if (t.type === 'heading_open') {
      openToken = t
    } else if (t.type === 'heading_close') {
      openToken = null
    } else if (t.type === 'inline' && openToken) {
      headings.push({
        level: parseInt(openToken.tag.slice(1)),
        text: cleanInline(t.content),
        id: uniqueSlug(t.content, usedIds)
      })
    }
  }
  return headings
}

/** 把 inline token 的 raw 文本去成可显示的纯文本（保留中文） */
function cleanInline(s: string): string {
  return s
    .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]+/g, '')
    .trim()
}

/** 给 markdown-it 实例注册插件：给所有 heading_open token 加上 id 属性。
 *  调用方在创建 md 后立即调用一次即可。 */
export function attachHeadingIds(md: MarkdownIt): void {
  md.core.ruler.push('heading-ids', (state) => {
    const usedIds = new Set<string>()
    let openToken: any = null
    for (const t of state.tokens) {
      if (t.type === 'heading_open') {
        openToken = t
      } else if (t.type === 'heading_close') {
        openToken = null
      } else if (t.type === 'inline' && openToken) {
        openToken.attrSet('id', uniqueSlug(t.content, usedIds))
      }
    }
  })
}
