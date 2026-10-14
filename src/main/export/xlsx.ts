import ExcelJS from 'exceljs'
import { SpreadsheetData } from '../../shared/types'

/**
 * 把笔记内部的"智能表格" JSON（x-data-spreadsheet 的 getData() 输出）
 * 转换为真正的 .xlsx 文件 Buffer。
 *
 * 映射规则：
 *  - 每个 sheet → 一个 worksheet
 *  - 单元格 text → 单元格内容（保留为字符串）
 *  - 单元格 style.bgcolor → exceljs cell.fill（底色）
 *  - sheet.merges（如 "A1:B2"）→ worksheet.mergeCells
 */
export async function exportSpreadsheetToXlsx(title: string, content: string): Promise<Buffer> {
  let data: SpreadsheetData
  try {
    const parsed = JSON.parse(content)
    data = Array.isArray(parsed) ? parsed : [parsed]
  } catch (e) {
    throw new Error('表格数据解析失败：' + (e as Error).message)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = '墨与石板 (Inkslate)'
  wb.title = title
  // 显式设置工作簿视图：默认选中第一个工作表
  wb.views = [{ x: 0, y: 0, width: 0, height: 0, firstSheet: 0, activeTab: 0, visibility: 'visible' }]

  if (!data || data.length === 0) {
    const ws = wb.addWorksheet('Sheet1')
    applyDefaultSheetView(ws)
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>
  }

  for (const sheetData of data) {
    const ws = wb.addWorksheet(sheetData?.name || 'Sheet1')
    applyDefaultSheetView(ws)
    const styles = sheetData?.styles || []

    const rows = sheetData?.rows || {}
    // 行号可能不连续，收集所有用到单元格的行
    for (const rowKey of Object.keys(rows)) {
      const ri = parseInt(rowKey, 10)
      const row = rows[ri]
      if (!row?.cells) continue
      const rowCells = row.cells
      for (const colKey of Object.keys(rowCells)) {
        const ci = parseInt(colKey, 10)
        const cell = rowCells[ci]
        if (!cell) continue
        const excelCell = ws.getCell(ri + 1, ci + 1)
        excelCell.value = cell.text ?? ''

        const cellStyle = typeof cell.style === 'number' ? styles[cell.style] : null
        // 自动换行 / 垂直对齐：与编辑器一致（编辑器默认 textwrap: true，
        // 行高按内容自适应；Excel 里对未显式设行高的行也会自动适配）
        if (cellStyle?.textwrap === true || cellStyle?.valign) {
          excelCell.alignment = {
            wrapText: cellStyle?.textwrap === true,
            vertical: cellStyle?.valign === 'top' ? 'top'
              : cellStyle?.valign === 'bottom' ? 'bottom'
                : 'middle',
          }
        }

        if (typeof cell.style === 'number' && styles[cell.style]?.bgcolor) {
          const bgcolor = String(styles[cell.style].bgcolor).replace(/^#/, '')
          if (/^[0-9a-fA-F]{6}$/.test(bgcolor)) {
            excelCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF' + bgcolor.toUpperCase() }
            }
          }
        }
      }
    }

    // 合并单元格
    const merges = sheetData?.merges || []
    for (const range of merges) {
      if (typeof range !== 'string' || !/^[A-Z]+\d+:[A-Z]+\d+$/i.test(range)) continue
      try {
        ws.mergeCells(range.toUpperCase())
      } catch {
        // 忽略非法合并区间
      }
    }

    // 列宽
    const cols = sheetData?.cols || {}
    for (const colKey of Object.keys(cols)) {
      const ci = parseInt(colKey, 10)
      const width = cols[ci]?.width
      if (typeof width === 'number' && width > 0) {
        ws.getColumn(ci + 1).width = Math.min(60, Math.max(4, Math.round(width / 7)))
      }
    }
  }

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>
}

/**
 * 给工作表设置标准的、可交互的视图（网格线 + 行/列标题 + 正常选中）。
 * exceljs 默认不写 <sheetView>，且 pageSetup 默认 showGridLines/showRowColHeaders 为 false，
 * 部分表格软件（如 WPS）打开这类文件时会退化成"无法选中单元格"的状态，这里显式写全。
 */
function applyDefaultSheetView(ws: ExcelJS.Worksheet): void {
  ws.views = [{ state: 'normal', showGridLines: true, showRowColHeaders: true }]
  ws.pageSetup = {
    orientation: 'portrait',
    fitToPage: false,
    showGridLines: true,
    showRowColHeaders: true,
  }
}
