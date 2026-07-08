import { useEffect, useMemo } from 'react'
import { List, X } from 'lucide-react'
import { extractHeadings, Heading } from '../utils/headings'

interface Props {
  /** Markdown 源文本 */
  source: string
  /** 滚动容器（一般是 .preview div）的 ref，用于 scroll-spy 和点击定位 */
  containerRef: React.RefObject<HTMLElement>
  /** 是否展开（状态由父组件管） */
  open: boolean
  /** 切换展开/折叠的回调 */
  onToggle: () => void
}

export function TableOfContents({ source, containerRef, open, onToggle }: Props) {
  const headings: Heading[] = useMemo(() => extractHeadings(source), [source])

  // 归一化层级：把文档里最小的标题层级当顶层，避免文档从 h3 开始时缩进太深
  const minLevel = useMemo(() => {
    if (headings.length === 0) return 1
    return Math.min(...headings.map(h => h.level))
  }, [headings])

  // Scroll-spy：用 IntersectionObserver 跟踪当前在视口里"最靠上"的标题
  useEffect(() => {
    const container = containerRef.current
    if (!container || headings.length === 0) return

    const targets: HTMLElement[] = []
    for (const h of headings) {
      const el = container.querySelector(`#${CSS.escape(h.id)}`) as HTMLElement | null
      if (el) targets.push(el)
    }
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // 优先取"在视口里且最靠上"的那个
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          // 用 data-active 写在 DOM 上（避免 React 状态更新导致重渲染影响观察器）
          for (const e of entries) e.target.classList.remove('toc-active')
          visible[0].target.classList.add('toc-active')
        }
      },
      {
        root: container,
        // 标题进入视口顶部 30% 才算"激活"，避免还没滚到位就高亮
        rootMargin: '0px 0px -70% 0px',
        threshold: 0
      }
    )
    targets.forEach(t => observer.observe(t))
    return () => observer.disconnect()
  }, [headings, containerRef])

  // 没有任何标题就不渲染
  if (headings.length === 0) return null

  const handleClick = (id: string) => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
    if (!el) return
    // 把 heading 滚到容器顶部偏下 12px 处
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const offset = elRect.top - containerRect.top + container.scrollTop - 12
    container.scrollTo({ top: offset, behavior: 'smooth' })
  }

  return (
    <nav
      className={'toc' + (open ? ' toc-open' : ' toc-collapsed')}
      aria-label="目录"
    >
      {open ? (
        <>
          <div className="toc-header">
            <List size={14} />
            <span className="toc-title">目录</span>
            <span className="toc-count">{headings.length}</span>
            <button
              className="toc-close"
              onClick={onToggle}
              title="收起目录"
              aria-label="收起目录"
            >
              <X size={12} />
            </button>
          </div>
          <ul className="toc-list">
            {headings.map((h, i) => {
              const indent = h.level - minLevel
              return (
                <li
                  key={`${h.id}-${i}`}
                  className={'toc-item toc-lv' + h.level}
                  data-toc-id={h.id}
                  style={{ ['--toc-indent' as any]: indent }}
                  onClick={() => handleClick(h.id)}
                  title={h.text}
                >
                  <span className="toc-item-text">{h.text}</span>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <button
          className="toc-fab"
          onClick={onToggle}
          title="展开目录"
          aria-label="展开目录"
        >
          <List size={16} />
        </button>
      )}
    </nav>
  )
}
