import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../store/app'
import { Bold, Italic, Heading1, Heading2, Heading3, Link, Image, Code, Code2, List, ListOrdered, ListChecks, Quote, Save, Underline, Strikethrough, Undo2, Redo2, Pilcrow, Minus, AlignLeft, AlignCenter, AlignRight, Eraser, Indent, Outdent, PanelRightClose, PanelRightOpen, PanelLeftOpen, Table } from 'lucide-react'
import { FileText } from 'lucide-react'
import { CodeEditor } from './CodeEditor'

/**
 * 杞婚噺绾?Markdown 缂栬緫鍣? * - 琛屽彿
 * - Tab 缂╄繘
 */

export function Editor() {
  const currentNote = useAppStore(s => s.currentNote)
  const updateNote = useAppStore(s => s.updateNote)
  const updateCurrentNoteDraft = useAppStore(s => s.updateCurrentNoteDraft)
  const settings = useAppStore(s => s.settings)

  const [content, setContent] = useState('')
  const previewVisible = useAppStore(s => s.previewVisible)
  const togglePreview = useAppStore(s => s.togglePreview)
  const setSaveStatus = useAppStore(s => s.setSaveStatus)
  const [title, setTitle] = useState('')
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const codeEditorRef = useRef<import('./CodeEditor').CodeEditorHandle>(null)

  // 同步当前笔记（切换时）
  useEffect(() => {
    if (currentNote) {
      setContent(currentNote.content)
      setTitle(currentNote.title)
    } else {
      setContent('')
      setTitle('')
    }
  }, [currentNote?.id])

  // 即时同步草稿到 store（不进库），让 Preview 实时看到最新内容
  useEffect(() => {
    if (!currentNote) return
    if (content === currentNote.content && title === currentNote.title) return
    updateCurrentNoteDraft({ content, title })
  }, [content, title, currentNote])

  // 防抖写库（2s 无输入后保存到磁盘）
  useEffect(() => {
    if (!currentNote) return
    if (content === currentNote.content && title === currentNote.title) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      handleSave()
    }, 2000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [content, title])

  const handleSave = async () => {
    if (!currentNote) return
    setSaveStatus({ saving: true })
    try {
      await updateNote(currentNote.id, { content, title })
    } finally {
      setSaveStatus({ saving: false })
    }
  }

  // 监听菜单触发的保存事件
  useEffect(() => {
    const onSaveEvent = () => handleSave()
    window.addEventListener('inkslate:save-current', onSaveEvent)
    return () => window.removeEventListener('inkslate:save-current', onSaveEvent)
  }, [currentNote, content, title])

  const insertText = useCallback((before: string, after: string, placeholder: string) => {
    codeEditorRef.current?.insertText(before, after, placeholder)
  }, [])

  const fontSize = settings?.fontSize ?? 14

  if (!currentNote) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        gap: 12
      }}>
        <FileText size={48} opacity={0.3} />
        <p>选择一篇笔记开始编辑</p>
        <p style={{ fontSize: 12 }}>或点击左侧"新建"创建笔记</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 'var(--header-height)',
        minHeight: 'var(--header-height)',
        padding: '0 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-tertiary)',
        flexShrink: 0,
        boxSizing: 'border-box',
        marginLeft: -1,
        marginRight: -1
      }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题..."
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            fontSize: 16,
            fontWeight: 600,
            padding: 0,
            color: 'var(--text-primary)',
            outline: 'none'
          }}
        />
                {currentNote?.format !== 'richtext' && !previewVisible && (
          <button
            className="panel-action-btn"
            onClick={togglePreview}
            title="展开预览"
          >
            <PanelRightOpen size={16} />
          </button>
        )}
      </div>

            {currentNote.format !== 'richtext' && (
        <div style={{
          display: 'flex',
          gap: 2,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-tertiary)',
          flexShrink: 0,
          marginLeft: -1, // 璁?border-bottom 寤朵几鎺ヤ笂宸︿晶 divider
          marginRight: -1 // 璁?border-bottom 寤朵几鎺ヤ笂鍙充晶 divider
        }}>
          <ToolbarBtn icon={<Bold size={14} />} title="粗体 (Ctrl+B)" onClick={() => insertText('**', '**', 'bold')} />
          <ToolbarBtn icon={<Italic size={14} />} title="斜体 (Ctrl+I)" onClick={() => insertText('*', '*', 'italic')} />
          <Divider />
          <ToolbarBtn icon={<Heading1 size={14} />} title="标题 1" onClick={() => insertText('\n# ', '\n', 'heading')} />
          <ToolbarBtn icon={<Heading2 size={14} />} title="标题 2" onClick={() => insertText('\n## ', '\n', 'heading')} />
          <Divider />
          <ToolbarBtn icon={<Link size={14} />} title="链接" onClick={() => insertText('[', '](https://)', 'link')} />
          <ToolbarBtn icon={<Image size={14} />} title="图片" onClick={() => insertText('![', '](https://)', 'alt')} />
          <ToolbarBtn icon={<Code size={14} />} title="代码" onClick={() => insertText('`', '`', 'code')} />
          <Divider />
          <ToolbarBtn icon={<List size={14} />} title="无序列表" onClick={() => insertText('\n- ', '\n', 'item')} />
          <ToolbarBtn icon={<ListOrdered size={14} />} title="有序列表" onClick={() => insertText('\n1. ', '\n', 'item')} />
          <ToolbarBtn icon={<Quote size={14} />} title="引用" onClick={() => insertText('\n> ', '\n', 'quote')} />
          <div style={{ flex: 1 }} />
          <ToolbarBtn icon={<Save size={14} />} title="保存 (Ctrl+S)" onClick={handleSave} />
        </div>
      )}

            {currentNote.format === 'richtext' ? (
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          background: 'var(--bg-primary)',
          minHeight: 0
        }}>
          <RichTextEditor
            value={content}
            onChange={setContent}
            fontSize={fontSize}
          />
        </div>
      ) : (
        <CodeEditor
          ref={codeEditorRef}
          value={content}
          onChange={setContent}
          fontSize={fontSize}
          format={currentNote.format as 'markdown' | 'html' | 'code'}
          language={currentNote.language}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

/**
 */
function RichTextEditor({ value, onChange, fontSize }: {
  value: string
  onChange: (v: string) => void
  fontSize: number
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef(false)

  // 弹窗状态
  const [linkDlg, setLinkDlg] = useState({ open: false, url: '', text: '' })
  const [imageDlg, setImageDlg] = useState({ open: false, url: '', alt: '', busy: false })
  const [tableDlg, setTableDlg] = useState({ open: false, rows: 3, cols: 3 })

  // 鎶?JSON 杞垚 HTML 鐢ㄤ簬鏄剧ず
  const valueToHtml = (jsonStr: string): string => {
    try {
      const doc = JSON.parse(jsonStr)
      const renderNode = (node: any): string => {
        if (!node) return ''
        if (node.type === 'text') {
          let text = escapeHtml(node.text || '')
          if (node.marks) {
            for (const m of node.marks) {
              if (m.type === 'bold') text = `<strong>${text}</strong>`
              if (m.type === 'italic') text = `<em>${text}</em>`
              if (m.type === 'underline') text = `<u>${text}</u>`
              if (m.type === 'code') text = `<code>${text}</code>`
              if (m.type === 'link') text = `<a href="${escapeHtml(m.attrs?.href || '#')}" target="_blank" rel="noopener">${text}</a>`
            }
          }
          return text
        }
        if (node.type === 'paragraph') {
          return `<p>${(node.content || []).map(renderNode).join('')}</p>`
        }
        if (node.type === 'heading') {
          const level = node.attrs?.level || 1
          return `<h${level}>${(node.content || []).map(renderNode).join('')}</h${level}>`
        }
        if (node.type === 'bulletList') {
          return `<ul>${(node.content || []).map(renderNode).join('')}</ul>`
        }
        if (node.type === 'orderedList') {
          return `<ol>${(node.content || []).map(renderNode).join('')}</ol>`
        }
        if (node.type === 'listItem') {
          return `<li>${(node.content || []).map(renderNode).join('')}</li>`
        }
        if (node.type === 'blockquote') {
          return `<blockquote>${(node.content || []).map(renderNode).join('')}</blockquote>`
        }
        if (node.type === 'hardBreak') {
          return '<br>'
        }
        if (node.type === 'image') {
          const src = escapeHtml(node.attrs?.src || '')
          const alt = escapeHtml(node.attrs?.alt || '')
          return `<img src="${src}" alt="${alt}" data-richtext-image="1" style="max-width: 100%;">`
        }
        if (node.type === 'table') {
          return `<table data-richtext-table="1" style="border-collapse: collapse; width: 100%;">${(node.content || []).map(renderNode).join('')}</table>`
        }
        if (node.type === 'tableRow') {
          return `<tr>${(node.content || []).map(renderNode).join('')}</tr>`
        }
        if (node.type === 'tableCell') {
          return `<td style="border: 1px solid #ddd; padding: 6px; min-width: 40px;">${(node.content || []).map(renderNode).join('')}</td>`
        }
        return ''
      }
      return (doc.content || []).map(renderNode).join('')
    } catch {
      return '<p></p>'
    }
  }

  // 鎶?HTML 杞垚 JSON
  const htmlToValue = (html: string): string => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html

    const parseInline = (node: Node): any => {
      if (node.nodeType === Node.TEXT_NODE) {
        return { type: 'text', text: node.textContent || '' }
      }
      const el = node as HTMLElement
      const tag = el.tagName?.toLowerCase()
      if (tag === 'img') {
        return {
          type: 'image',
          attrs: {
            src: el.getAttribute('src') || '',
            alt: el.getAttribute('alt') || ''
          }
        }
      }
      if (tag === 'br') {
        return { type: 'hardBreak' }
      }
      const text = { type: 'text', text: el.textContent || '' }
      if (tag === 'strong' || tag === 'b') return { type: 'text', text: el.textContent || '', marks: [{ type: 'bold' }] }
      if (tag === 'em' || tag === 'i') return { type: 'text', text: el.textContent || '', marks: [{ type: 'italic' }] }
      if (tag === 'u') return { type: 'text', text: el.textContent || '', marks: [{ type: 'underline' }] }
      if (tag === 'code') return { type: 'text', text: el.textContent || '', marks: [{ type: 'code' }] }
      if (tag === 'a') return { type: 'text', text: el.textContent || '', marks: [{ type: 'link', attrs: { href: el.getAttribute('href') || '#' } }] }
      return text
    }

    const parseBlock = (node: Element): any => {
      const tag = node.tagName?.toLowerCase()
      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
        return { type: 'heading', attrs: { level: parseInt(tag[1]) }, content: [{ type: 'paragraph', content: [parseInline(node.firstChild || document.createTextNode(''))] }] }
      }
      if (tag === 'p' || !tag) {
        const content: any[] = []
        for (const child of Array.from(node.childNodes)) {
          const inline = parseInline(child)
          if (inline) content.push(inline)
        }
        if (content.length === 0) content.push({ type: 'text', text: '' })
        return { type: 'paragraph', content }
      }
      if (tag === 'ul') {
        return { type: 'bulletList', content: Array.from(node.children).map(li => parseBlock(li)) }
      }
      if (tag === 'ol') {
        return { type: 'orderedList', content: Array.from(node.children).map(li => parseBlock(li)) }
      }
      if (tag === 'li') {
        return { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }] }
      }
      if (tag === 'blockquote') {
        return { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }] }
      }
      if (tag === 'table') {
        return {
          type: 'table',
          content: Array.from(node.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr')).map(tr => parseBlock(tr))
        }
      }
      if (tag === 'tr') {
        return {
          type: 'tableRow',
          content: Array.from(node.children).map(td => parseBlock(td as Element))
        }
      }
      if (tag === 'td' || tag === 'th') {
        return {
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }]
        }
      }
      return { type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }
    }

    try {
      const content = Array.from(tmp.children).map(parseBlock)
      if (content.length === 0) content.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] })
      return JSON.stringify({ type: 'doc', content })
    } catch {
      return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] })
    }
  }

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      editorRef.current.innerHTML = valueToHtml(value)
    }
    isInternalUpdate.current = false
  }, [value])

  const handleInput = () => {
    if (editorRef.current) {
      isInternalUpdate.current = true
      onChange(htmlToValue(editorRef.current.innerHTML))
    }
  }

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    handleInput()
  }

  // ============== 弹窗处理 ==============
  const confirmLink = () => {
    if (!linkDlg.url) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) {
      // 有选中文本 → 用 createLink 包裹
      exec('createLink', linkDlg.url)
    } else {
      // 无选中文本 → 插入 <a>text</a>
      const text = linkDlg.text || linkDlg.url
      exec('insertHTML', `<a href="${escapeHtml(linkDlg.url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>&nbsp;`)
    }
    setLinkDlg(d => ({ ...d, open: false }))
  }

  const pickLocalImage = async () => {
    const filePath = await window.inkslateApi.file.openDialog({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      properties: ['openFile']
    })
    if (!filePath) return
    setImageDlg(d => ({ ...d, busy: true }))
    try {
      const { base64, mime } = await window.inkslateApi.file.readAsBase64(filePath)
      setImageDlg(d => ({ ...d, url: `data:${mime};base64,${base64}`, busy: false }))
    } catch (e) {
      alert('读取图片失败：' + (e as Error).message)
      setImageDlg(d => ({ ...d, busy: false }))
    }
  }

  const confirmImage = () => {
    if (!imageDlg.url) return
    const alt = imageDlg.alt || 'image'
    exec('insertHTML', `<img src="${escapeHtml(imageDlg.url)}" alt="${escapeHtml(alt)}" data-richtext-image="1" style="max-width: 100%;">`)
    setImageDlg(d => ({ ...d, open: false }))
  }

  const confirmTable = () => {
    const rows = Math.max(1, Math.min(20, tableDlg.rows))
    const cols = Math.max(1, Math.min(10, tableDlg.cols))
    let html = '<table data-richtext-table="1" style="border-collapse: collapse; width: 100%;">'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) {
        html += '<td style="border: 1px solid #ddd; padding: 6px; min-width: 40px;">&nbsp;</td>'
      }
      html += '</tr>'
    }
    html += '</table>'
    exec('insertHTML', html)
    setTableDlg(d => ({ ...d, open: false }))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
        display: 'flex',
        gap: 2,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-tertiary)',
        flexShrink: 0,
        flexWrap: 'wrap'
      }}>
        <ToolbarBtn icon={<Undo2 size={14} />} title="撤销 (Ctrl+Z)" onClick={() => exec('undo')} />
        <ToolbarBtn icon={<Redo2 size={14} />} title="重做 (Ctrl+Shift+Z)" onClick={() => exec('redo')} />
        <Divider />
        <ToolbarBtn icon={<Bold size={14} />} title="粗体 (Ctrl+B)" onClick={() => exec('bold')} />
        <ToolbarBtn icon={<Italic size={14} />} title="斜体 (Ctrl+I)" onClick={() => exec('italic')} />
        <ToolbarBtn icon={<Underline size={14} />} title="下划线 (Ctrl+U)" onClick={() => exec('underline')} />
        <ToolbarBtn icon={<Strikethrough size={14} />} title="删除线" onClick={() => exec('strikeThrough')} />
        <Divider />
        <ToolbarBtn icon={<Pilcrow size={14} />} title="段落" onClick={() => exec('formatBlock', '<p>')} />
        <ToolbarBtn icon={<Heading1 size={14} />} title="标题 1" onClick={() => exec('formatBlock', '<h1>')} />
        <ToolbarBtn icon={<Heading2 size={14} />} title="标题 2" onClick={() => exec('formatBlock', '<h2>')} />
        <ToolbarBtn icon={<Heading3 size={14} />} title="标题 3" onClick={() => exec('formatBlock', '<h3>')} />
        <ToolbarBtn icon={<Quote size={14} />} title="引用" onClick={() => exec('formatBlock', '<blockquote>')} />
        <Divider />
        <ToolbarBtn icon={<List size={14} />} title="无序列表" onClick={() => exec('insertUnorderedList')} />
        <ToolbarBtn icon={<ListOrdered size={14} />} title="有序列表" onClick={() => exec('insertOrderedList')} />
        <ToolbarBtn icon={<ListChecks size={14} />} title="待办列表" onClick={() => exec('insertHTML', '<ul style="list-style: none; padding-left: 0;"><li><input type="checkbox"> 待办项</li></ul>')} />
        <ToolbarBtn icon={<Indent size={14} />} title="增加缩进" onClick={() => exec('indent')} />
        <ToolbarBtn icon={<Outdent size={14} />} title="减少缩进" onClick={() => exec('outdent')} />
        <Divider />
        <ToolbarBtn icon={<AlignLeft size={14} />} title="左对齐" onClick={() => exec('justifyLeft')} />
        <ToolbarBtn icon={<AlignCenter size={14} />} title="居中" onClick={() => exec('justifyCenter')} />
        <ToolbarBtn icon={<AlignRight size={14} />} title="右对齐" onClick={() => exec('justifyRight')} />
        <ToolbarBtn icon={<Link size={14} />} title="插入链接" onClick={() => setLinkDlg({ open: true, url: 'https://', text: window.getSelection()?.toString() || '' })} />
        <ToolbarBtn icon={<Image size={14} />} title="插入图片" onClick={() => setImageDlg({ open: true, url: '', alt: '', busy: false })} />
        <ToolbarBtn icon={<Code size={14} />} title="行内代码" onClick={() => {
          const sel = window.getSelection()?.toString() || '代码'
          exec('insertHTML', `<code>${sel}</code>`)
        }} />
        <ToolbarBtn icon={<Code2 size={14} />} title="代码块" onClick={() => {
          const sel = window.getSelection()?.toString() || ''
          exec('insertHTML', `<pre><code>${sel || '代码块'}</code></pre>`)
        }} />
        <ToolbarBtn icon={<Table size={14} />} title="插入表格" onClick={() => setTableDlg({ open: true, rows: 3, cols: 3 })} />
        <ToolbarBtn icon={<Minus size={14} />} title="分割线" onClick={() => exec('insertHTML', '<hr>')} />
        <Divider />
        <ToolbarBtn icon={<Eraser size={14} />} title="清除格式" onClick={() => exec('removeFormat')} />
      </div>

      {/* ============== 链接弹窗 ============== */}
      {createPortal(
        <ModalShell
          open={linkDlg.open}
          title="插入链接"
          onClose={() => setLinkDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmLink}
          confirmText="插入"
          confirmDisabled={!linkDlg.url}
        >
          <Field label="链接地址">
            <input
              autoFocus
              value={linkDlg.url}
              onChange={e => setLinkDlg(d => ({ ...d, url: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmLink() }}
              placeholder="https://"
              style={inputStyle}
            />
          </Field>
          <Field label="显示文字（可选）">
            <input
              value={linkDlg.text}
              onChange={e => setLinkDlg(d => ({ ...d, text: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmLink() }}
              placeholder="留空则使用 URL 本身"
              style={inputStyle}
            />
          </Field>
        </ModalShell>,
        document.body
      )}

      {/* ============== 图片弹窗 ============== */}
      {createPortal(
        <ModalShell
          open={imageDlg.open}
          title="插入图片"
          onClose={() => setImageDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmImage}
          confirmText="插入"
          confirmDisabled={!imageDlg.url || imageDlg.busy}
        >
          <Field label="图片来源">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={imageDlg.url.startsWith('data:') ? `（已选择本地文件）` : imageDlg.url}
                readOnly={imageDlg.url.startsWith('data:')}
                onChange={e => setImageDlg(d => ({ ...d, url: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') confirmImage() }}
                placeholder="https://example.com/image.png"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={pickLocalImage}
                disabled={imageDlg.busy}
                style={btnStyle}
              >
                {imageDlg.busy ? '读取中...' : '本地文件'}
              </button>
            </div>
            {imageDlg.url.startsWith('data:') && (
              <button
                onClick={() => setImageDlg(d => ({ ...d, url: '' }))}
                style={{ ...btnStyle, marginTop: 6, fontSize: 12 }}
              >
                清除并改用 URL
              </button>
            )}
          </Field>
          <Field label="替代文字（alt，可选）">
            <input
              value={imageDlg.alt}
              onChange={e => setImageDlg(d => ({ ...d, alt: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmImage() }}
              placeholder="用于图片无法显示时的替代文本"
              style={inputStyle}
            />
          </Field>
          {imageDlg.url && (
            <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-secondary)', borderRadius: 4, textAlign: 'center' }}>
              <img
                src={imageDlg.url}
                alt="预览"
                style={{ maxWidth: '100%', maxHeight: 160 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
        </ModalShell>,
        document.body
      )}

      {/* ============== 表格弹窗 ============== */}
      {createPortal(
        <ModalShell
          open={tableDlg.open}
          title="插入表格"
          onClose={() => setTableDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmTable}
          confirmText="插入"
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="行数">
              <input
                type="number"
                min={1}
                max={20}
                value={tableDlg.rows}
                onChange={e => setTableDlg(d => ({ ...d, rows: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) }))}
                style={inputStyle}
              />
            </Field>
            <Field label="列数">
              <input
                type="number"
                min={1}
                max={10}
                value={tableDlg.cols}
                onChange={e => setTableDlg(d => ({ ...d, cols: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) }))}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            将插入 {tableDlg.rows} × {tableDlg.cols} 表格，可在单元格内继续编辑
          </div>
        </ModalShell>,
        document.body
      )}

            <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        style={{
          flex: 1,
          padding: '16px 24px',
          outline: 'none',
          overflow: 'auto',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontSize: fontSize + 1,
          lineHeight: 1.7,
          minHeight: 0
        }}
      />
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function ToolbarBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 26,
        borderRadius: 4,
        color: 'var(--text-secondary)',
        transition: 'all 150ms ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />
}

// ==================== 富文本弹窗通用组件 ====================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box'
}

const btnStyle: React.CSSProperties = {
  padding: '5px 14px',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  cursor: 'pointer'
}

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--accent-color)',
  borderColor: 'var(--accent-color)',
  color: '#fff'
}

function ModalShell({ open, title, onClose, onConfirm, confirmText = '确定', confirmDisabled = false, children }: {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: () => void
  confirmText?: string
  confirmDisabled?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          padding: 20,
          minWidth: 360,
          maxWidth: 500,
          width: '90%',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: 15, color: 'var(--text-primary)' }}>{title}</h3>
        <div style={{ marginBottom: 16 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={btnStyle}>取消</button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{ ...primaryBtnStyle, opacity: confirmDisabled ? 0.5 : 1, cursor: confirmDisabled ? 'not-allowed' : 'pointer' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
