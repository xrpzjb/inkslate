import { useEffect } from 'react'
import { confirm } from './ConfirmDialog'

/**
 * SSH 写操作确认管理器
 * 主进程在执行 AI 的「写入远程文件」前会推送确认请求，
 * 这里弹出确认框，用户选择后把结果回传给主进程。
 * 挂在 App 根组件下。
 */
export function SshConfirmManager() {
  useEffect(() => {
    // 防御：preload 尚未更新（旧窗口未重启）时 window.inkslateApi.ssh 可能不存在，
    // 直接访问会抛错导致整页白屏
    const sshApi = (window as any).inkslateApi?.ssh
    if (!sshApi?.onConfirmRequest) return
    const off = sshApi.onConfirmRequest(async (req: any) => {
      const { id, action, path, detail, host } = req as any
      const parts = [
        host ? `服务器：${host}` : '',
        `操作：${action || '写入远程文件'}`,
        `路径：${path}`,
        detail ? `\n内容预览：\n${detail}` : ''
      ].filter(Boolean)

      let ok = false
      try {
        ok = await confirm({
          title: 'AI 请求写入远程文件',
          message: parts.join('\n'),
          confirmText: '允许写入',
          cancelText: '拒绝',
          danger: true
        })
      } catch {
        ok = false
      }
      sshApi.respondConfirm(id, ok)
    })
    return () => off()
  }, [])

  return null
}
