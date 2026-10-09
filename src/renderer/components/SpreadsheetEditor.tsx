import { useEffect, useRef, useState } from 'react'
// x-data-spreadsheet 主入口是 ESM，自带 less（Vite + less 编译）
import Spreadsheet from 'x-data-spreadsheet'
import zhCN from 'x-data-spreadsheet/src/locale/zh-cn'
import { SpreadsheetData } from '@shared/types'
import { useAppStore } from '../store/app'
import { installCrossSheetClipboardFix } from '../utils/spreadsheetClipboard'
import '../styles/spreadsheet.css'

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

/** 把表格数据转成 Markdown 表格文本（供 AI 写作的上下文，AI 更容易理解） */
export function spreadsheetToMarkdown(data: SpreadsheetData | Record<string, any> | null | undefined): string {
  const arr = Array.isArray(data) ? data : data ? [data] : []
  const sheet = arr[0]
  if (!sheet || !sheet.rows) return '(空表格)'
  const rowKeys = Object.keys(sheet.rows).filter(k => k !== 'len').sort((a, b) => Number(a) - Number(b))
  let maxCol = -1
  for (const rk of rowKeys) {
    const cells = sheet.rows[rk]?.cells
    if (cells) {
      const cis = Object.keys(cells).map(Number)
      if (cis.length) maxCol = Math.max(maxCol, ...cis)
    }
  }
  const lines: string[] = []
  const shown = rowKeys.slice(0, 50)
  for (const rk of shown) {
    const cells = sheet.rows[rk]?.cells || {}
    const rowArr: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const cell = cells[c]
      rowArr.push(cell?.text != null ? String(cell.text).replace(/\|/g, '\\|').replace(/\n/g, ' ') : '')
    }
    lines.push('| ' + rowArr.join(' | ') + ' |')
  }
  if (rowKeys.length > 50) lines.push(`（... 表格共 ${rowKeys.length} 行，仅展示前 50 行）`)
  return lines.join('\n') || '(空表格)'
}

