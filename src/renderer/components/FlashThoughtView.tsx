import { useEffect } from 'react'
import { useAppStore } from '../store/app'
import { Plus, X } from 'lucide-react'
import { confirm } from './ConfirmDialog'

export function FlashThoughtView() {
  const flashThoughts = useAppStore(s => s.flashThoughts)
  const loadFlashThoughts = useAppStore(s => s.loadFlashThoughts)
  const deleteFlashThought = useAppStore(s => s.deleteFlashThought)

  useEffect(() => {
    loadFlashThoughts()
  }, [])

  const handleDelete = async (id: string) => {
    const ok = await confirm({ message: '确定删除这条闪念？删除后无法恢复。', title: '删除闪念', confirmText: '确定', cancelText: '取消', danger: true })
    if (!ok) return
    await deleteFlashThought(id)
  }

  const handleAdd = () => {
    window.dispatchEvent(new CustomEvent('inkslate:new-flash-thought'))
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return `今天 ${time}`
    if (isYesterday) return `昨天 ${time}`
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)'
    }}>
      <div style={{
        padding: '16px 32px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 600,
          margin: 0,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span role="img" aria-label="lightbulb">💡</span> 闪念
        </h2>
        <button
          onClick={handleAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500
          }}
        >
          <Plus size={16} />
          闪念
        </button>
      </div>

      {flashThoughts.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 14
        }}>
          点击右上角 + 创建闪念
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 32px 24px'
        }}>
          <div style={{
            columnWidth: 280,
            columnGap: 16
          }}>
            {flashThoughts.map(ft => (
              <div
                key={ft.id}
                className="flash-thought-card"
                style={{
                  breakInside: 'avoid',
                  marginBottom: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                  padding: '14px 16px',
                  position: 'relative'
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(ft.id)
                  }}
                  className="flash-thought-delete-btn"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    padding: 2,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s, color 0.15s'
                  }}
                  title="删除"
                >
                  <X size={14} />
                </button>
                <div style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  paddingRight: 18
                }}>
                  {ft.content}
                </div>
                <div style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: 'var(--text-tertiary)'
                }}>
                  {formatTime(ft.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .flash-thought-card:hover .flash-thought-delete-btn {
          opacity: 1 !important;
        }
        .flash-thought-delete-btn:hover {
          color: var(--text-primary) !important;
          background: var(--bg-hover);
        }
      `}</style>
    </div>
  )
}
