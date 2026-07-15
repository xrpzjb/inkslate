import { useState } from 'react'
import { X, Settings as SettingsIcon, Type, Keyboard, Info } from 'lucide-react'
import { useAppStore } from '../store/app'

/** 全局字体选项 */
export const FONT_OPTIONS: { value: string; label: string; stack: string; mono?: boolean; bold?: boolean }[] = [
  { value: 'system', label: '系统默认', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
  { value: 'system-nano', label: 'System Nano', stack: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { value: 'jetbrains', label: 'JetBrains Mono（圆润）', stack: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace', mono: true },
  { value: 'cascadia', label: 'Cascadia Code', stack: '"Cascadia Code", "Fira Code", Consolas, monospace', mono: true },
  { value: 'jetbrains-bold', label: 'JetBrains Mono Bold（粗体）', stack: '"JetBrains Mono Bold", "JetBrains Mono ExtraBold", "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace', mono: true, bold: true },
  { value: 'sourcecode', label: 'Source Code Pro（粗体清晰）', stack: '"Source Code Pro", "Source Code Pro Black", "JetBrains Mono", Menlo, Consolas, monospace', mono: true, bold: true },
  { value: 'sourcehan', label: '思源黑体（圆润）', stack: '"Source Han Sans CN", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
]

/** 单个字体选择列表（无状态 UI，由外部传入当前值和回调） */
function FontOptionList({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="settings-font-list" role="radiogroup">
      {FONT_OPTIONS.map(opt => (
        <div
          key={opt.value}
          className={'settings-font-option' + (value === opt.value ? ' active' : '')}
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={0}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.value) } }}
        >
          <span className="settings-font-label" style={{ fontFamily: opt.stack }}>
            {opt.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 字体大小 +/- 按钮 */
function FontSizeControl({ value, onChange }: { value: number; onChange: (delta: number) => void }) {
  return (
    <div className="settings-font-size-row">
      <button className="settings-size-btn" onClick={() => onChange(-1)} disabled={value <= 10}>A-</button>
      <span className="settings-size-value">{value}px</span>
      <button className="settings-size-btn" onClick={() => onChange(1)} disabled={value >= 32}>A+</button>
    </div>
  )
}

/** 应用字体选项到 CSS 变量（cssVar 如 '--font-family'），仅设置字体，不涉及 mono/bold 逻辑 */
function applyFontToCSS(cssVar: string, fontValue: string) {
  const opt = FONT_OPTIONS.find(o => o.value === fontValue)
  if (opt) {
    document.documentElement.style.setProperty(cssVar, opt.stack)
  }
}

function applyFontMonoToCSS(fontValue: string) {
  const opt = FONT_OPTIONS.find(o => o.value === fontValue)
  if (opt && opt.mono) {
    document.documentElement.style.setProperty('--font-mono', opt.stack)
    document.documentElement.style.setProperty('--editor-font-weight', opt.bold ? '700' : '400')
  } else if (opt) {
    document.documentElement.style.removeProperty('--font-mono')
    document.documentElement.style.removeProperty('--editor-font-weight')
  }
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore.getState().settings
  const [fontFamily, setFontFamily] = useState<string>(settings?.fontFamily ?? 'system')
  const [fontSize, setFontSize] = useState<number>(settings?.fontSize ?? 14)
  const [editorFontFamily, setEditorFontFamily] = useState<string>(settings?.editorFontFamily ?? fontFamily)
  const [treeFontFamily, setTreeFontFamily] = useState<string>(settings?.treeFontFamily ?? fontFamily)
  const [treeFontSize, setTreeFontSize] = useState<number>(settings?.treeFontSize ?? 14)

  const persist = (patch: Record<string, unknown>) => {
    const cur = useAppStore.getState().settings
    if (cur) useAppStore.setState({ settings: { ...cur, ...patch } })
    window.inkslateApi.settings.update(patch as any).catch(() => {})
  }

  const handleFontChange = (value: string) => {
    setFontFamily(value)
    applyFontToCSS('--font-family', value)
    applyFontMonoToCSS(value)
    persist({ fontFamily: value })
  }

  const handleEditorFontChange = (value: string) => {
    setEditorFontFamily(value)
    applyFontToCSS('--editor-font', value)
    persist({ editorFontFamily: value })
  }

  const handleTreeFontChange = (value: string) => {
    setTreeFontFamily(value)
    applyFontToCSS('--tree-font', value)
    persist({ treeFontFamily: value })
  }

  const handleEditorFontSizeChange = (delta: number) => {
    const newSize = Math.min(32, Math.max(10, fontSize + delta))
    setFontSize(newSize)
    persist({ fontSize: newSize })
  }

  const handleTreeFontSizeChange = (delta: number) => {
    const newSize = Math.min(32, Math.max(10, treeFontSize + delta))
    setTreeFontSize(newSize)
    document.documentElement.style.setProperty('--tree-font-size', `${newSize}px`)
    persist({ treeFontSize: newSize })
  }

  const openShortcuts = () => {
    window.dispatchEvent(new CustomEvent('inkslate:open-shortcuts'))
    onClose()
  }

  const openAbout = () => {
    window.dispatchEvent(new CustomEvent('inkslate:open-about'))
    onClose()
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">
            <SettingsIcon size={18} />
            设置
          </h2>
          <button onClick={onClose} className="shortcuts-close"><X size={16} /></button>
        </div>
        <div className="shortcuts-body">
          {/* 全局字体 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Type size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />全局字体</h3>
            <FontOptionList value={fontFamily} onChange={handleFontChange} />
          </div>

          {/* 编辑区域字体 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Type size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />编辑区域字体</h3>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>留空则跟随全局字体</div>
            <FontOptionList value={editorFontFamily} onChange={handleEditorFontChange} />
            <FontSizeControl value={fontSize} onChange={handleEditorFontSizeChange} />
          </div>

          {/* 树状图字体 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Type size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />树状图字体</h3>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>留空则跟随全局字体</div>
            <FontOptionList value={treeFontFamily} onChange={handleTreeFontChange} />
            <FontSizeControl value={treeFontSize} onChange={handleTreeFontSizeChange} />
          </div>

          {/* 快捷键入口 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Keyboard size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />快捷键</h3>
            <button className="settings-link-btn" onClick={openShortcuts}>查看所有快捷键 →</button>
          </div>

          {/* 关于入口 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Info size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />关于</h3>
            <button className="settings-link-btn" onClick={openAbout}>关于 墨与石板 →</button>
          </div>
        </div>
        <div className="shortcuts-footer">
          作者：heimin · 本项目全程使用 minimax m3 开发
        </div>
      </div>
      <style>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
        }
        .settings-dialog {
          background: var(--bg-primary);
          color: var(--text-primary);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08);
          width: 520px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .settings-dialog .shortcuts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-color);
        }
        .settings-dialog .shortcuts-title {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-primary);
        }
        .settings-dialog .shortcuts-close {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
        }
        .settings-dialog .shortcuts-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .settings-dialog .shortcuts-body {
          padding: 18px;
          overflow: auto;
          color: var(--text-primary);
        }
        .settings-dialog .shortcuts-group-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 10px;
        }
        .settings-dialog .shortcuts-footer {
          padding: 10px 18px;
          border-top: 1px solid var(--border-color);
          text-align: center;
          font-size: 11px;
          color: var(--text-tertiary);
        }
        .settings-section { margin-bottom: 20px; }
        .settings-section:last-child { margin-bottom: 0; }
        .settings-font-list { display: flex; flex-direction: column; gap: 6px; }
        .settings-font-option {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 6px;
          border: 1px solid var(--border-color);
          cursor: pointer; transition: background 100ms, border-color 100ms;
          outline: none;
        }
        .settings-font-option:hover { background: var(--bg-hover); }
        .settings-font-option:focus-visible { box-shadow: 0 0 0 2px var(--accent-color); }
        .settings-font-option.active {
          background: var(--accent-bg);
          border-color: var(--accent-color);
        }
        .settings-font-option::before {
          content: '';
          width: 14px; height: 14px;
          border-radius: 50%;
          border: 2px solid var(--text-tertiary);
          flex-shrink: 0;
          transition: border-color 100ms, background 100ms;
        }
        .settings-font-option.active::before {
          border-color: var(--accent-color);
          background: var(--accent-color);
          box-shadow: inset 0 0 0 3px var(--accent-bg);
        }
        .settings-font-label { font-size: 14px; color: var(--text-primary); }
        .settings-font-size-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
        }
        .settings-size-btn {
          width: 36px; height: 36px;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          display: flex; align-items: center; justify-content: center;
          transition: background 100ms;
        }
        .settings-size-btn:hover:not(:disabled) { background: var(--bg-hover); }
        .settings-size-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .settings-size-value {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          min-width: 44px;
          text-align: center;
        }
        .settings-link-btn {
          padding: 8px 14px; border-radius: 6px;
          background: var(--bg-secondary); color: var(--text-primary);
          border: 1px solid var(--border-color); cursor: pointer;
          font-size: 13px; transition: background 100ms;
        }
        .settings-link-btn:hover { background: var(--bg-hover); }
      `}</style>
    </div>
  )
}
