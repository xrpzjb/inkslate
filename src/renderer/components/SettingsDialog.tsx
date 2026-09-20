import { useState } from 'react'
import { X, Settings as SettingsIcon, Type, Keyboard, Info, Bot, Loader2 } from 'lucide-react'
import { useAppStore } from '../store/app'
import { toast } from './Toast'

/** 全局字体选项 */
export const FONT_OPTIONS: { value: string; label: string; stack: string; mono?: boolean; bold?: boolean }[] = [
  { value: 'system', label: '系统默认', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
  { value: 'system-nano', label: 'System Nano', stack: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { value: 'songti', label: '宋体（清晰不虚）', stack: '"Songti SC", "SimSun", "NSimSun", "Source Han Serif SC", "Noto Serif CJK SC", "Times New Roman", serif' },
  { value: 'sourcehan-serif', label: '思源宋体（庄重清晰）', stack: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif' },
  { value: 'sourcehan', label: '思源黑体（圆润）', stack: '"Source Han Sans CN", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { value: 'jetbrains', label: 'JetBrains Mono（圆润）', stack: '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace', mono: true },
  { value: 'cascadia', label: 'Cascadia Code', stack: '"Cascadia Code", "Fira Code", Consolas, monospace', mono: true },
  { value: 'jetbrains-bold', label: 'JetBrains Mono Bold（粗体）', stack: '"JetBrains Mono Bold", "JetBrains Mono ExtraBold", "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace', mono: true, bold: true },
  { value: 'sourcecode', label: 'Source Code Pro（粗体清晰）', stack: '"Source Code Pro", "Source Code Pro Black", "JetBrains Mono", Menlo, Consolas, monospace', mono: true, bold: true },
]

/** 字体选择下拉框；defaultLabel 存在时额外提供「默认」空选项（值 ''） */
function FontSelect({ value, onChange, defaultLabel }: { value: string; onChange: (v: string) => void; defaultLabel?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="settings-font-select"
    >
      {defaultLabel !== undefined && <option value="">{defaultLabel}</option>}
      {FONT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
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
export function applyFontToCSS(cssVar: string, fontValue: string) {
  const opt = FONT_OPTIONS.find(o => o.value === fontValue)
  if (opt) {
    document.documentElement.style.setProperty(cssVar, opt.stack)
  }
}

/** 全局字体若选了等宽字体，同步 --font-mono（代码块/行内代码用） */
function applyFontMonoToCSS(fontValue: string) {
  const opt = FONT_OPTIONS.find(o => o.value === fontValue)
  if (opt && opt.mono) {
    document.documentElement.style.setProperty('--font-mono', opt.stack)
  } else if (opt) {
    document.documentElement.style.removeProperty('--font-mono')
  }
}

/**
 * 编辑器字重：以「编辑区域字体」为准，未单独设置时才跟随全局字体。
 * 只有等宽+粗体的选项（JetBrains Mono Bold / Source Code Pro）才设为 700。
 */
export function applyEditorWeightVar(editorFontValue?: string, globalFontValue?: string) {
  const opt = FONT_OPTIONS.find(o => o.value === (editorFontValue || globalFontValue || ''))
  if (opt?.mono && opt.bold) {
    document.documentElement.style.setProperty('--editor-font-weight', '700')
  } else {
    document.documentElement.style.removeProperty('--editor-font-weight')
  }
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore.getState().settings
  const [fontFamily, setFontFamily] = useState<string>(settings?.fontFamily ?? 'system')
  const [fontSize, setFontSize] = useState<number>(settings?.fontSize ?? 14)
  const [editorFontFamily, setEditorFontFamily] = useState<string>(settings?.editorFontFamily ?? '')
  const [treeFontFamily, setTreeFontFamily] = useState<string>(settings?.treeFontFamily ?? fontFamily)
  const [treeFontSize, setTreeFontSize] = useState<number>(settings?.treeFontSize ?? 14)
  const [showTreeCount, setShowTreeCount] = useState<boolean>(settings?.showTreeCount !== false)
  // AI 设置
  const aiPresets: Record<string, { label: string; url: string; model: string }> = {
    deepseek:   { label: 'DeepSeek',               url: 'https://api.deepseek.com/chat/completions',              model: 'deepseek-v4-flash' },
    qwen:       { label: '通义千问 (Qwen)',         url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
    glm:        { label: '智谱 GLM',                url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
    moonshot:   { label: '月之暗面 (Kimi)',         url: 'https://api.moonshot.cn/v1/chat/completions',           model: 'moonshot-v1-8k' },
    mimo:       { label: 'MiMo (小米)',             url: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',            model: 'mimo-v2.5-pro' },
    openai:     { label: 'OpenAI',                  url: 'https://api.openai.com/v1/chat/completions',            model: 'gpt-4o-mini' },
    opencode:   { label: 'OpenCode Go',              url: 'https://opencode.ai/zen/go/v1/chat/completions',       model: 'deepseek-v4-flash' },
    custom:     { label: '自定义 (OpenAI 兼容)',    url: '',                                                     model: '' },
  }
  const aiModels: Record<string, string[]> = {
    deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    qwen:     ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
    glm:      ['glm-4-flash', 'glm-4-plus', 'glm-4-air', 'glm-4-long'],
    moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    mimo:     ['mimo-v2.5', 'mimo-v2.5-pro'],
    openai:   ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
    opencode: ['grok-4.5', 'glm-5.2', 'glm-5.1', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'deepseek-v4-pro', 'deepseek-v4-flash', 'mimo-v2.5', 'mimo-v2.5-pro', 'minimax-m3', 'minimax-m2.7', 'minimax-m2.5', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus'],
  }
  // Anthropic 格式的模型（需要不同的 API 端点）
  const anthropicModels = new Set(['minimax-m3', 'minimax-m2.7', 'minimax-m2.5', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus'])
  // 「模型」下拉里代表「我要自己填」的哨兵值（真实模型名不会长这样）
  const CUSTOM_MODEL_OPTION = '__custom__'
  const [aiProvider, setAiProvider] = useState(settings?.ai?.provider ?? 'deepseek')
  const [aiUrl, setAiUrl] = useState(settings?.ai?.apiUrl ?? aiPresets['deepseek'].url)
  const [aiModel, setAiModel] = useState(settings?.ai?.model ?? aiPresets['deepseek'].model)
  const [aiKey, setAiKey] = useState(settings?.ai?.apiKey ?? '')
  const [aiProxyUrl, setAiProxyUrl] = useState(settings?.ai?.proxyUrl ?? '')
  const [aiTesting, setAiTesting] = useState(false)
  // 当前提供商的预设模型列表（自定义提供商没有 → 空数组）
  const aiModelOptions = aiModels[aiProvider] ?? []
  // 自定义提供商一律走手填输入框；预设提供商上出现列表外的模型名（历史配置/手填）也走输入框
  const showModelInput = aiProvider === 'custom' || !aiModelOptions.includes(aiModel)

  const persist = (patch: Record<string, unknown>) => {
    const cur = useAppStore.getState().settings
    if (cur) useAppStore.setState({ settings: { ...cur, ...patch } })
    window.inkslateApi.settings.update(patch as any).catch(() => {})
  }

  const handleFontChange = (value: string) => {
    setFontFamily(value)
    applyFontToCSS('--font-family', value)
    applyFontMonoToCSS(value)
    applyEditorWeightVar(editorFontFamily, value)
    persist({ fontFamily: value })
  }

  const handleEditorFontChange = (value: string) => {
    setEditorFontFamily(value)
    // 空值 = 回到编辑器默认字体（源码编辑器等宽 / 富文本跟随全局）
    if (value) applyFontToCSS('--editor-font', value)
    else document.documentElement.style.removeProperty('--editor-font')
    applyEditorWeightVar(value, fontFamily)
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

  const handleTreeCountToggle = () => {
    const next = !showTreeCount
    setShowTreeCount(next)
    persist({ showTreeCount: next })
  }

  const handleAiProviderChange = (prov: string) => {
    setAiProvider(prov)
    const preset = aiPresets[prov]
    if (!preset) return
    // 切到「自定义」时保留已填的地址/模型名，方便在已有配置上改名试别的端点；
    // 其余预设则套用该提供商的默认地址与默认模型。
    const nextUrl = prov === 'custom' ? (aiUrl || preset.url) : preset.url
    const nextModel = prov === 'custom' ? aiModel : preset.model
    setAiUrl(nextUrl)
    setAiModel(nextModel)
    // 提供商本身也要落库：不能等输入框 onBlur（用户可能只切下拉就去点「测试连接」）
    persist({
      ai: {
        provider: prov as any,
        apiUrl: nextUrl,
        model: nextModel,
        apiKey: aiKey,
        proxyUrl: aiProxyUrl,
        configured: !!(nextUrl && aiKey)
      } as any
    })
  }

  /** 切换「模型」下拉：设为 __custom__ 时进入自由输入，其余选中即生效 */
  const handleAiModelChange = (value: string) => {
    if (value === CUSTOM_MODEL_OPTION) {
      // 自由输入：清成空串让用户自己填，输入框走 aiModel state
      setAiModel('')
      return
    }
    setAiModel(value)
    if (aiProvider === 'opencode') {
      const base = 'https://opencode.ai/zen/go/v1'
      setAiUrl(anthropicModels.has(value) ? `${base}/messages` : `${base}/chat/completions`)
    }
    persist({
      ai: {
        provider: aiProvider as any,
        apiUrl: aiProvider === 'opencode'
          ? (anthropicModels.has(value)
              ? 'https://opencode.ai/zen/go/v1/messages'
              : 'https://opencode.ai/zen/go/v1/chat/completions')
          : aiUrl,
        model: value,
        apiKey: aiKey,
        proxyUrl: aiProxyUrl,
        configured: !!(aiUrl && aiKey)
      } as any
    })
  }

  const saveAiConfig = () => {
    const ai = { provider: aiProvider, apiUrl: aiUrl, model: aiModel, apiKey: aiKey, proxyUrl: aiProxyUrl, configured: !!(aiUrl && aiKey) } as any
    persist({ ai })
    window.inkslateApi.ai.configure(ai).catch(() => {})
  }

  const openShortcuts = () => {
    window.dispatchEvent(new CustomEvent('inkslate:open-shortcuts'))
    onClose()
  }

  const openAbout = () => {
    window.dispatchEvent(new CustomEvent('inkslate:open-about'))
    onClose()
  }

  const aiInputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13,
    outline: 'none', marginBottom: 8, boxSizing: 'border-box'
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
            <FontSelect value={fontFamily} onChange={handleFontChange} />
          </div>

          {/* 编辑区域字体 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Type size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />编辑区域字体</h3>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>默认：源码编辑器用等宽字体，富文本跟随全局字体</div>
            <FontSelect value={editorFontFamily} onChange={handleEditorFontChange} defaultLabel="默认" />
            <FontSizeControl value={fontSize} onChange={handleEditorFontSizeChange} />
          </div>

          {/* 树状图字体 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Type size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />树状图字体</h3>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>留空则跟随全局字体</div>
            <FontSelect value={treeFontFamily} onChange={handleTreeFontChange} />
            <FontSizeControl value={treeFontSize} onChange={handleTreeFontSizeChange} />
          </div>

          {/* 树状图数量标签 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Type size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />树状图</h3>
            <label className="settings-toggle-row">
              <span>笔记子级数量标签</span>
              <input type="checkbox" checked={showTreeCount} onChange={handleTreeCountToggle} />
              <span className="settings-toggle-slider" />
            </label>
          </div>

          {/* AI 大模型 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Bot size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />AI 写作</h3>
            <div style={{ marginBottom: 8 }}>
              <select className="settings-font-select" value={aiProvider} onChange={(e) => handleAiProviderChange(e.target.value)}>
                {Object.entries(aiPresets).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
            </div>
            <input
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              onBlur={saveAiConfig}
              placeholder="API 地址"
              style={aiInputStyle}
            />
            <div style={{ marginBottom: 8 }}>
              {/* 预设提供商：下拉选模型 + 末尾「手动输入模型名」；自定义提供商没有预设列表 → 纯文本输入 */}
              {showModelInput ? (
                aiProvider !== 'custom' && (
                  <select
                    value={CUSTOM_MODEL_OPTION}
                    onChange={(e) => {
                      // 从手填切回预设：选中即生效；用户也可能取消（选回「手动输入」）
                      if (e.target.value !== CUSTOM_MODEL_OPTION) handleAiModelChange(e.target.value)
                    }}
                    onBlur={saveAiConfig}
                    className="settings-font-select"
                    style={{ marginBottom: 8 }}
                  >
                    <option value={CUSTOM_MODEL_OPTION}>手动输入模型名</option>
                    {aiModelOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )
              ) : (
                <select
                  value={aiModel}
                  onChange={(e) => handleAiModelChange(e.target.value)}
                  onBlur={saveAiConfig}
                  className="settings-font-select"
                >
                  {aiModelOptions.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value={CUSTOM_MODEL_OPTION}>手动输入模型名…</option>
                </select>
              )}
              {showModelInput && (
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  onBlur={saveAiConfig}
                  placeholder="模型名，如 gpt-4o-mini / deepseek-chat"
                  autoComplete="off"
                  style={aiInputStyle}
                />
              )}
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {aiProvider === 'custom'
                  ? '自定义提供商：请填写模型名与完整的 OpenAI 兼容地址（如 https://host/v1/chat/completions）'
                  : '如需其他模型，在模型下拉里选「手动输入模型名」即可自己填'}
              </div>
            </div>
            <input
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              onBlur={saveAiConfig}
              placeholder="API Key"
              type="password"
              autoComplete="off"
              style={aiInputStyle}
            />
            <input
              value={aiProxyUrl}
              onChange={(e) => setAiProxyUrl(e.target.value)}
              onBlur={saveAiConfig}
              placeholder="代理地址（可选，如 http://127.0.0.1:7890）"
              autoComplete="off"
              style={aiInputStyle}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: -4 }}>
              <button
                onClick={async () => {
                  if (!aiUrl || !aiKey) return
                  setAiTesting(true)
                  try {
                    const res = await window.inkslateApi.ai.chat([{ role: 'user', content: 'hi' }])
                    toast.success(res ? '连接成功' : '连接成功（无返回）')
                  } catch (e: any) {
                    toast.error('连接失败: ' + (e?.message || '未知'))
                  } finally {
                    setAiTesting(false)
                  }
                }}
                disabled={aiTesting || !aiUrl || !aiKey}
                style={{
                  padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13,
                  cursor: aiTesting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  opacity: aiTesting ? 0.6 : 1
                }}
              >
                {aiTesting && <Loader2 size={14} className="spin" />}
                {aiTesting ? '测试中…' : '测试连接'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>支持 DeepSeek / 通义千问 / GLM / Kimi 等国内大模型</span>
            </div>
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
          作者：heimin
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
        .settings-section { margin-bottom: 20px; padding: 0 10px; }
        .settings-section:last-child { margin-bottom: 0; }
        .settings-font-select {
          width: 100%;
          padding: 8px 0;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          cursor: pointer;
        }
        .settings-font-select:focus {
          border-color: var(--accent-color);
        }
        .settings-font-size-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
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
        .settings-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 0;
          cursor: pointer;
          font-size: 13px;
          color: var(--text-primary);
        }
        .settings-toggle-row input[type="checkbox"] {
          display: none;
        }
        .settings-toggle-slider {
          width: 36px;
          height: 20px;
          border-radius: 10px;
          background: var(--text-tertiary);
          position: relative;
          transition: background 200ms;
          flex-shrink: 0;
        }
        .settings-toggle-slider::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--bg-primary);
          transition: transform 200ms;
        }
        .settings-toggle-row input:checked + .settings-toggle-slider {
          background: var(--accent-color);
        }
        .settings-toggle-row input:checked + .settings-toggle-slider::after {
          transform: translateX(16px);
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
