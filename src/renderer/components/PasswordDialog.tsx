import { useState } from 'react'
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

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            <Lock size={16} />
            {titles[mode]}
          </h2>
          <button onClick={onClose} className="dialog-close"><X size={16} /></button>
        </div>
        <div className="dialog-body">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            笔记本：{notebookName}
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">
              {mode === 'set' ? '设置密码' : mode === 'remove' ? '当前密码' : '请输入密码以查看笔记'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="输入密码"
              className="dialog-input"
              autoFocus
            />
          </div>

          {mode === 'set' && (
            <div className="dialog-field">
              <label className="dialog-field-label">确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="再次输入密码"
                className="dialog-input"
              />
            </div>
          )}

          {result && (
            <div className={`dialog-status ${result.ok ? 'dialog-status-success' : 'dialog-status-error'}`}>
              {result.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {result.message}
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">取消</button>
          <button onClick={handleSubmit} disabled={busy} className="dialog-btn dialog-btn-primary">
            {busy ? <Loader2 size={14} className="spin" /> : mode === 'unlock' ? <Unlock size={14} /> : <Lock size={14} />}
            {mode === 'set' ? '确认' : mode === 'remove' ? '移除密码' : '解锁'}
          </button>
        </div>
      </div>
    </>
  )
}
