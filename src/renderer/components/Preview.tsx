import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'
// @ts-ignore - 无官方 ESM 类型
import markdownItKatex from '@traptitech/markdown-it-katex'
import { useAppStore } from '../store/app'
import { FileText, Maximize2 } from 'lucide-react'
import { attachHeadingIds } from '../utils/headings'
import { TableOfContents } from './TableOfContents'
import 'highlight.js/styles/github.css'
import '../styles/preview.css'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  // GFM 表格 markdown-it 默认开启
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

// 数学公式插件：$...$ 行内 + $$...$$ 块级
md.use(markdownItKatex, { throwOnError: false, katex })

// mermaid 初始化（主题跟随全局主题，按需重新初始化以切换主题）
function ensureMermaidTheme(theme: string) {
  const mermaidTheme = (theme === 'dark' || theme === 'dracula' || theme === 'cyberpunk' || theme === 'forest') ? 'dark' : 'default'
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      securityLevel: 'strict',
      fontFamily: 'inherit',
      themeVariables: mermaidTheme === 'dark' ? { background: '#1e1e1e' } : {}
    })
  } catch {}
}

// 自定义 fence 渲染：mermaid 代码块输出 <pre class="mermaid"> 以便 mermaid.run() 自动渲染
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

md.use((md) => {
  md.core.ruler.after('inline', 'github-task-lists', (state) => {
    const tokens = state.tokens
    for (const token of tokens) {
      if (token.type !== 'inline') continue
      const html = token.content
      if (/^\s*\[( |x)\]\s+/.test(html)) {
        token.content = html.replace(/\[( |x)\]/g, (match, checked) => {
          return `<input type="checkbox" disabled ${checked === 'x' ? 'checked' : ''}> `
        })
      }
    }
  })
})

// 给 heading_open 注入 id（供右侧 TOC 跳转用）
attachHeadingIds(md)

/** 把富文本 JSON 转成 HTML 字符串用于显示 */
function richTextJsonToHtml(jsonStr: string): string {
  try {
    const doc = JSON.parse(jsonStr)
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const renderNode = (node: any): string => {
      if (!node) return ''
      if (node.type === 'text') {
        let text = escape(node.text || '')
        if (node.marks) {
          for (const m of node.marks) {
            if (m.type === 'bold') text = `<strong>${text}</strong>`
            if (m.type === 'italic') text = `<em>${text}</em>`
            if (m.type === 'underline') text = `<u>${text}</u>`
            if (m.type === 'code') text = `<code>${text}</code>`
            if (m.type === 'link') text = `<a href="${escape(m.attrs?.href || '#')}" target="_blank">${text}</a>`
          }
        }
        return text
      }
      if (node.type === 'paragraph') return `<p>${(node.content || []).map(renderNode).join('')}</p>`
      if (node.type === 'heading') {
        const level = node.attrs?.level || 1
        return `<h${level}>${(node.content || []).map(renderNode).join('')}</h${level}>`
      }
      if (node.type === 'bulletList') return `<ul>${(node.content || []).map(renderNode).join('')}</ul>`
      if (node.type === 'orderedList') return `<ol>${(node.content || []).map(renderNode).join('')}</ol>`
      if (node.type === 'listItem') return `<li>${(node.content || []).map(renderNode).join('')}</li>`
      if (node.type === 'blockquote') return `<blockquote>${(node.content || []).map(renderNode).join('')}</blockquote>`
      if (node.type === 'image') {
        const src = escape(node.attrs?.src || '')
        const alt = escape(node.attrs?.alt || '')
        return `<img src="${src}" alt="${alt}" style="max-width: 100%;">`
      }
      if (node.type === 'table') return `<table style="border-collapse: collapse; width: 100%;">${(node.content || []).map(renderNode).join('')}</table>`
      if (node.type === 'tableRow') return `<tr>${(node.content || []).map(renderNode).join('')}</tr>`
      if (node.type === 'tableCell') return `<td style="border: 1px solid var(--border-color); padding: 6px; min-width: 40px;">${(node.content || []).map(renderNode).join('')}</td>`
      return ''
    }
    return (doc.content || []).map(renderNode).join('')
  } catch {
    return '<p></p>'
  }
}

