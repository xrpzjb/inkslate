import { useState } from 'react'
import { useAppStore } from '../store/app'
import { X, Save, TestTube2, Loader2, CheckCircle2, AlertCircle, HardDrive } from 'lucide-react'

export function OssSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)

  const [provider, setProvider] = useState<'aliyun' | 'tencent' | 'aws' | 'minio'>(
    settings?.oss.provider ?? 'aliyun'
  )
  const [endpoint, setEndpoint] = useState(settings?.oss.endpoint ?? '')
  const [bucket, setBucket] = useState(settings?.oss.bucket ?? '')
  const [region, setRegion] = useState(settings?.oss.region ?? '')
  const [accessKeyId, setAccessKeyId] = useState(settings?.oss.accessKeyId ?? '')
  const [accessKeySecret, setAccessKeySecret] = useState('')
  const [prefix, setPrefix] = useState(settings?.oss.prefix ?? 'mdtext')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // 先临时保存以触发 configure
      await window.inkslateApi.oss.configure({
        provider,
        endpoint,
        bucket,
        region,
        accessKeyId,
        encryptedSecret: accessKeySecret, // 主进程会用 safeStorage 加密
        prefix,
        configured: true
      })
      const result = await window.inkslateApi.oss.test()
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message ?? '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings({
        oss: {
          provider,
          endpoint,
          bucket,
          region,
          accessKeyId,
          encryptedSecret: accessKeySecret,
          prefix,
          configured: true
        }
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">
            <HardDrive size={18} />
            OSS 存储设置
          </h2>
          <button onClick={onClose} className="dialog-close"><X size={16} /></button>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label className="dialog-field-label">存储厂商</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              className="dialog-input"
            >
              <option value="aliyun">阿里云 OSS</option>
              <option value="tencent">腾讯云 COS</option>
              <option value="aws">AWS S3</option>
              <option value="minio">MinIO</option>
            </select>
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">Endpoint</label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={provider === 'aliyun' ? 'oss-cn-hangzhou.aliyuncs.com' : ''}
              className="dialog-input"
            />
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">Bucket 名称</label>
            <input
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-notes-bucket"
              className="dialog-input"
            />
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">区域 (Region)</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="oss-cn-hangzhou"
              className="dialog-input"
            />
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">AccessKey ID</label>
            <input
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              placeholder="LTAI..."
              className="dialog-input"
            />
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">AccessKey Secret</label>
            <input
              type="password"
              value={accessKeySecret}
              onChange={(e) => setAccessKeySecret(e.target.value)}
              placeholder="••••••••"
              className="dialog-input"
            />
            <div className="dialog-hint">
              密钥会用 Electron safeStorage 加密后存储在本地
            </div>
          </div>

          <div className="dialog-field">
            <label className="dialog-field-label">路径前缀</label>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="mdtext"
              className="dialog-input"
            />
            <div className="dialog-hint">
              所有文件会上传到 {prefix || 'mdtext'}/ 目录下
            </div>
          </div>

          {testResult && (
            <div className={`dialog-status ${testResult.ok ? 'dialog-status-success' : 'dialog-status-error'}`}>
              {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {testResult.message}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button
            onClick={handleTest}
            disabled={testing || !accessKeyId || !accessKeySecret}
            className="dialog-btn dialog-btn-secondary"
          >
            {testing ? <Loader2 size={14} className="spin" /> : <TestTube2 size={14} />}
            测试连接
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="dialog-btn dialog-btn-secondary">取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="dialog-btn dialog-btn-primary"
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            保存
          </button>
        </div>
      </div>
      <style>{`
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
          width: 480px;
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
          gap: 10px;
        }
        .dialog-field {
          margin-bottom: 14px;
        }
        .dialog-field-label {
          font-size: 12;
          font-weight: 500;
          margin-bottom: 6px;
          color: var(--text-secondary);
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
        .dialog-btn-secondary:hover:not(:disabled) {
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
      `}</style>
    </>
  )
}
