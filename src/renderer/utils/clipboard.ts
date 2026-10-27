/**
 * 剪贴板写入工具。
 *
 * Electron 渲染进程里 navigator.clipboard 在部分场景（窗口未聚焦、权限策略、
 * 非安全上下文）会抛异常，所以这里再补一个 execCommand('copy') 的兜底方案。
 * 调用方拿返回值决定是否提示成功，避免"复制成功"提示与实际不符。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下面的兜底方案
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // 放到视口外，避免闪一下；同时保持可选中
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;'
    document.body.appendChild(ta)
    ta.focus({ preventScroll: true })
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