export function Preview() {
  const currentNote = useAppStore(s => s.currentNote)
  const settings = useAppStore(s => s.settings)
  const containerRef = useRef<HTMLDivElement>(null)
  const markdownBodyRef = useRef<HTMLDivElement>(null)
  const [tocOpen, setTocOpen] = useState(false)

  // 监听编辑器滚动：把"最靠上标题"的 id 同步到预览位置
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail
      const container = containerRef.current
      if (!container || !id) return
      const el = container.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
      if (!el) return
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const offset = elRect.top - containerRect.top + container.scrollTop - 12
      container.scrollTo({ top: offset, behavior: 'auto' })
    }
    window.addEventListener('inkslate:editor-top-heading', handler)
    return () => window.removeEventListener('inkslate:editor-top-heading', handler)
  }, [currentNote?.id])

  // 渲染 mermaid：每次 markdown 内容/主题变化时重跑
  useEffect(() => {
    if (!markdownBodyRef.current) return
    if (currentNote?.format !== 'markdown') return
    const theme = settings?.theme ?? 'light'
    ensureMermaidTheme(theme)
    const nodes = Array.from(markdownBodyRef.current.querySelectorAll('pre.mermaid')) as HTMLElement[]
    if (nodes.length === 0) return

    let cancelled = false
    ;(async () => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        // 跳过已渲染的（mermaid 会给 pre 加 data-processed="true"）
        if (node.getAttribute('data-processed') === 'true') continue
        const source = node.textContent || ''
        if (!source.trim()) continue
        const id = `mermaid-${Date.now()}-${i}`
        try {
          const { svg } = await mermaid.render(id, source)
          if (cancelled) return
          // mermaid.render 输出 SVG 字符串；替换 pre 内容为 svg（保留 mermaid 类以便再次识别）
          const wrap = document.createElement('div')
          wrap.className = 'mermaid-rendered'
          wrap.innerHTML = svg
          // 让 SVG 可缩放
          const svgEl = wrap.querySelector('svg')
          if (svgEl) {
            svgEl.style.maxWidth = '100%'
            svgEl.style.height = 'auto'
          }
          node.replaceWith(wrap)
        } catch (e) {
          // 渲染失败：保留原文 + 错误提示
          if (cancelled) return
          const err = document.createElement('div')
          err.className = 'mermaid-error'
          err.style.cssText = 'border:1px solid #d33;background:#fee;padding:8px;border-radius:4px;color:#a00;font-size:12px;font-family:var(--font-mono);white-space:pre-wrap;'
          err.textContent = `Mermaid 渲染失败：${(e as Error).message}\n\n${source}`
          node.replaceWith(err)
        }
      }
    })()
    return () => { cancelled = true }
  }, [currentNote?.content, currentNote?.format, settings?.theme])

  const html = useMemo(() => {
    if (!currentNote?.content) return ''
    if (currentNote.format === 'markdown') {
      try {
        const raw = md.render(currentNote.content)
        return DOMPurify.sanitize(raw, {
          ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
            'strong', 'em', 'del', 'u', 'a', 'img', 'code', 'pre',
            'blockquote', 'ul', 'ol', 'li',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'input', 'span', 'div', 'details', 'summary',
            // katex 数学标签
            'math', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac', 'msqrt', 'mtext', 'annotation', 'mover', 'munder', 'munderover', 'mspace', 'mstyle', 'mpadded'
          ],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'type', 'checked', 'disabled', 'target', 'rel', 'style', 'aria-hidden', 'data-mermaid-id'],
          // katex 输出大量 style 属性，必须放行
          ADD_TAGS: ['style']
        })
      } catch (e) {
        console.error('preview render error:', e)
        return '<p>预览渲染失败</p>'
      }
    }
    if (currentNote.format === 'html') {
      return currentNote.content
    }
    if (currentNote.format === 'richtext') {
      return richTextJsonToHtml(currentNote.content)
    }
    return ''
  }, [currentNote?.content, currentNote?.format])

  if (!currentNote) {
    return (
      <div className="preview">
        <div className="preview-empty">
          <FileText size={48} className="preview-empty-icon" />
          <p>选择一篇笔记查看预览</p>
        </div>
      </div>
    )
  }

  if (currentNote.format === 'richtext' || currentNote.format === 'code') {
    return (
      <div className="preview">
        <div className="preview-empty">
          <FileText size={48} className="preview-empty-icon" />
          <p>{currentNote.format === 'code' ? '代码笔记无需预览' : '富文本笔记无需预览'}</p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            {currentNote.format === 'code' ? '语法高亮在编辑器中查看' : '在编辑器中直接编辑'}
          </p>
        </div>
      </div>
    )
  }

  // HTML 用 iframe 单独渲染
  if (currentNote.format === 'html') {
    const theme = settings?.theme ?? 'light'
    const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
    const textColor = theme === 'dark' ? '#e8e8e8' : '#1a1a1a'
    const htmlDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { overflow: visible !important; }
  body { margin: 16px; font-family: -apple-system, sans-serif; background: ${bgColor}; color: ${textColor}; overflow: visible; }
  a { color: #1a73e8; }
</style>
</head>
<body>${html}</body>
</html>`
    return (
      <div className="preview" style={{ padding: 0, overflow: 'auto' }}>
        <iframe
          srcDoc={htmlDoc}
          sandbox="allow-same-origin allow-scripts"
          style={{ width: '100%', height: '100%', border: 'none', background: bgColor, display: 'block' }}
          title="HTML Preview"
        />
      </div>
    )
  }

  // Markdown 普通渲染
  return (
    <div className="preview" ref={containerRef}>
      <div className="preview-inner">
        <div
          ref={markdownBodyRef}
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <TableOfContents
          source={currentNote.content ?? ''}
          containerRef={containerRef}
          open={tocOpen}
          onToggle={() => setTocOpen(o => !o)}
        />
      </div>
    </div>
  )
}
