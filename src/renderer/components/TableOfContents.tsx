import { useEffect, useMemo, useState } from 'react'
import { List } from 'lucide-react'
import { extractHeadings, Heading } from '../utils/headings'

interface Props {
  /** Markdown 源文本 */
  source: string
  /** 滚动容器（一般是 .preview div）的 ref，用于 scroll-spy 和点击定位 */
  containerRef: React.RefObject<HTMLElement>
}

export function TableOfContents({ source, containerRef }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

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
          setActiveId(visible[0].target.id)
          return
        }
        // 视口里没有标题：取"刚滚出去"那个（即 top < 0 中位置最大的）
        const above = entries
          .filter(e => !e.isIntersecting && e.boundingClientRect.top < 0)
          .sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top)
        if (above.length > 0) {
          setActiveId(above[0].target.id)
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
    setActiveId(id)
  }

  return (
    <nav
      className={'toc' + (collapsed ? ' toc-collapsed' : '')}
      aria-label="目录"
    >
      <div
        className="toc-header"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? '展开目录' : '折叠目录'}
      >
        <List size={14} />
        {!collapsed && <span className="toc-title">目录</span>}
        {!collapsed && <span className="toc-count">{headings.length}</span>}
      </div>
      {!collapsed && (
        <ul className="toc-list">
          {headings.map((h, i) => {
            const indent = h.level - minLevel
            return (
              <li
                key={`${h.id}-${i}`}
                className={'toc-item toc-lv' + h.level + (activeId === h.id ? ' active' : '')}
                style={{ paddingLeft: 10 + indent * 12 }}
                onClick={() => handleClick(h.id)}
                title={h.text}
              >
                <span className="toc-item-text">{h.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
