import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { useAppStore } from '../store/app'
import { FileText, Maximize2, Loader2, ExternalLink, Copy, Check } from 'lucide-react'
import { attachHeadingIds } from '../utils/headings'
import { md } from '../utils/markdown'
import hljs from 'highlight.js'
import { TableOfContents } from './TableOfContents'
import { PreviewSearchBar } from './PreviewSearch'
import { FilePreview } from './filePreview/FilePreview'
import hljsLightCss from 'highlight.js/styles/atom-one-light.css?inline'
import hljsDarkCss from 'highlight.js/styles/atom-one-dark.css?inline'
import '../styles/preview.css'

// mermaid 初始化（主题跟随全局主题，按需重新初始化以切换主题）
function ensureMermaidTheme(theme: string) {
  const mermaidTheme = (theme === 'dark' || theme === 'dracula' || theme === 'forest') ? 'dark' : 'default'
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
            if (m.type === 'code') text = `<span class="rt-inline-code">${text}</span>`
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
      if (node.type === 'code_block') {
        const text = (node.content || []).map((n: any) => n.text || '').join('')
        return `<div class="rt-code-block">${escape(text)}</div>`
      }
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
  const codePreviewRef = useRef<HTMLPreElement>(null)
  const htmlIframeRef = useRef<HTMLIFrameElement>(null)
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

  // highlight.js 主题跟随应用主题切换
  useEffect(() => {
    const theme = settings?.theme ?? 'light'
    const isDark = theme === 'dark' || theme === 'dracula' || theme === 'forest'
    const css = isDark ? hljsDarkCss : hljsLightCss
    const styleId = 'hljs-theme'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = css
  }, [settings?.theme])

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

  if (currentNote.format === 'code') {
    const lang = currentNote.language || 'plaintext'
    const langMap: Record<string, string> = { 'shell': 'bash', 'sh': 'bash' }
    const hljsLang = langMap[lang] || lang
    let highlighted: string
    if (hljsLang === 'plaintext' || !hljs.getLanguage(hljsLang)) {
      highlighted = currentNote.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    } else {
      try {
        highlighted = hljs.highlight(currentNote.content, { language: hljsLang, ignoreIllegals: true }).value
      } catch {
        highlighted = currentNote.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
    }
    return (
      <div className="preview code-note-preview">
        <div className="code-preview-header">
          <span className="code-preview-lang">{lang}</span>
        </div>
        <PreviewSearchBar
          key={`code-${currentNote.id}`}
          getRoot={() => codePreviewRef.current}
          style={{ margin: '8px 12px 0 auto' }}
        />
        <pre ref={codePreviewRef} className="code-preview hljs"><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
      </div>
    )
  }

  if (currentNote.format === 'richtext') {
    return (
      <div className="preview">
        <div className="preview-empty">
          <FileText size={48} className="preview-empty-icon" />
          <p>富文本笔记无需预览</p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>在编辑器中直接编辑</p>
        </div>
      </div>
    )
  }

  // 智能表格笔记：所见即所得，无需预览
  if (currentNote.format === 'spreadsheet') {
    return (
      <div className="preview">
        <div className="preview-empty">
          <FileText size={48} className="preview-empty-icon" />
          <p>智能表格笔记无需预览</p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>在编辑器中直接编辑</p>
        </div>
      </div>
    )
  }

  // 网址笔记：iframe 加载 url（带 sandbox 安全限制）
  if (currentNote.format === 'url') {
    const url = currentNote.url?.trim() || ''
    if (!url) {
      return (
        <div className="preview">
          <div className="preview-empty">
            <FileText size={48} className="preview-empty-icon" />
            <p>网址笔记需要 URL</p>
            <p style={{ fontSize: 12, opacity: 0.6 }}>在编辑器顶部的输入框填入网址</p>
          </div>
        </div>
      )
    }
    return <UrlPreview noteId={currentNote.id} url={url} title={currentNote.title} />
  }

  // 文件笔记：根据扩展名分发到 PdfPreview / DocxPreview / XlsxPreview / ImagePreview / FileFallback
  if (currentNote.format === 'file') {
    if (!currentNote.filePath) {
      return (
        <div className="preview">
          <div className="preview-empty">
            <FileText size={48} className="preview-empty-icon" />
            <p>文件笔记尚未关联文件</p>
            <p style={{ fontSize: 12, opacity: 0.6 }}>右键笔记选择"替换文件"以关联文件</p>
          </div>
        </div>
      )
    }
    return (
      <div className="preview-url" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FilePreview />
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
        <PreviewSearchBar
          key={`html-${currentNote.id}`}
          getRoot={() => htmlIframeRef.current?.contentDocument?.body ?? null}
          style={{ margin: '12px 12px 0 auto' }}
        />
        <iframe
          ref={htmlIframeRef}
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
      <PreviewSearchBar key={`md-${currentNote.id}`} getRoot={() => markdownBodyRef.current} />
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

/** 网址笔记预览：带加载状态指示的 iframe
 *  切换笔记 / url 变化时重新挂载 iframe 并显示 loading，onLoad 后隐藏。
 *  key 用 noteId+url 保证切换不同 url 笔记时一定重新加载。 */
function UrlPreview({ noteId, url, title }: { noteId: string; url: string; title: string }) {
  const [loading, setLoading] = useState(true)
  const [slow, setSlow] = useState(false) // 加载超过 5s 标记为"慢"
  const iframeKey = `${noteId}:${url}`

  // url / noteId 变化 → 重新进入 loading 态
  useEffect(() => {
    setLoading(true)
    setSlow(false)
    // 超时兜底：5s 后标记慢加载；30s 后强制结束 loading（防某些站点不触发 onLoad）
    const slowTimer = setTimeout(() => setSlow(true), 5000)
    const hardTimeout = setTimeout(() => setLoading(false), 30000)
    return () => {
      clearTimeout(slowTimer)
      clearTimeout(hardTimeout)
    }
  }, [iframeKey])

  const openExternal = () => {
    window.inkslateApi?.clickMenu?.('open-external-url', url)
    // 上面 clickMenu 不一定支持，用 shell.openExternal 的兜底：通过 file.openDialog 通道不可行，
    // 直接用 window.open 让 Electron 的 setWindowOpenHandler 接管（已在 main/index.ts 配置为 shell.openExternal）
    try { window.open(url, '_blank') } catch {}
  }

  return (
    <div className="preview-url" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      <iframe
        key={iframeKey}
        src={url}
        title={title}
        onLoad={() => { setLoading(false); setSlow(false) }}
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          minHeight: 0,
          colorScheme: 'light',
          background: '#ffffff'
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--bg-primary)',
          color: 'var(--text-tertiary)',
          zIndex: 10,
          pointerEvents: 'auto'
        }}>
          <Loader2 size={32} className="url-loading-spin" style={{ color: 'var(--accent-color)' }} />
          <div style={{ fontSize: 13 }}>
            {slow ? '加载较慢，请稍候…' : '正在加载网页…'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 360, textAlign: 'center', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
            {url}
          </div>
          {slow && (
            <button
              onClick={openExternal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                fontSize: 12,
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                marginTop: 4
              }}
            >
              <ExternalLink size={13} />
              用浏览器打开
            </button>
          )}
        </div>
      )}
      <style>{`.url-loading-spin { animation: url-spin 0.8s linear infinite; } @keyframes url-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
