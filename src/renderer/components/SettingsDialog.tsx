import { useState } from 'react'
import { X, Settings as SettingsIcon, Type, Keyboard, Info, Bot, Loader2, Server } from 'lucide-react'
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

/** 字体选择下拉框 */
function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="settings-font-select"
    >
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
  const [aiProvider, setAiProvider] = useState(settings?.ai?.provider ?? 'deepseek')
  const [aiUrl, setAiUrl] = useState(settings?.ai?.apiUrl ?? aiPresets['deepseek'].url)
  const [aiModel, setAiModel] = useState(settings?.ai?.model ?? aiPresets['deepseek'].model)
  const [aiKey, setAiKey] = useState(settings?.ai?.apiKey ?? '')
  const [aiProxyUrl, setAiProxyUrl] = useState(settings?.ai?.proxyUrl ?? '')
  const [aiTesting, setAiTesting] = useState(false)

  // SSH 远程服务器设置（供 AI 写作的 SSH 工具使用）
  const [sshEnabled, setSshEnabled] = useState(settings?.ssh?.enabled ?? false)
  const [sshHost, setSshHost] = useState(settings?.ssh?.host ?? '')
  const [sshPort, setSshPort] = useState(String(settings?.ssh?.port ?? 22))
  const [sshUser, setSshUser] = useState(settings?.ssh?.username ?? '')
  const [sshPassword, setSshPassword] = useState('')
  const [sshTesting, setSshTesting] = useState(false)
  const [sshConfigured, setSshConfigured] = useState(!!settings?.ssh?.configured)

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

  const handleTreeCountToggle = () => {
    const next = !showTreeCount
    setShowTreeCount(next)
    persist({ showTreeCount: next })
  }

  const handleAiProviderChange = (prov: string) => {
    setAiProvider(prov)
    const preset = aiPresets[prov]
    if (preset) {
      setAiUrl(preset.url)
      setAiModel(preset.model)
    }
  }

  const saveAiConfig = () => {
    const ai = { provider: aiProvider, apiUrl: aiUrl, model: aiModel, apiKey: aiKey, proxyUrl: aiProxyUrl, configured: !!(aiUrl && aiKey) } as any
    persist({ ai })
    window.inkslateApi.ai.configure(ai).catch(() => {})
  }

  /** 保存 SSH 配置：密码交给主进程用 safeStorage 加密；返回保存后的配置 */
  const applySshConfig = async (): Promise<any> => {
    const sshApi = (window as any).inkslateApi?.ssh
    if (!sshApi?.configure) {
      toast.error('SSH 功能需要重启应用后生效')
      return null
    }
    const payload = {
      enabled: sshEnabled,
      host: sshHost.trim(),
      port: Number(sshPort) || 22,
      username: sshUser.trim(),
      password: sshPassword || undefined
    }
    const saved = await sshApi.configure(payload).catch(() => null)
    if (saved) {
      setSshConfigured(!!saved.configured)
      persist({ ssh: saved })
    }
    setSshPassword('')
    return saved
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
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>留空则跟随全局字体</div>
            <FontSelect value={editorFontFamily} onChange={handleEditorFontChange} />
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
              <select
                value={aiModel}
                onChange={(e) => {
                  const m = e.target.value
                  setAiModel(m)
                  if (aiProvider === 'opencode') {
                    const base = 'https://opencode.ai/zen/go/v1'
                    setAiUrl(anthropicModels.has(m) ? `${base}/messages` : `${base}/chat/completions`)
                  }
                }}
                onBlur={saveAiConfig}
                className="settings-font-select"
              >
                {(aiModels[aiProvider] || aiModel ? [...new Set([...((aiModels[aiProvider] || [])), aiModel])] : []).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>如需其他模型，切到自定义提供商手动输入</div>
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

          {/* SSH 远程服务器 */}
          <div className="settings-section">
            <h3 className="shortcuts-group-title"><Server size={14} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />SSH 远程（AI 读写服务器文件）</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={sshEnabled} onChange={(e) => setSshEnabled(e.target.checked)} />
              启用 SSH 工具（AI 可读取 / 写入远程文件）
            </label>
            <input
              value={sshHost}
              onChange={(e) => setSshHost(e.target.value)}
              placeholder="主机地址，如 192.168.1.10 或 example.com"
              autoComplete="off"
              style={aiInputStyle}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                placeholder="端口"
                autoComplete="off"
                style={{ ...aiInputStyle, flex: '0 0 90px', marginBottom: 0 }}
              />
              <input
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="用户名，如 root"
                autoComplete="off"
                style={{ ...aiInputStyle, flex: 1, marginBottom: 0 }}
              />
            </div>
            <input
              value={sshPassword}
              onChange={(e) => setSshPassword(e.target.value)}
              placeholder={sshConfigured ? '密码（已保存，留空则不修改）' : '登录密码'}
              type="password"
              autoComplete="off"
              style={aiInputStyle}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: -4 }}>
              <button
                onClick={async () => { await applySshConfig(); toast.success('SSH 配置已保存') }}
                style={{
                  padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer'
                }}
              >
                保存
              </button>
              <button
                onClick={async () => {
                  setSshTesting(true)
                  try {
                    await applySshConfig()
                    const sshApi = (window as any).inkslateApi?.ssh
                    if (!sshApi?.test) { toast.error('SSH 功能需要重启应用后生效'); return }
                    const res = await sshApi.test()
                    if (res.ok) toast.success(res.message || '连接成功')
                    else toast.error('连接失败: ' + (res.message || '未知错误'))
                  } catch (e: any) {
                    toast.error('连接失败: ' + (e?.message || '未知错误'))
                  } finally {
                    setSshTesting(false)
                  }
                }}
                disabled={sshTesting}
                style={{
                  padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13,
                  cursor: sshTesting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  opacity: sshTesting ? 0.6 : 1
                }}
              >
                {sshTesting && <Loader2 size={14} className="spin" />}
                {sshTesting ? '测试中…' : '测试连接'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {sshConfigured ? (sshEnabled ? '已配置并启用' : '已配置（未启用）') : '未配置'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              只读操作（列目录 / 读文件）自动执行；写入文件前会弹出确认框。密码使用系统安全存储加密保存。
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
