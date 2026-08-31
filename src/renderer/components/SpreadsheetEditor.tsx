import { useEffect, useRef } from 'react'
// x-data-spreadsheet 主入口是 ESM，自带 less（Vite + less 编译）
import Spreadsheet from 'x-data-spreadsheet'
import zhCN from 'x-data-spreadsheet/src/locale/zh-cn'
import { SpreadsheetData } from '@shared/types'

// 启用中文界面（右键菜单 / 工具栏 / 弹窗等）
try { Spreadsheet.locale('zh-cn', zhCN) } catch {}

/** 生成一个空的默认表格数据（1 个工作表，带一个表头示例） */
export function createEmptySpreadsheetData(title: string): SpreadsheetData {
  return [
    {
      name: 'Sheet1',
      styles: [{ bgcolor: '#f2f2f2' }],
      rows: {
        0: {
          cells: {
            0: { text: '项目', style: 0 },
            1: { text: '数值', style: 0 },
            2: { text: '备注', style: 0 }
          }
        },
        1: { cells: { 0: { text: '' }, 1: { text: '' }, 2: { text: '' } } },
        2: { cells: { 0: { text: '' }, 1: { text: '' }, 2: { text: '' } } }
      },
      cols: { 0: { width: 120 }, 1: { width: 120 }, 2: { width: 200 } }
    }
  ]
}

export function SpreadsheetEditor({
  noteId,
  value,
  onChange
}: {
  noteId: string
  value: string
  onChange: (json: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<Spreadsheet | null>(null)
  const onChangeRef = useRef(onChange)
  const initializedRef = useRef(false)
  // 标记某次 value 变化是否由本组件自身的编辑触发（避免 reload 把刚输入的内容冲掉）
  const internalChangeRef = useRef(false)

  onChangeRef.current = onChange

  // 解析 content 为可加载的数据（兼容单对象 / 数组两种格式）
  const parseData = (raw: string): SpreadsheetData | null => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as SpreadsheetData
      if (parsed && typeof parsed === 'object') return [parsed] as SpreadsheetData
    } catch {}
    return null
  }

  // 初始化表格实例（仅在挂载时创建一次）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const data = parseData(value) ?? createEmptySpreadsheetData('')
    const sheet = new Spreadsheet(container, {
      mode: 'edit',
      showToolbar: true,
      showGrid: true,
      showContextmenu: true,
      showBottomBar: true,
      view: {
        height: () => container.clientHeight,
        width: () => container.clientWidth
      }
    })
    sheet.loadData(data)
    // 通过 change 回调把最新数据写回 content
    sheet.change((json: any) => {
      internalChangeRef.current = true
      onChangeRef.current(JSON.stringify(json))
    })
    sheetRef.current = sheet
    initializedRef.current = true

    return () => {
      // x-data-spreadsheet 无官方销毁 API，清空 DOM 防止重复挂载
      if (sheetRef.current) {
        try { (sheetRef.current as any).destroy?.() } catch {}
      }
      sheetRef.current = null
      initializedRef.current = false
      internalChangeRef.current = false
      container.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // 外部内容变化（切笔记 / 回滚 / 恢复草稿）时重新加载。
  // 本组件自身编辑触发的 value 变化一律跳过，防止 loadData 重置网格丢失输入。
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet || !initializedRef.current) return
    if (internalChangeRef.current) {
      internalChangeRef.current = false
      return
    }
    const incoming = parseData(value)
    if (incoming) sheet.loadData(incoming)
  }, [value, noteId])

  return (
    <div className="spreadsheet-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, background: '#fff' }} />
    </div>
  )
}