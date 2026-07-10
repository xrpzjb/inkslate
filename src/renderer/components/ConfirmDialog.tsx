import React, { useState, useEffect, useCallback, useRef } from 'react'

type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean  // 是否为危险操作（红色按钮）
  verifyText?: string  // 验证码：用户必须输入这段文字才能确认
  verifyLabel?: string // 输入框上方的提示文字
}

type ConfirmDialogProps = {
  options: ConfirmOptions
  onResolve: (result: boolean) => void
}

function ConfirmDialog({ options, onResolve }: ConfirmDialogProps) {
  const {
    title = '确认',
    message,
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
    verifyText,
    verifyLabel
  } = options

  const [inputValue, setInputValue] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const canConfirm = !verifyText || inputValue === verifyText

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve(false)
      if (e.key === 'Enter' && canConfirm) onResolve(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResolve, canConfirm])

  // 自动聚焦：有验证码聚焦输入框，否则聚焦取消按钮
  useEffect(() => {
    if (verifyText) {
      inputRef.current?.focus()
    } else {
      cancelRef.current?.focus()
    }
  }, [verifyText])

  return (
    <div className="confirm-overlay" onClick={() => onResolve(false)}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        {title && <div className="confirm-title">{title}</div>}
        <div className="confirm-message">{message}</div>
        {verifyText && (
          <div className="confirm-verify">
            <label className="confirm-verify-label">
              {verifyLabel || `请输入 "${verifyText}" 以确认：`}
            </label>
            <input
              ref={inputRef}
              className="confirm-verify-input"
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={verifyText}
              autoComplete="off"
            />
          </div>
        )}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            className="confirm-btn confirm-btn-cancel"
            onClick={() => onResolve(false)}
          >
            {cancelText}
          </button>
          <button
            className={`confirm-btn ${danger ? 'confirm-btn-danger' : 'confirm-btn-confirm'}`}
            disabled={!canConfirm}
            onClick={() => onResolve(true)}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        .confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 1001;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease;
        }
        .confirm-dialog {
          background: var(--bg-primary);
          border-radius: 12px;
          min-width: 340px;
          max-width: 420px;
          width: 85%;
          padding: 20px 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          animation: slideUp 0.2s ease;
        }
        .confirm-title {
          font-size: 17px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }
        .confirm-message {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-secondary);
          margin-bottom: 24px;
          white-space: pre-wrap;
        }
        .confirm-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .confirm-btn {
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
        }
        .confirm-btn-cancel {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .confirm-btn-cancel:hover {
          background: var(--bg-tertiary);
        }
        .confirm-btn-confirm {
          background: var(--accent-color, #3b82f6);
          color: #fff;
        }
        .confirm-btn-confirm:hover {
          filter: brightness(1.1);
        }
        .confirm-btn-danger {
          background: #ef4444;
          color: #fff;
        }
        .confirm-btn-danger:hover {
          background: #dc2626;
        }
        .confirm-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          filter: none;
        }
        .confirm-verify {
          margin-bottom: 16px;
        }
        .confirm-verify-label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .confirm-verify-input {
          width: 100%;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
        }
        .confirm-verify-input:focus {
          border-color: var(--accent-color, #3b82f6);
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

// 核心 API - 类似 window.confirm 的 Promise 版本
let pendingResolve: ((result: boolean) => void) | null = null

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // 如果已有确认框打开，先关闭它
    if (pendingResolve) {
      pendingResolve(false)
    }
    pendingResolve = resolve
    // 触发全局状态更新，在 App 层渲染确认框
    window.dispatchEvent(new CustomEvent('show-confirm-dialog', { detail: options }))
  })
}

// 监听 confirm 调用的组件（放在 App 根组件下）
export function ConfirmDialogManager() {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null)

  useEffect(() => {
    const handler = (e: CustomEvent<ConfirmOptions>) => {
      setDialog(e.detail)
    }
    window.addEventListener('show-confirm-dialog', handler as EventListener)
    return () => window.removeEventListener('show-confirm-dialog', handler as EventListener)
  }, [])

  const handleResolve = useCallback((result: boolean) => {
    setDialog(null)
    if (pendingResolve) {
      pendingResolve(result)
      pendingResolve = null
    }
  }, [])

  if (!dialog) return null
  return <ConfirmDialog options={dialog} onResolve={handleResolve} />
}