/** 把 AI 返回的 Markdown 表格 / JSON 数组 转成 x-data-spreadsheet 数据 */
export function markdownToSpreadsheetData(md: string, sheetName = 'Sheet1'): SpreadsheetData {
  const buildSheet = (rows: string[][]): SpreadsheetData => {
    const data: SpreadsheetData = [{ name: sheetName, styles: [], merges: [], rows: {}, cols: {} }]
    rows.forEach((row, ri) => {
      data[0]!.rows![ri] = { cells: {} }
      row.forEach((text, ci) => {
        data[0]!.rows![ri]!.cells![ci] = { text }
      })
    })
    return data
  }
  const jsonToRows = (parsed: any): string[][] => {
    const rows: string[][] = []
    const src = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of src) {
      if (Array.isArray(item)) {
        rows.push(item.map(v => v != null ? String(v) : ''))
      } else if (item && typeof item === 'object') {
        rows.push(Object.values(item).map(v => v != null ? String(v) : ''))
      } else {
        rows.push([item != null ? String(item) : ''])
      }
    }
    return rows
  }
  // 1) 尝试 JSON（AI 可能返回 JSON 数组）
  try {
    const parsed = JSON.parse(md)
    if (parsed && typeof parsed === 'object') {
      // 已是完整 sheet 格式（含 rows/name）则原样使用
      if (!Array.isArray(parsed) && (parsed.rows || parsed.name)) {
        return [parsed] as SpreadsheetData
      }
      return buildSheet(jsonToRows(parsed))
    }
  } catch {}
  // 2) 按 Markdown 表格解析
  const lines = md.split('\n').map(l => l.trim()).filter(l => l && l.startsWith('|'))
  const rows: string[][] = []
  for (const line of lines) {
    const inner = line.replace(/^\|/, '').replace(/\|$/, '')
    const cells = inner.split('|').map(c => c.trim().replace(/\\\|/g, '|'))
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue
    rows.push(cells)
  }
  if (rows.length === 0) throw new Error('未能从 AI 输出解析出表格数据')
  return buildSheet(rows)
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
  // loadData 内部会逐张调用 addSheet / 逐个 setData，此时不能当作"用户新增/重命名 sheet"触发保存
  const loadingRef = useRef(false)
  // 上次已发射给父级的全量 JSON，避免"数据没变也发射"把 internalChangeRef 卡住（如删除最后一个 sheet 失败）
  const lastEmittedRef = useRef('')
  // 首次加载时的非空行数（防误覆盖：初始有数据时，突然全空视为异常，禁止写盘）
  const initialRowsRef = useRef(0)

  // ===== 跟随应用主题 =====
  const theme = useAppStore(s => s.theme)
  // 「暗黑编辑器」是独立于应用主题的开关（Editor.tsx 里靠 [data-editor-dark] 覆盖 CSS 变量
  // 把编辑区变暗）。智能表格必须把它也算作暗色，否则表格会保持浅色外壳 / 浅色画布，
  // 和周围的深色编辑区割裂，文字还会因为变量只被改了一半而看不清。
  const editorDark = useAppStore(s => s.settings?.editorDark === true)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // 有效明暗：暗黑编辑器 / 显式暗色主题 + auto 跟随系统
  const isDark =
    editorDark || theme === 'dark' || theme === 'dracula' || theme === 'forest' || (theme === 'auto' && systemDark)
  // 读取当前主题的 CSS 变量（各主题都会注入 --bg-primary / --text-primary 等）。
  // 必须读"表格所在容器"而不是 <html>：暗黑编辑器模式是在编辑区容器上覆盖变量实现的，
  // 读 <html> 会拿到亮色主题的值，画布就会是浅色而外围是深色。
  const readThemeColor = (name: string, fallback: string): string => {
    if (typeof document === 'undefined') return fallback
    const scope = (containerRef.current ?? document.querySelector('.spreadsheet-view')) as HTMLElement | null
    const el = scope ?? document.documentElement
    return getComputedStyle(el).getPropertyValue(name).trim() || fallback
  }

  onChangeRef.current = onChange

  // 统计数据的非空行数（排除 len 这类结构字段）
  const countDataRows = (data: SpreadsheetData | Record<string, any>): number => {
    const arr = Array.isArray(data) ? data : [data]
    return arr.reduce((sum, s) => {
      if (!s || !s.rows) return sum
      return sum + Object.keys(s.rows).filter(k => k !== 'len').length
    }, 0)
  }

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

    lastEmittedRef.current = ''

    const data = parseData(value) ?? createEmptySpreadsheetData('')
    initialRowsRef.current = countDataRows(data)
    const sheet = new Spreadsheet(container, {
      mode: 'edit',
      showToolbar: true,
      showGrid: true,
      showContextmenu: true,
      showBottomBar: true,
      view: {
        height: () => container.clientHeight,
        width: () => container.clientWidth
      },
      // 默认单元格样式跟随主题（底色/文字色），表头与网格线颜色由
      // scripts/patch-xspreadsheet.js 补丁在渲染时读取同一批 CSS 变量
      style: {
        bgcolor: readThemeColor('--bg-primary', '#ffffff'),
        color: readThemeColor('--text-primary', '#111827'),
        align: 'left',
        valign: 'middle',
        textwrap: false,
        strike: false,
        underline: false,
        font: { name: 'Helvetica', size: 12, bold: false, italic: false }
      }
    })
    // 全量序列化当前所有 sheet 写回 content。
    // 注意：库的 change 回调参数只带"当前激活 sheet"的数据（单对象），
    // 直接序列化它会丢掉其他 sheet；这里统一用 getData() 拿全量数组。
    // source: 'edit' = 单元格编辑（change）；'structural' = 新增/删除/重命名 sheet。
    const emitFullData = (source: 'edit' | 'structural' = 'edit') => {
      const current = sheet.getData()
      const json = JSON.stringify(current)
      if (lastEmittedRef.current === json) return
      // 防误覆盖：初始加载有数据时，若一次"结构操作"（新增/删除/重命名 sheet）后
      // 变成没有任何单元格数据的全空表，视为异常状态，阻止发射/保存，
      // 避免把已有表格内容覆盖成空。单元格编辑（edit）不拦截，用户可正常清空。
      if (source === 'structural' && initialRowsRef.current > 0 && countDataRows(current) === 0) {
        console.error('[spreadsheet] 阻止保存空表格：结构操作后全部单元格数据消失（初始 ' + initialRowsRef.current + ' 行），放弃本次写盘。', json.slice(0, 120))
        return
      }
      lastEmittedRef.current = json
      internalChangeRef.current = true
      onChangeRef.current(json)
    }

    // 捕获"新增 / 删除 / 重命名 sheet"：库的 bottombar 直接调 addSheet()/deleteSheet()
    // 并直接改 datas[i].name，这些操作都不触发 change 事件，导致新增的 sheet 没进 content，
    // 切走再切回来就丢了。这里包一层方法感知这些操作并保存全量数据。
    const sheetAny = sheet as any

    // 底部工作表标签拖拽排序（库只提供 新增/删除/重命名/切换，没有排序）。
    // 顺序同时存在于三处：sheet.datas（决定 getData() 与切换时的索引）、
    // bottombar.items、bottombar.dataNames + 标签 DOM，这里一起维护保持一致。
    const bb: any = sheetAny.bottombar
    let dragFrom = -1
    const clearDropMarks = () => {
      if (!bb) return
      bb.items.forEach((it: any) => { if (it.el) it.el.classList.remove('sheet-drag-over') })
    }
    const moveSheet = (from: number, to: number) => {
      if (!bb || from < 0 || to < 0 || from === to) return
      const datas = sheetAny.datas as any[]
      const items = bb.items as any[]
      const names = bb.dataNames as string[]
      if (from >= datas.length || to >= datas.length) return
      const [d] = datas.splice(from, 1); datas.splice(to, 0, d)
      const [it] = items.splice(from, 1); items.splice(to, 0, it)
      const [nm] = names.splice(from, 1); names.splice(to, 0, nm)
      // 按新顺序重排标签 DOM（appendChild 会把节点移到末尾，循环一遍即完成重排）
      items.forEach((x: any) => bb.menuEl.el.appendChild(x.el))
      bb.moreEl.reset(names)
      emitFullData('structural')
    }
    const wireSheetDrag = (item: any) => {
      if (!bb || !item || !item.el) return
      const el = item.el as HTMLElement
      if (el.dataset.sheetDragWired) return
      el.dataset.sheetDragWired = '1'
      el.draggable = true
      el.style.cursor = 'grab'
      el.title = '拖拽调整工作表顺序'
      el.addEventListener('dragstart', (e: DragEvent) => {
        dragFrom = bb.items.indexOf(item)
        el.style.opacity = '0.5'
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          try { e.dataTransfer.setData('text/plain', String(dragFrom)) } catch {}
        }
      })
      el.addEventListener('dragend', () => {
        el.style.opacity = ''
        clearDropMarks()
        dragFrom = -1
      })
      el.addEventListener('dragover', (e: DragEvent) => {
        if (dragFrom < 0) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        clearDropMarks()
        el.classList.add('sheet-drag-over')
      })
      el.addEventListener('dragleave', () => el.classList.remove('sheet-drag-over'))
      el.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault()
        const to = bb.items.indexOf(item)
        el.classList.remove('sheet-drag-over')
        moveSheet(dragFrom, to)
        dragFrom = -1
      })
    }

    const origAddSheet = sheetAny.addSheet.bind(sheet)
    sheetAny.addSheet = (name?: string, active = true) => {
      const d = origAddSheet(name, active)
      // 重命名走 datas[i].name = value，包一个 setter 才能感知（getData() 也读 name）
      let sheetName = d.name
      Object.defineProperty(d, 'name', {
        get: () => sheetName,
        set: (v) => {
          sheetName = v
          if (!loadingRef.current) emitFullData('structural')
        }
      })
      // 新增的工作表标签也要能拖拽排序
      wireSheetDrag(bb && bb.items[bb.items.length - 1])
      if (!loadingRef.current) emitFullData('structural')
      return d
    }
    const origDeleteSheet = sheetAny.deleteSheet.bind(sheet)
    sheetAny.deleteSheet = () => {
      const res = origDeleteSheet()
      if (!loadingRef.current) emitFullData('structural')
      return res
    }

    loadingRef.current = true
    // 跨工作表复制粘贴修复：必须在 loadData 之前安装，这样 loadData 新建的
    // 各个工作表 DataProxy 也会被标记（库自身只有表内剪贴板，切表即失效）
    installCrossSheetClipboardFix(sheet)
    try {
      sheet.loadData(data)
    } finally {
      loadingRef.current = false
    }
    // loadData 已按当前顺序建好所有标签，逐一接上拖拽排序
    if (bb) bb.items.forEach(wireSheetDrag)
    // 通过 change 回调把最新数据写回 content（改用 getData() 拿全量，避免截断成单 sheet）
    sheet.change(() => {
      emitFullData()
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
      loadingRef.current = false
      container.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, theme, systemDark, editorDark])

  // 容器尺寸变化时（预览面板收起/展开的过渡动画、侧栏开关、窗口宽度变化等）
  // 触发 x-data-spreadsheet 重新测量并重排。库默认只在 window resize 时 reload，
  // 若面板在过渡中（容器还处于半宽）挂载，表格会停留在半宽、右侧留白。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        try {
          ;(sheetRef.current as any)?.sheet?.reload?.()
        } catch {}
      })
    })
    ro.observe(container)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [noteId])

  // 外部内容变化（切笔记 / 回滚 / 恢复草稿 / AI 替换）时重新加载。
  // 仅当"value 正是本组件上次发射的内容"（内部编辑回显）时跳过，
  // 其余外部来源的 value 变化（含 AI 写作替换）都强制 loadData 刷新。
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet || !initializedRef.current) return
    if (internalChangeRef.current && value === lastEmittedRef.current) {
      internalChangeRef.current = false
      return
    }
    internalChangeRef.current = false
    const incoming = parseData(value)
    if (incoming) {
      loadingRef.current = true
      try {
        sheet.loadData(incoming)
      } finally {
        loadingRef.current = false
      }
    }
  }, [value, noteId])

return (
    <div
      className="spreadsheet-view"
      data-xspreadsheet-dark={isDark ? 'true' : 'false'}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}