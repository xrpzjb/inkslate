import { useState } from 'react'
import { useAppStore } from '../store/app'
import { X, Save, TestTube2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

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
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 99998
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-primary)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          width: 480,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 99999
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>OSS 存储设置</h2>
          <button onClick={onClose} className="panel-action-btn"><X size={16} /></button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <Field label="存储厂商">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              style={{ width: '100%', padding: '6px 10px' }}
            >
              <option value="aliyun">阿里云 OSS</option>
              <option value="tencent">腾讯云 COS</option>
              <option value="aws">AWS S3</option>
              <option value="minio">MinIO</option>
            </select>
          </Field>

          <Field label="Endpoint">
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={provider === 'aliyun' ? 'oss-cn-hangzhou.aliyuncs.com' : ''}
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="Bucket 名称">
            <input
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-notes-bucket"
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="区域 (Region)">
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="oss-cn-hangzhou"
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="AccessKey ID">
            <input
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              placeholder="LTAI..."
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="AccessKey Secret">
            <input
              type="password"
              value={accessKeySecret}
              onChange={(e) => setAccessKeySecret(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              密钥会用 Electron safeStorage 加密后存储在本地
            </div>
          </Field>

          <Field label="路径前缀">
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="mdtext"
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              所有文件会上传到 {prefix || 'mdtext'}/ 目录下
            </div>
          </Field>

          {testResult && (
            <div style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 4,
              background: testResult.ok ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
              color: testResult.ok ? '#4caf50' : '#f44336',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {testResult.message}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '12px 20px',
          borderTop: '1px solid var(--border-color)'
        }}>
          <button
            onClick={handleTest}
            disabled={testing || !accessKeyId || !accessKeySecret}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid var(--border-color)',
              background: 'transparent',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {testing ? <Loader2 size={14} className="spin" /> : <TestTube2 size={14} />}
            测试连接
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              background: 'var(--accent-color)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            保存
          </button>
        </div>

        <style>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block',
        fontSize: 12,
        fontWeight: 500,
        marginBottom: 4,
        color: 'var(--text-secondary)'
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
