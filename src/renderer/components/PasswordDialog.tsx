import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Unlock, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * 密码弹窗
 * - mode: 'set' | 'remove' | 'unlock'
 *   set: 设置密码（需确认）
 *   remove: 移除密码（需输入当前密码）
 *   unlock: 解锁查看笔记（需输入密码）
 */
export function PasswordDialog({
  mode,
  notebookName,
  onSubmit,
  onClose
}: {
  mode: 'set' | 'remove' | 'unlock'
  notebookName: string
  onSubmit: (password: string) => Promise<{ ok: boolean; message: string }>
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const titles: Record<string, string> = {
    set: '设置密码',
    remove: '移除密码',
    unlock: '输入密码'
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async () => {
    if (!password) {
      setResult({ ok: false, message: '请输入密码' })
      return
    }
    if (mode === 'set' && password !== confirm) {
      setResult({ ok: false, message: '两次密码不一致' })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const r = await onSubmit(password)
      setResult(r)
      if (r.ok) setTimeout(onClose, 800)
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '操作失败' })
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="password-dialog-overlay" onClick={onClose}>
      <div
        className="password-dialog-content"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 380 }}
      >
        <div className="password-dialog-header">
          <h2 className="password-dialog-title">
            <Lock size={16} />
            {titles[mode]}
          </h2>
          <button onClick={onClose} className="password-dialog-close"><X size={16} /></button>
        </div>
        <div className="password-dialog-body">
          <div className="password-dialog-notebook">
            笔记本：{notebookName}
          </div>

          <div className="password-dialog-field">
            <label className="password-dialog-label">
              {mode === 'set' ? '设置密码' : mode === 'remove' ? '当前密码' : '请输入密码以查看笔记'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="输入密码"
              className="password-dialog-input"
              autoFocus
            />
          </div>

          {mode === 'set' && (
            <div className="password-dialog-field">
              <label className="password-dialog-label">确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="再次输入密码"
                className="password-dialog-input"
              />
            </div>
          )}

          {result && (
            <div className={`password-dialog-status ${result.ok ? 'password-dialog-status-success' : 'password-dialog-status-error'}`}>
              {result.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {result.message}
            </div>
          )}
        </div>
        <div className="password-dialog-footer">
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="password-dialog-btn password-dialog-btn-secondary">取消</button>
          <button onClick={handleSubmit} disabled={busy} className="password-dialog-btn password-dialog-btn-primary">
            {busy ? <Loader2 size={14} className="spin" /> : mode === 'unlock' ? <Unlock size={14} /> : <Lock size={14} />}
            {mode === 'set' ? '确认' : mode === 'remove' ? '移除密码' : '解锁'}
          </button>
        </div>
      </div>
      <style>{`
        .password-dialog-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pwd-fadeIn 0.15s ease;
        }
        .password-dialog-content {
          background: var(--bg-primary);
          border-radius: 12px;
          max-width: 480px;
          width: 90%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          animation: pwd-slideUp 0.2s ease;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .password-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .password-dialog-title {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .password-dialog-close {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .password-dialog-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .password-dialog-body {
          padding: 16px 20px;
          color: var(--text-primary);
        }
        .password-dialog-notebook {
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 14px;
          padding: 8px 10px;
          background: var(--bg-secondary);
          border-radius: 6px;
        }
        .password-dialog-field {
          margin-bottom: 12px;
        }
        .password-dialog-label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 6px;
          font-weight: 500;
        }
        .password-dialog-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          outline: none;
          transition: border-color 0.15s ease;
          box-sizing: border-box;
          font-family: inherit;
        }
        .password-dialog-input:focus {
          border-color: var(--accent-color);
        }
        .password-dialog-status {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          font-size: 12px;
          border-radius: 6px;
          margin-top: 4px;
        }
        .password-dialog-status-success {
          background: rgba(34, 197, 94, 0.1);
          color: #16a34a;
        }
        .password-dialog-status-error {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }
        .password-dialog-footer {
          padding: 12px 20px 16px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid var(--border-color);
        }
        .password-dialog-btn {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .password-dialog-btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .password-dialog-btn-secondary:hover {
          background: var(--bg-hover);
        }
        .password-dialog-btn-primary {
          background: var(--accent-color);
          color: #fff;
        }
        .password-dialog-btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .password-dialog-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .password-dialog-overlay .spin {
          animation: pwd-spin 1s linear infinite;
        }
        @keyframes pwd-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pwd-slideUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pwd-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>,
    document.body
  )
}
