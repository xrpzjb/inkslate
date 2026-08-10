import { useEffect, useRef, useState } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'

interface PreviewSearchBarProps {
  /** 返回要搜索的 DOM 根节点（markdown-body / code-preview / iframe body） */
  getRoot: () => HTMLElement | null
  /** 额外样式（不同预览布局微调边距/对齐） */
  style?: React.CSSProperties
}

/**
 * 预览区 Ctrl+F 搜索条：
 * - 全局监听 Ctrl/Cmd+F（编辑器 CodeMirror / 输入框聚焦时不拦截）
 * - 高亮所有匹配，Enter / Shift+Enter 或上下按钮逐条跳转并滚动定位
 * - Esc 或关闭按钮退出，退出时清除高亮
 */
export function PreviewSearchBar({ getRoot, style }: PreviewSearchBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [marks, setMarks] = useState<HTMLElement[]>([])
  const [current, setCurrent] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const marksRef = useRef<HTMLElement[]>([])
  const currentRef = useRef(0)

  marksRef.current = marks
  currentRef.current = current

  const clearHighlights = (root: HTMLElement) => {
    root.querySelectorAll('mark.preview-search-mark').forEach(m => {
      const parent = m.parentNode
      if (!parent) return
      parent.replaceChild(document.createTextNode(m.textContent ?? ''), m)
      parent.normalize()
    })
  }

  /** 在 root 内查找 query，包 <mark> 高亮，返回所有 mark 节点 */
  const runSearch = (root: HTMLElement, q: string): HTMLElement[] => {
    const result: HTMLElement[] = []
    if (!q.trim()) return result
    const lower = q.toLowerCase()
    const texts: Text[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = (node as Text).parentElement
        if (el && el.closest('script,style,svg,math,textarea,input,.katex,.mermaid,.mermaid-rendered,mark.preview-search-mark')) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      }
    })
    let n: Node | null
    while ((n = walker.nextNode())) texts.push(n as Text)

    for (const node of texts) {
      const text = node.nodeValue ?? ''
      const textLower = text.toLowerCase()
      let idx = textLower.indexOf(lower)
      if (idx === -1) continue
      const frag = document.createDocumentFragment()
      let pos = 0
      while (idx !== -1) {
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)))
        const mark = document.createElement('mark')
        mark.className = 'preview-search-mark'
        mark.textContent = text.slice(idx, idx + q.length)
        frag.appendChild(mark)
        result.push(mark)
        pos = idx + q.length
        idx = textLower.indexOf(lower, pos)
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)))
      node.parentNode?.replaceChild(frag, node)
    }
    return result
  }

  const applySearch = (q: string) => {
    const root = getRoot()
    if (root) clearHighlights(root)
    if (!root || !q.trim()) {
      setMarks([])
      setCurrent(0)
      return
    }
    const ms = runSearch(root, q)
    setMarks(ms)
    setCurrent(0)
    if (ms.length > 0) scrollToMark(ms[0])
  }

  const scrollToMark = (mark: HTMLElement) => {
    try {
      mark.scrollIntoView({ behavior: 'auto', block: 'center' })
    } catch {}
  }

  const goTo = (index: number) => {
    const ms = marksRef.current
    if (ms.length === 0) return
    const i = ((index % ms.length) + ms.length) % ms.length
    setCurrent(i)
    scrollToMark(ms[i])
  }

  const close = () => {
    const root = getRoot()
    if (root) clearHighlights(root)
    setOpen(false)
    setQuery('')
    setMarks([])
    setCurrent(0)
  }

  // 高亮中的当前项
  useEffect(() => {
    marksRef.current.forEach((m, i) => {
      m.classList.toggle('preview-search-active', i === currentRef.current)
    })
  }, [current, marks])

  // 全局 Ctrl/Cmd+F 监听（capture 阶段，避免被其他 stopPropagation 影响）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // 编辑器 / 输入框内不拦截，让 CodeMirror / 原生输入处理
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (target && target.closest('.cm-editor')) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(true)
        setQuery('')
        setMarks([])
        setCurrent(0)
        setTimeout(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        }, 0)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  if (!open) return null

  const btnStyle: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    padding: 3,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }

  return (
    <div
      className="preview-search-bar"
      style={{
        position: 'sticky',
        top: 8,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 6px 5px 10px',
        marginLeft: 'auto',
        width: 'fit-content',
        maxWidth: '100%',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        marginBottom: 8,
        ...style
      }}
    >
      <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); applySearch(e.target.value) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            goTo(e.shiftKey ? currentRef.current - 1 : currentRef.current + 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
        placeholder="搜索当前笔记…"
        style={{
          width: 180,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: 13,
          fontFamily: 'inherit'
        }}
      />
      <span style={{
        fontSize: 11,
        color: 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
        minWidth: 34,
        textAlign: 'center',
        userSelect: 'none'
      }}>
        {marks.length > 0 ? `${current + 1}/${marks.length}` : ''}
      </span>
      <button style={btnStyle} title="上一个 (Shift+Enter)" onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }} onClick={() => goTo(currentRef.current - 1)}>
        <ChevronUp size={14} />
      </button>
      <button style={btnStyle} title="下一个 (Enter)" onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }} onClick={() => goTo(currentRef.current + 1)}>
        <ChevronDown size={14} />
      </button>
      <button style={{ ...btnStyle, marginLeft: 2 }} title="关闭 (Esc)" onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)' }} onClick={close}>
        <X size={14} />
      </button>
    </div>
  )
}
