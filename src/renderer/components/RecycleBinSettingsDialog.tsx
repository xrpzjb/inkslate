import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../store/app'
import { Trash2 } from 'lucide-react'

/** 回收站设置对话框：保留天数 + 自动清理开关 + 立即清理按钮 */
export function RecycleBinSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const emptyRecycleBin = useAppStore(s => s.emptyRecycleBin)
  const loadRecycleBin = useAppStore(s => s.loadRecycleBin)

  const [days, setDays] = useState<number>(settings?.recycleBin?.retentionDays ?? 30)
  const [auto, setAuto] = useState<boolean>(settings?.recycleBin?.autoCleanup ?? true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!settings) return
    setDays(settings.recycleBin?.retentionDays ?? 30)
    setAuto(settings.recycleBin?.autoCleanup ?? true)
  }, [settings])

  const handleSave = async () => {
    setBusy(true)
    try {
      const clamped = Math.max(0, Math.min(365, Math.floor(days) || 0))
      await updateSettings({ recycleBin: { retentionDays: clamped, autoCleanup: auto } })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleEmptyNow = async () => {
    if (!confirm('确定要清空回收站吗？所有已删除的笔记和笔记本将被永久删除，无法恢复。')) return
    setBusy(true)
    try {
      const result = await emptyRecycleBin()
      alert(`已清理 ${result.notes} 条笔记 + ${result.notebooks} 个笔记本`)
      await loadRecycleBin()
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: 24,
          width: 440,
          maxWidth: '90vw',
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Trash2 size={18} color="var(--text-secondary)" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>回收站设置</h3>
        </div>

        {/* 保留天数 */}
        <Field label="保留天数（天）">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value) || 0)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              style={{
                width: 80,
                padding: '6px 10px',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none'
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {days === 0 ? '（不自动清理）' : `超过 ${days} 天自动物理删除`}
            </span>
          </div>
        </Field>

        {/* 自动清理 */}
        <Field label="">
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-primary)',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            启动时自动清理过期项
          </label>
        </Field>

        <div style={{
          borderTop: '1px solid var(--border-color)',
          marginTop: 16,
          paddingTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            立即操作
          </div>
          <button
            onClick={handleEmptyNow}
            disabled={busy}
            style={{
              padding: '8px 12px',
              border: '1px solid #e74c3c',
              borderRadius: 4,
              background: 'transparent',
              color: '#e74c3c',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              if (busy) return
              e.currentTarget.style.background = '#e74c3c'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#e74c3c'
            }}
          >
            <Trash2 size={13} />
            清空回收站
          </button>
        </div>

        {/* 按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--accent-color)',
              color: '#fff',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}