import { X, Keyboard } from 'lucide-react'

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
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">
            <Keyboard size={18} />
            快捷键
          </h2>
          <button onClick={onClose} className="shortcuts-close"><X size={16} /></button>
        </div>
        <div className="shortcuts-body">
          {shortcuts.map(group => (
            <div key={group.category} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{group.category}</h3>
              {group.items.map(item => (
                <div key={item.key} className="shortcuts-item">
                  <span className="shortcuts-desc">{item.desc}</span>
                  <kbd className="shortcuts-key">{item.key}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">
          作者：heimin
        </div>
      </div>
      <style>{`
        .shortcuts-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: fadeIn 0.15s ease;
        }
        .shortcuts-dialog {
          background: var(--bg-primary);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          width: 480px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.2s ease;
        }
        .shortcuts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }
        .shortcuts-title {
          font-size: 16;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8;
          margin: 0;
          color: var(--text-primary);
        }
        .shortcuts-close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.15s;
        }
        .shortcuts-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .shortcuts-body {
          padding: 16px 20px;
          overflow-y: auto;
          flex: 1;
        }
        .shortcuts-group {
          margin-bottom: 20px;
        }
        .shortcuts-group:last-child {
          margin-bottom: 0;
        }
        .shortcuts-group-title {
          font-size: 12;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .shortcuts-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          font-size: 13;
          border-bottom: 1px solid var(--border-color);
        }
        .shortcuts-item:last-child {
          border-bottom: none;
        }
        .shortcuts-desc {
          color: var(--text-primary);
        }
        .shortcuts-key {
          padding: 4px 10px;
          border-radius: 6px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          font-family: var(--font-mono);
          font-size: 11;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .shortcuts-footer {
          padding: 12px 20px;
          border-top: 1px solid var(--border-color);
          text-align: center;
          font-size: 11;
          color: var(--text-tertiary);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
