import { useMemo, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { useAppStore } from '../store/app'
import { FileText, Maximize2 } from 'lucide-react'
import { attachHeadingIds } from '../utils/headings'
import { TableOfContents } from './TableOfContents'
import '../styles/preview.css'

const md = new MarkdownIt({
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

  const html = useMemo(() => {
    if (!currentNote?.content) return ''
    if (currentNote.format === 'markdown') {
      try {
        const raw = md.render(currentNote.content)
        return DOMPurify.sanitize(raw, {
          ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'em', 'del', 'u', 'a', 'img', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'span', 'div', 'details', 'summary'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'type', 'checked', 'disabled', 'target', 'rel']
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
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <TableOfContents
          source={currentNote.content ?? ''}
          containerRef={containerRef}
        />
      </div>
    </div>
  )
}
