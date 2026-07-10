import DOMPurify from 'dompurify'
import { md } from '../../utils/markdown'
import { NoteFormat } from '@shared/types'

export function SnapshotView({ content, format }: { content: string; format: NoteFormat }) {
  if (!content) {
    return <div className="history-placeholder">此版本尚无内容</div>
  }

  const renderContent = () => {
    switch (format) {
      case 'markdown': {
        const html = md.render(content)
        const clean = DOMPurify.sanitize(html)
        return <div className="preview-markdown" dangerouslySetInnerHTML={{ __html: clean }} />
      }
      case 'html': {
        const clean = DOMPurify.sanitize(content)
        return (
          <iframe
            title="历史 HTML 快照"
            srcDoc={clean}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-same-origin"
          />
        )
      }
      case 'richtext': {
        try {
          const doc = JSON.parse(content)
          if (doc?.content) {
            const html = richTextJsonToHtml(doc)
            return <div className="preview-rich" dangerouslySetInnerHTML={{ __html: html }} />
          }
        } catch {}
        return <pre className="history-code">{content}</pre>
      }
      case 'code':
        return <pre className="history-code"><code>{content}</code></pre>
      default:
        return <pre className="history-code">{content}</pre>
    }
  }

  return <div className="snapshot-content">{renderContent()}</div>
}

/** 简单 richtext JSON → HTML 转换 */
function richTextJsonToHtml(doc: any): string {
  if (!doc?.content) return ''
  return doc.content.map((node: any) => {
    const tag = node.type === 'heading' ? `h${node.attrs?.level || 2}` :
      node.type === 'paragraph' ? 'p' :
      node.type === 'code_block' ? 'pre' : 'div'
    const text = node.content?.map((n: any) => n.text ?? '').join('') || ''
    return `<${tag}>${text}</${tag}>`
  }).join('\n')
}
