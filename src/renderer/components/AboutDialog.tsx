import { X, Info, Github, Heart } from 'lucide-react'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  // 版本号：开发期写死，生产期从 window.inkslateApi 拿
  const version = (window as any).inkslateApi?.appVersion ?? 'dev'

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div
        className="shortcuts-dialog about-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">
            <Info size={18} />
            关于 墨与石板
          </h2>
          <button onClick={onClose} className="shortcuts-close"><X size={16} /></button>
        </div>
        <div className="shortcuts-body" style={{ paddingTop: 8 }}>
          <div className="about-hero">
            <div className="about-logo">墨</div>
            <div className="about-name">墨与石板</div>
            <div className="about-tagline">支持 HTML 渲染的 Markdown 桌面笔记</div>
          </div>

          <div className="about-info">
            <div className="about-row">
              <span className="about-label">版本</span>
              <span className="about-value">v{version}</span>
            </div>
            <div className="about-row">
              <span className="about-label">作者</span>
              <span className="about-value">heimin</span>
            </div>
            <div className="about-row">
              <span className="about-label">框架</span>
              <span className="about-value">Electron + React + CodeMirror 6</span>
            </div>
          </div>

          <div className="about-note">
            <Heart size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4, color: 'var(--accent-color)' }} />
            本项目全程使用 <strong>minimax m3</strong> 开发
          </div>
        </div>
        <div className="shortcuts-footer">
          <Github size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          作者：heimin · 用 AI 协作开发
        </div>
      </div>
      <style>{`
        .about-hero { text-align: center; padding: 8px 0 18px; }
        .about-logo {
          width: 64px; height: 64px; margin: 0 auto 12px;
          background: var(--accent-bg);
          color: var(--accent-color);
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 32px; font-weight: 600;
          font-family: var(--font-family);
        }
        .about-name {
          font-size: 20px; font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .about-tagline {
          font-size: 13px; color: var(--text-secondary);
        }
        .about-info {
          display: flex; flex-direction: column; gap: 8px;
          padding: 12px 14px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 14px;
        }
        .about-row {
          display: flex; justify-content: space-between;
          font-size: 13px;
        }
        .about-label { color: var(--text-tertiary); }
        .about-value { color: var(--text-primary); font-weight: 500; }
        .about-note {
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary);
          padding: 4px 0;
        }
      `}</style>
    </div>
  )
}
