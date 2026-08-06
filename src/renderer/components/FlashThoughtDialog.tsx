import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app'
import { X } from 'lucide-react'
import { toast } from './Toast'
import { FlashThought } from '@shared/types'

interface FlashThoughtDialogProps {
  flashThought?: FlashThought
  onClose: () => void
}

export function FlashThoughtDialog({ flashThought, onClose }: FlashThoughtDialogProps) {
  const createFlashThought = useAppStore(s => s.createFlashThought)
  const updateFlashThought = useAppStore(s => s.updateFlashThought)
  const isEdit = !!flashThought
  const [content, setContent] = useState(flashThought?.content ?? '')
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    const text = content.trim()
    if (!text) {
      textareaRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      if (isEdit) {
        await updateFlashThought(flashThought.id, text)
        toast.success('闪念已更新')
      } else {
        await createFlashThought(text)
        toast.success('闪念已保存')
      }
      onClose()
    } catch (e) {
      setBusy(false)
      toast.error('保存失败：' + (e as Error).message)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 12,
          minWidth: 380, maxWidth: 480, width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
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
            <span role="img" aria-label="lightbulb">💡</span> {isEdit ? '编辑闪念' : '闪念'}
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="记录此刻的想法..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                submit()
              }
            }}
            style={{
              width: '100%',
              minHeight: 120,
              resize: 'vertical',
              padding: '10px 12px',
              fontSize: 14,
              lineHeight: 1.6,
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px',
          borderTop: '1px solid var(--border-color)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500
            }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: 8,
              background: 'var(--accent-color)',
              color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
              opacity: busy ? 0.6 : 1
            }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
