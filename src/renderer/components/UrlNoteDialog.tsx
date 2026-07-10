import { useEffect, useRef, useState } from 'react'
import { Link2, X } from 'lucide-react'
import { useAppStore } from '../store/app'

interface UrlNoteDialogProps {
  notebookId?: string
  parentId?: string | null
  onClose: () => void
}

/**
 * 新建网址笔记弹窗
 * - 标题可空，会从 URL 自动推
 * - URL 必填，没有协议时自动补 https://
 * - 确认后调用 store.createNote(..., 'url', undefined, normalized)
 */
export function UrlNoteDialog({ notebookId, parentId, onClose }: UrlNoteDialogProps) {
  const notebooks = useAppStore(s => s.notebooks)
  const createNote = useAppStore(s => s.createNote)

  const [name, setName] = useState('')
  const [value, setValue] = useState('https://')
  const [busy, setBusy] = useState(false)
  const [selectedNotebookId, setSelectedNotebookId] = useState(notebookId || '')
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (notebookId) setSelectedNotebookId(notebookId)
    else if (!selectedNotebookId && notebooks[0]) setSelectedNotebookId(notebooks[0].id)
  }, [notebooks, notebookId])

  useEffect(() => {
    urlRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    const rawUrl = value.trim()
    if (!rawUrl) {
      urlRef.current?.focus()
      return
    }
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl
    let u: URL
    try { u = new URL(normalized) } catch {
      urlRef.current?.focus()
      return
    }
    const nbId = selectedNotebookId || notebooks[0]?.id
    if (!nbId) return

    let title = name.trim()
    if (!title) {
      try { title = u.hostname + (u.pathname !== '/' ? u.pathname : '') } catch { title = '未命名网址' }
    }

    setBusy(true)
    try {
      await createNote(title, nbId, parentId ?? null, undefined, 'url', undefined, normalized)
      onClose()
    } catch (e) {
      setBusy(false)
      console.error('create url note failed:', e)
    }
  }

  return (
    <div
      className="url-note-dialog-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 12,
          minWidth: 380, maxWidth: 480, width: '85%',
          padding: 0,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
          animation: 'slideUp 0.2s ease',
          display: 'flex', flexDirection: 'column'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{
            fontSize: 16, fontWeight: 600, margin: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--text-primary)'
          }}>
            <Link2 size={18} /> 新建网址笔记
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              padding: 4, borderRadius: 6
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          <Field label="标题（可空，会从 URL 自动推）">
            <input
              className="dialog-input"
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            />
          </Field>
          <Field label="URL">
            <input
              ref={urlRef}
              className="dialog-input"
              style={inputStyle}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://"
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            />
          </Field>
          <Field label="保存到笔记本">
            <select
              className="dialog-input"
              style={inputStyle}
              value={selectedNotebookId}
              onChange={(e) => setSelectedNotebookId(e.target.value)}
            >
              {notebooks.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px 16px', borderTop: '1px solid var(--border-color)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 4,
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              border: '1px solid var(--border-color)', cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 4,
              background: 'var(--accent-color)', color: '#fff',
              border: '1px solid var(--accent-color)', cursor: busy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: busy ? 0.6 : 1
            }}
          >
            <Link2 size={14} />
            {busy ? '创建中...' : '创建'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 13,
  border: '1px solid var(--border-color)',
  borderRadius: 5,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit'
}
