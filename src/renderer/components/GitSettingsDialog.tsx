import { useState } from 'react'
import { useAppStore } from '../store/app'
import { X, Save, Loader2, CheckCircle2, AlertCircle, GitBranch, Download, FolderPlus, RefreshCw } from 'lucide-react'

/**
 * Git 同步设置弹窗
 * - 配置仓库 URL / 分支 / author / token
 * - token 用 safeStorage 加密存（主进程处理）
 * - 三种初始化路径：
 *   1. 已有本地数据 → git init（把现有数据变成首个 commit）
 *   2. 空工作区 + 远端有仓库 → git clone（拉取远端）
 *   3. 已初始化 → 只更新配置
 */
export function GitSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore(s => s.settings)
  const gitSync = settings?.gitSync

  const [repoUrl, setRepoUrl] = useState(gitSync?.repoUrl ?? '')
  const [branch, setBranch] = useState(gitSync?.branch ?? 'main')
  const [authorName, setAuthorName] = useState(gitSync?.authorName ?? 'inkslate')
  const [authorEmail, setAuthorEmail] = useState(gitSync?.authorEmail ?? 'inkslate@local')
  const [username, setUsername] = useState(gitSync?.username ?? '')
  const [token, setToken] = useState('') // 不回显已存密码/token（安全）

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const isConfigured = !!(gitSync?.configured)
  const isInitialized = !!(gitSync?.initialized)

  const handleSave = async () => {
    if (!repoUrl.trim()) {
      setResult({ ok: false, message: '请填写仓库 URL' })
      return
    }
    if (!username.trim()) {
      setResult({ ok: false, message: '请填写用户名' })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      await window.inkslateApi.git.configure({
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || 'main',
        authorName: authorName.trim() || 'inkslate',
        authorEmail: authorEmail.trim() || 'inkslate@local',
        username: username.trim(),
        token: token // 空字符串表示不修改密码
      })
      setResult({ ok: true, message: '配置已保存' })
      // 重新加载 settings 让 UI 同步
      await useAppStore.getState().loadSettings()
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '保存失败' })
    } finally {
      setBusy(false)
    }
  }

  const handleInit = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await window.inkslateApi.git.init()
      setResult(r)
      if (r.ok) await useAppStore.getState().loadSettings()
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '初始化失败' })
    } finally {
      setBusy(false)
    }
  }

  const handleClone = async () => {
    if (!repoUrl.trim()) {
      setResult({ ok: false, message: '请先填写仓库 URL' })
      return
    }
    // 检查本地是否有真实数据（非默认空"我的笔记"）
    const { hasRealData } = await window.inkslateApi.git.cloneCheck()
    if (hasRealData) {
      const confirmed = confirm('克隆将用远端仓库覆盖本地所有数据，本地未同步的笔记将丢失。\n确定要继续吗？')
      if (!confirmed) return
    }
    setBusy(true)
    setResult(null)
    try {
      const r = await window.inkslateApi.git.clone(repoUrl.trim())
      setResult(r)
      if (r.ok) {
        await useAppStore.getState().loadSettings()
        // 刷新树状图：clone 后 DB 已被远端数据替换，需要重新加载笔记本和笔记
        await Promise.all([
          useAppStore.getState().loadNotebooks(),
          useAppStore.getState().loadNotes()
        ])
      }
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '克隆失败' })
    } finally {
      setBusy(false)
    }
  }

  const handleTestPush = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await window.inkslateApi.git.push(false)
      setResult(r)
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '推送测试失败' })
    } finally {
      setBusy(false)
    }
  }

  const handleInspectRemote = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await window.inkslateApi.git.inspectRemote()
      setResult({ ok: r.ok, message: r.message })
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? '检查失败' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            <GitBranch size={18} />
            Git 同步设置
          </h2>
          <button onClick={onClose} className="dialog-close"><X size={16} /></button>
        </div>

        <div className="dialog-body">
          {/* 状态提示 */}
          <div className={`dialog-status ${isInitialized ? 'dialog-status-success' : isConfigured ? 'dialog-status-info' : 'dialog-status-info'}`} style={{ marginBottom: 16 }}>
            {isInitialized ? '✓ 仓库已初始化，可同步' : isConfigured ? '⚠ 已配置但未初始化，请点击下方"初始化"或"克隆"' : '未配置'}
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">仓库 URL（HTTPS）</label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="dialog-input"
            />
            <div className="dialog-hint">
              支持任意 Git 托管（GitHub/Gitea/GitLab/Gitee 私有仓库）
            </div>
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">分支</label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="dialog-input"
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="dialog-field" style={{ flex: 1 }}>
              <label className="dialog-field-label">Author 名字</label>
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="inkslate"
                className="dialog-input"
              />
            </div>
            <div className="dialog-field" style={{ flex: 1 }}>
              <label className="dialog-field-label">Author 邮箱</label>
              <input
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                placeholder="inkslate@local"
                className="dialog-input"
              />
            </div>
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="登录账号（如 GitHub 用户名）"
              className="dialog-input"
            />
            <div className="dialog-hint">
              Git 仓库的登录账号，跟上面的 author 署名无关
            </div>
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">密码 / Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={isConfigured ? '已保存，留空则不修改' : '账号密码 或 Personal Access Token'}
              className="dialog-input"
            />
            <div className="dialog-hint">
              支持账号密码或 Token，用 safeStorage 加密存储在本地。GitHub 已禁用密码，请用 Token（Settings → Developer settings → Personal access tokens）
            </div>
          </div>

          {result && (
            <div className={`dialog-status ${result.ok ? 'dialog-status-success' : 'dialog-status-error'}`}>
              {result.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {result.message}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {/* 初始化/克隆按钮 */}
          {!isInitialized && (
            <>
              <button onClick={handleInit} disabled={busy} className="dialog-btn dialog-btn-secondary">
                <FolderPlus size={14} />
                {busy ? '...' : '初始化本地仓库'}
              </button>
              <button onClick={handleClone} disabled={busy} className="dialog-btn dialog-btn-secondary">
                <Download size={14} />
                {busy ? '...' : '从远端克隆'}
              </button>
            </>
          )}
          {isInitialized && (
            <>
              <button onClick={handleInspectRemote} disabled={busy} className="dialog-btn dialog-btn-secondary">
                <GitBranch size={14} />
                {busy ? '...' : '检查远端'}
              </button>
              <button onClick={handleTestPush} disabled={busy} className="dialog-btn dialog-btn-secondary">
                <RefreshCw size={14} className={busy ? 'spin' : ''} />
                {busy ? '...' : '测试推送'}
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">关闭</button>
          <button onClick={handleSave} disabled={busy || !repoUrl.trim()} className="dialog-btn dialog-btn-primary">
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            保存配置
          </button>
        </div>
      </div>
      <style>{dialogCss}</style>
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box'
}

const fieldHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  marginTop: 4,
  lineHeight: 1.5
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  border: '1px solid var(--border-color)'
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)'
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent-color)',
  borderColor: 'var(--accent-color)',
  color: '#fff'
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

// 内联 CSS 样式
const dialogCss = `
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99998;
    animation: fadeIn 0.15s ease;
  }
  .dialog-content {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
    width: 520px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    z-index: 99999;
    animation: slideUp 0.2s ease;
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
  }
  .dialog-title {
    font-size: 16;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8;
    margin: 0;
    color: var(--text-primary);
  }
  .dialog-close {
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
  .dialog-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .dialog-body {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
  }
  .dialog-footer {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border-color);
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .dialog-field {
    margin-bottom: 12px;
  }
  .dialog-field-label {
    font-size: 12;
    color: var(--text-secondary);
    margin-bottom: 4;
    display: block;
  }
  .dialog-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 13;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .dialog-input:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px var(--accent-bg);
  }
  .dialog-input::placeholder {
    color: var(--text-tertiary);
  }
  .dialog-hint {
    font-size: 11;
    color: var(--text-tertiary);
    margin-top: 4;
    line-height: 1.5;
  }
  .dialog-btn {
    display: inline-flex;
    align-items: center;
    gap: 6;
    padding: 8px 14px;
    font-size: 13;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--border-color);
    transition: all 0.15s ease;
  }
  .dialog-btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }
  .dialog-btn-secondary:hover {
    background: var(--bg-hover);
  }
  .dialog-btn-primary {
    background: var(--accent-color);
    border-color: var(--accent-color);
    color: #fff;
  }
  .dialog-btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .dialog-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .dialog-status {
    padding: 10px 14px;
    margin-top: 12px;
    border-radius: 6px;
    font-size: 13;
    display: flex;
    align-items: center;
    gap: 8;
  }
  .dialog-status-success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
  .dialog-status-error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  .dialog-status-info {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translate(-50%, -48%); }
    to { opacity: 1; transform: translate(-50%, -50%); }
  }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`
