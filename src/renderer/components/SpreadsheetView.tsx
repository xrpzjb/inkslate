import { useEffect, useRef } from 'react'
import 'x-data-spreadsheet'
import 'x-data-spreadsheet/dist/xspreadsheet.css'
import { useAppStore } from '../store/app'

type XSpreadsheetInstance = {
  loadData: (json: Record<string, unknown> | Record<string, unknown>[]) => void
  getData: () => Record<string, unknown>[]
  change: (cb: (json: Record<string, unknown>) => void) => void
  reRender: () => void
}

/** 智能表格预览：用 x-data-spreadsheet 渲染网格，支持直接编辑并自动保存。
 *  每个 noteId 只初始化一次；content 变化不重载，避免编辑中数据被覆盖。
 *  dist 产物是纯 IIFE（只注册 window.x_spreadsheet），靠上面的副作用 import 引入。 */
export function SpreadsheetView({ noteId, content }: { noteId: string; content: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<XSpreadsheetInstance | null>(null)
  const saveTimerRef = useRef<number>(0)
  const updateNote = useAppStore(s => s.updateNote)

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof window.x_spreadsheet !== 'function') return

    let parsed: Record<string, unknown> | Record<string, unknown>[] | null = null
    try {
      const json = content ? JSON.parse(content) : null
      if (json && typeof json === 'object') parsed = json
    } catch {}

    const xspreadsheet = window.x_spreadsheet(container, {
      mode: 'edit',
      showToolbar: true,
      showGrid: true,
      showContextmenu: true,
      showBottomBar: true,
      view: {
        height: () => container.clientHeight || 600,
        width: () => container.clientWidth || 900
      }
    }) as unknown as XSpreadsheetInstance

    if (parsed) {
      try { xspreadsheet.loadData(parsed) } catch (e) { console.error('[sheet] loadData failed:', e) }
    }

    xspreadsheet.change(() => {
      // 防抖保存：getData() 返回 sheet 数组；单 sheet 按既有 .sheet.json 的格式存单对象
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(async () => {
        const data = xspreadsheet.getData()
        const toSave = Array.isArray(data) && data.length === 1 ? data[0] : data
        try {
          await updateNote(noteId, { content: JSON.stringify(toSave) })
        } catch (e) {
          console.error('[sheet] save failed:', e)
        }
      }, 800)
    })

    instanceRef.current = xspreadsheet

    // 面板拖动 / 窗口缩放时重绘
    const ro = new ResizeObserver(() => {
      try { xspreadsheet.reRender() } catch {}
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      window.clearTimeout(saveTimerRef.current)
      instanceRef.current = null
      container.innerHTML = ''
    }
  }, [noteId])

  return (
    <div className="spreadsheet-view" style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}