import { X } from 'lucide-react'

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { category: '文件', items: [
      { key: 'Ctrl + N', desc: '新建 Markdown 笔记' },
      { key: 'Ctrl + Shift + N', desc: '新建笔记本' },
      { key: 'Ctrl + S', desc: '保存当前笔记' }
    ]},
    { category: '视图', items: [
      { key: 'Ctrl + B', desc: '切换侧栏' },
      { key: 'Ctrl + P', desc: '切换预览' },
      { key: 'Ctrl + Shift + E', desc: '切换编辑器' },
      { key: 'F11', desc: '全屏' }
    ]},
    { category: '笔记本同步', items: [
      { key: 'Ctrl + Shift + S', desc: '同步到云端' },
      { key: 'Ctrl + Shift + D', desc: '从云端拉取' }
    ]},
    { category: '编辑', items: [
      { key: 'Ctrl + F', desc: '查找' },
      { key: 'Ctrl + Z', desc: '撤销' },
      { key: 'Ctrl + Shift + Z', desc: '重做' }
    ]}
  ]

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-md)',
          width: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>快捷键</h2>
          <button onClick={onClose} className="panel-action-btn"><X size={16} /></button>
        </div>
        <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
          {shortcuts.map(group => (
            <div key={group.category} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {group.category}
              </h3>
              {group.items.map(item => (
                <div key={item.key} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  fontSize: 13
                }}>
                  <span style={{ color: 'var(--text-primary)' }}>{item.desc}</span>
                  <kbd style={{
                    padding: '2px 8px',
                    borderRadius: 3,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11
                  }}>{item.key}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-color)',
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--text-tertiary)'
        }}>
          作者：heimin · 本项目全程使用 minimax m3 开发
        </div>
      </div>
    </div>
  )
}
