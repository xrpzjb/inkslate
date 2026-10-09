import { useEffect, type RefObject } from 'react'

/**
 * 自动隐藏滚动条（配 global.css 里的 .auto-hide-scrollbar 使用）。
 *
 * 规则：
 *  - 默认隐藏：thumb 一直透明，但滚动条槽位宽度保留（内容不会因为出现/消失而左右跳）
 *  - 鼠标移入容器（"放过去"）→ 显示
 *  - 滚动中（滚轮 / 拖动条 / 键盘 / 程序滚动）→ 显示；停止滚动 idleMs 后隐藏
 *  - 鼠标移到右侧滚动条槽位 → 保持显示（方便看懂/拖拽）
 *  - 在内容上按下鼠标（框选文字、拖动节点排序）→ 立即隐藏，避免压住正在选的东西
 *  - 鼠标移出容器 → 隐藏
 *
 * 显隐由 JS 打 class 控制，而不是纯 CSS :hover —— 因为"停止滚动就隐藏"和
 * "鼠标还在容器里"会冲突：纯 :hover 规则会让滚动条一直挂着不消失。
 */
export function useAutoHideScrollbar<T extends HTMLElement>(
  ref: RefObject<T | null>,
  idleMs = 900
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let idleTimer: number | null = null

    const show = () => el.classList.add('is-scrollbar-visible')
    const hide = () => el.classList.remove('is-scrollbar-visible')
    const cancelIdle = () => {
      if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null }
    }
    const scheduleIdleHide = () => {
      cancelIdle()
      idleTimer = window.setTimeout(() => { idleTimer = null; hide() }, idleMs)
    }
    /** 指针是否落在右侧那条滚动条槽位里（clientWidth 不含滚动条宽度） */
    const onGutter = (clientX: number) => {
      const rect = el.getBoundingClientRect()
      return clientX - rect.left >= el.clientWidth
    }

    const onScroll = () => { show(); scheduleIdleHide() }
    const onMouseEnter = () => { cancelIdle(); show() }
    const onMouseLeave = () => { cancelIdle(); hide() }
    const onMouseMove = (e: MouseEvent) => {
      if (onGutter(e.clientX)) { cancelIdle(); show() }
    }
    const onMouseDown = (e: MouseEvent) => {
      cancelIdle()
      // 按在内容上（不是滚动条槽位）= 框选 / 拖动节点 → 先藏起来
      if (!onGutter(e.clientX)) hide()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mousedown', onMouseDown)

    return () => {
      cancelIdle()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mousedown', onMouseDown)
      el.classList.remove('is-scrollbar-visible')
    }
  }, [ref, idleMs])
}
