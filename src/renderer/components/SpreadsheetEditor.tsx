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
    try {
      sheet.loadData(data)
    } finally {
      loadingRef.current = false
    }
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
    <div className="spreadsheet-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, background: '#fff' }} />
    </div>
  )
}