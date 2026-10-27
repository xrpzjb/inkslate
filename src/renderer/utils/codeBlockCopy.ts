/**
 * Markdown 预览里代码块右上角的「复制」按钮。
 *
 * 为什么用命令式 DOM 而不是写进 markdown 产物里：
 *   预览 HTML 会经过 DOMPurify 清洗（白名单标签/属性），塞进去的 <button> 会被
 *   直接丢掉；改白名单等于为了一个按钮放宽安全策略。所以改成渲染完成后给每个
 *   代码块补一个按钮，点击时读取代码块自身的文本。
 *
 * 结构：把 <pre> 包进 .md-code-wrap（position: relative），按钮挂在外层，
 * 这样 <pre> 自身横向滚动时按钮不会跟着跑。
 */
import { copyText } from './clipboard'
import { toast } from '../components/Toast'

const COPY_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`

const CHECK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`

/**
 * 给 root 里所有代码块补上复制按钮。
 * 返回清理函数，会在预览内容重渲染前把 DOM 结构还原（React 之后会整体替换
 * innerHTML，还原只是防御性处理，避免留下被包裹的游离节点）。
 */
export function decorateCodeBlocks(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = []
  const blocks = Array.from(root.querySelectorAll('pre')) as HTMLPreElement[]

  for (const pre of blocks) {
    // mermaid 图表不是代码块，不挂复制（它后面会被替换成渲染结果）
    if (pre.classList.contains('mermaid')) continue
    if (pre.closest('.mermaid-rendered, .mermaid-error')) continue

    const parent = pre.parentElement
    if (!parent) continue
    // 已经装饰过（effect 因非 html 依赖重跑时不要重复包裹）
    if (parent.classList.contains('md-code-wrap')) continue

    const wrap = document.createElement('div')
    wrap.className = 'md-code-wrap'
    parent.insertBefore(wrap, pre)
    wrap.appendChild(pre)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'md-code-copy'
    btn.title = '复制代码'
    btn.setAttribute('aria-label', '复制代码')
    btn.innerHTML = COPY_ICON

    let timer: number | undefined
    const onClick = async (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // 复制纯文本：hljs 只加 <span>，textContent 就是原始代码
      const codeEl = pre.querySelector('code') as HTMLElement | null
      const text = (codeEl ?? pre).textContent ?? ''

      const ok = await copyText(text)
      if (!ok) {
        toast.error('复制失败，请手动选中代码复制')
        return
      }

      btn.classList.add('md-code-copy-done')
      btn.innerHTML = CHECK_ICON
      btn.title = '已复制'
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        btn.classList.remove('md-code-copy-done')
        btn.innerHTML = COPY_ICON
        btn.title = '复制代码'
      }, 1500)
    }
    btn.addEventListener('click', onClick)
    wrap.appendChild(btn)

    cleanups.push(() => {
      if (timer) window.clearTimeout(timer)
      btn.removeEventListener('click', onClick)
      btn.remove()
      // 还原 <pre>：包装层可能已随 innerHTML 一起被丢弃，这里做防御性判断
      if (wrap.parentElement) {
        wrap.parentElement.insertBefore(pre, wrap)
        wrap.remove()
      }
    })
  }

  return () => cleanups.forEach(fn => fn())
}
