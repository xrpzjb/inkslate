import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X, Loader2 } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

interface Toast {
  id: number
  type: ToastType
  message: string
  duration?: number
}

let toastId = 0
const listeners: Set<(toasts: Toast[]) => void> = new Set()

/** 显示 Toast 提示 */
export function showToast(type: ToastType, message: string, duration = 3000) {
  const toast: Toast = { id: ++toastId, type, message, duration }
  // 先广播 toast 列表更新（加载 loading 状态不需要等 setState）
  const currentToasts: Toast[] = []
  listeners.forEach(fn => fn(currentToasts.concat(toast)))
}

/** 快捷方法 */
export const toast = {
  success: (msg: string, duration?: number) => showToast('success', msg, duration),
  error: (msg: string, duration?: number) => showToast('error', msg, duration),
  info: (msg: string, duration?: number) => showToast('info', msg, duration),
  loading: (msg: string, duration?: number) => showToast('loading', msg, duration),
}

/** Toast 容器组件（放在 App 根组件中） */
export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setToasts(newToasts)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  // 自动移除 toast
  useEffect(() => {
    toasts.forEach(toast => {
      if (toast.type === 'loading') return // loading 不自动移除
      if (!toast.duration) return
      const timer = setTimeout(() => removeToast(toast.id), toast.duration)
      return () => clearTimeout(timer)
    })
  }, [toasts, removeToast])

  if (toasts.length === 0) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>,
    document.body
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // 加载完成后自动消失
    if (toast.type !== 'loading') return
    // loading 显示后，用户可能调用 toast.success() 来替换它
    // 这里不做自动移除，等待外部手动控制
  }, [toast])

  const handleClose = () => {
    setExiting(true)
    setTimeout(onClose, 200)
  }

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 size={18} color="#22c55e" />,
    error: <AlertCircle size={18} color="#ef4444" />,
    info: <Info size={18} color="#3b82f6" />,
    loading: <Loader2 size={18} className="spin" color="#6b7280" />,
  }

  const bgColors: Record<ToastType, string> = {
    success: 'rgba(34, 197, 94, 0.15)',
    error: 'rgba(239, 68, 68, 0.15)',
    info: 'rgba(59, 130, 246, 0.15)',
    loading: 'var(--bg-secondary)',
  }

  const borderColors: Record<ToastType, string> = {
    success: 'rgba(34, 197, 94, 0.3)',
    error: 'rgba(239, 68, 68, 0.3)',
    info: 'rgba(59, 130, 246, 0.3)',
    loading: 'var(--border-color)',
  }

  return (
    <div
      className={`toast-item ${exiting ? 'toast-exit' : 'toast-enter'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--bg-primary)',
        border: `1px solid ${borderColors[toast.type]}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        pointerEvents: 'auto',
        minWidth: 200,
        maxWidth: 400,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(-10px)' : 'translateY(0)',
        transition: 'all 0.2s ease'
      }}
    >
      {icons[toast.type]}
      <span style={{
        flex: 1,
        fontSize: 13,
        color: 'var(--text-primary)',
        lineHeight: 1.4
      }}>
        {toast.message}
      </span>
      {toast.type !== 'loading' && (
        <button
          onClick={handleClose}
          style={{
            padding: 2,
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >
          <X size={14} />
        </button>
      )}
      <style>{`
        .toast-enter {
          animation: toastIn 0.2s ease-out;
        }
        .toast-exit {
          animation: toastOut 0.2s ease-in forwards;
        }
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes toastOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-10px);
          }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
