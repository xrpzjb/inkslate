import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib'

export interface OutlineItem {
  title: string
  /** 0-based 页码 */
  pageIndex: number
}

/**
 * 给已有 PDF 注入目录（Outline / 书签）树。
 * pdf-lib 没有高层 API，这里用底层 context 直接构造 Outlines 字典。
 * Chromium 的 printToPDF 不会生成书签，必须后处理。
 * 标题用 UTF-16BE 十六进制字符串（<FEFF…>），保证中文在各类 PDF 查看器里正常显示。
 */
export async function addPdfOutline(
  pdfBytes: Uint8Array,
  items: OutlineItem[]
): Promise<Uint8Array> {
  if (items.length === 0) return pdfBytes

  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false })
  const pages = pdfDoc.getPages()
  const context = pdfDoc.context

  const rootRef = context.nextRef()
  const rootDict = context.obj({
    Type: 'Outlines',
    First: undefined,
    Last: undefined,
    Count: items.length,
  }) as PDFDict
  context.assign(rootRef, rootDict)

  const refs: PDFRef[] = []
  const dicts: PDFDict[] = []

  for (let i = 0; i < items.length; i++) {
    const pageIndex = Math.max(0, Math.min(items[i].pageIndex, pages.length - 1))
    const ref = context.nextRef()
    const dict = context.obj({
      Title: PDFHexString.fromText(items[i].title),
      Parent: rootRef,
      Dest: [pages[pageIndex].ref, PDFName.of('Fit')],
    }) as PDFDict
    refs.push(ref)
    dicts.push(dict)
    context.assign(ref, dict)
  }

  for (let i = 0; i < dicts.length; i++) {
    if (i > 0) dicts[i].set(PDFName.of('Prev'), refs[i - 1])
    if (i < dicts.length - 1) dicts[i].set(PDFName.of('Next'), refs[i + 1])
  }
  rootDict.set(PDFName.of('First'), refs[0])
  rootDict.set(PDFName.of('Last'), refs[refs.length - 1])

  pdfDoc.catalog.set(PDFName.of('Outlines'), rootRef)
  // 打开 PDF 时默认展示目录/书签面板
  pdfDoc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))

  // useObjectStreams:false 写出传统 xref 表而非压缩的交叉引用流，
  // 部分查看器（WPS/福昕）对 Chromium+pdf-lib 生成的 XRef 流解析不全，
  // 会导致书签目录丢失；传统 xref 兼容性最好
  return pdfDoc.save({ useObjectStreams: false })
}
