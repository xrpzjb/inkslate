import React, { useState, useEffect, useCallback, useRef } from 'react'

type AlertOptions = {
  title?: string
  message: string
  confirmText?: string
}

type AlertDialogProps = {
  options: AlertOptions
  onResolve: () => void
}

function AlertDialog({ options, onResolve }: AlertDialogProps) {
  const {
    title = '提示',
    message,
    confirmText = '确定'
  } = options

  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResolve])

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <div className="alert-overlay" onClick={onResolve}>
      <div className="alert-dialog" onClick={e => e.stopPropagation()}>
        {title && <div className="alert-title">{title}</div>}
        <div className="alert-message">{message}</div>
        <div className="alert-actions">
          <button
            ref={confirmRef}
            className="alert-btn alert-btn-confirm"
            onClick={onResolve}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        .alert-overlay {
          position: fixed;
          inset: 0;
          z-index: 1001;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease;
        }
        .alert-dialog {
          background: var(--bg-primary);
          border-radius: 12px;
          min-width: 340px;
          max-width: 420px;
          width: 85%;
          padding: 20px 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          animation: slideUp 0.2s ease;
        }
        .alert-title {
          font-size: 17px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }
        .alert-message {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-secondary);
          margin-bottom: 24px;
          white-space: pre-wrap;
        }
        .alert-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .alert-btn {
          padding: 8px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
        }
        .alert-btn-confirm {
          background: var(--accent-color, #3b82f6);
          color: #fff;
        }
        .alert-btn-confirm:hover {
          filter: brightness(1.1);
        }
        .alert-btn-confirm:focus {
          outline: 2px solid var(--accent-color, #3b82f6);
          outline-offset: 2px;
        }
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

// 核心 API - 类似 window.alert 的 Promise 版本
let pendingAlertResolve: (() => void) | null = null

export function alert(options: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    // 如果已有弹框打开，先关闭它
    if (pendingAlertResolve) {
      pendingAlertResolve()
    }
    pendingAlertResolve = resolve
    window.dispatchEvent(new CustomEvent('show-alert-dialog', { detail: options }))
  })
}

// 监听 alert 调用的组件
export function AlertDialogManager() {
  const [dialog, setDialog] = useState<AlertOptions | null>(null)

  useEffect(() => {
    const handler = (e: CustomEvent<AlertOptions>) => {
      setDialog(e.detail)
    }
    window.addEventListener('show-alert-dialog', handler as EventListener)
    return () => window.removeEventListener('show-alert-dialog', handler as EventListener)
  }, [])

  const handleResolve = useCallback(() => {
    setDialog(null)
    if (pendingAlertResolve) {
      pendingAlertResolve()
      pendingAlertResolve = null
    }
  }, [])

  if (!dialog) return null
  return <AlertDialog options={dialog} onResolve={handleResolve} />
}
