import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import katex from 'katex'
import 'katex/dist/katex.min.css'
// @ts-ignore - 无官方 ESM 类型
import markdownItKatex from '@traptitech/markdown-it-katex'

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

md.use(markdownItKatex, { throwOnError: false, katex })

// mermaid 代码块输出 <pre class="mermaid">
const defaultFence = md.renderer.rules.fence!.bind(md.renderer.rules)
md.renderer.rules.fence = (tokens: any, idx: number, options: any, env: any, self: any) => {
  const token = tokens[idx]
  const lang = (token.info || '').trim().split(/\s+/)[0]
  if (lang === 'mermaid') {
    const src = token.content
    return `<pre class="mermaid">${md.utils.escapeHtml(src)}</pre>\n`
  }
  return defaultFence(tokens, idx, options, env, self)
}
