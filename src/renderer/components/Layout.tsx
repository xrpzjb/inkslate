import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store/app'
import { Sidebar } from './Sidebar'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { RecycleBinView } from './RecycleBinView'
import { IconSidebar } from './IconSidebar'
import { TabBar } from './TabBar'
import '../styles/layout.css'

/** 侧栏 / 编辑器 / 预览 之间的水平拖拽 resize */
function useHorizontalResize(
  dividerRef: React.RefObject<HTMLElement>,
  targetRef: React.RefObject<HTMLElement>,
  direction: 'right' | 'left',
  onCommit: (finalWidth: number) => void,
  minWidth: number = 160,
  maxWidth: number = 2000
) {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const refWidthDuringDrag = useRef(0)
  const onCommitRef = useRef(onCommit)

  useEffect(() => { onCommitRef.current = onCommit }, [onCommit])

  useEffect(() => {
    const divider = dividerRef.current
    const target = targetRef.current
    if (!divider || !target) return

    const onMouseDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startWidthRef.current = target.offsetWidth
      document.body.style.userSelect = 'none'
      divider.setPointerCapture(e.pointerId)
    }

    const onMouseMove = (e: PointerEvent) => {
      if (startXRef.current === 0) return
      const delta = e.clientX - startXRef.current
      const effectiveDelta = direction === 'right' ? delta : -delta
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + effectiveDelta))
      // 直接走 React state（通过 onCommitRef 的旁路 setState），
      // 不操作 DOM inline style，避免后续 toggleVisible 时 stale style 冲突
      // 拖动期间用一个临时 ref 持有最新值，pointerup 时再 commit
      if (refWidthDuringDrag.current !== newWidth) {
        refWidthDuringDrag.current = newWidth
        // 实时反馈：直接写 inline style 仍然 OK，但必须在 pointerup 时清掉
        target.style.width = `${newWidth}px`
      }
    }

    const onMouseUp = (e: PointerEvent) => {
      if (startXRef.current === 0) return
      startXRef.current = 0
      const finalWidth = refWidthDuringDrag.current
      // 清掉 inline style，让 React state 接管（避免与 style={{ width }} 冲突）
      target.style.width = ''
      onCommitRef.current(finalWidth)
      divider.releasePointerCapture(e.pointerId)
      document.body.style.userSelect = ''
    }

    // 双击分隔条 → 重置回默认值（minWidth 之上、maxWidth 之下、中位数）。
    // —— 拖死之后的"逃生通道"，免得点右下角按钮不响应以为坏了
    const onDoubleClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const defaultWidth = Math.round((minWidth + maxWidth) / 4) // 偏小的默认值
      target.style.width = ''  // 清掉 inline style，让 React state 接管
      onCommitRef.current(defaultWidth)
    }

    divider.addEventListener('pointerdown', onMouseDown)
    divider.addEventListener('pointermove', onMouseMove)
    divider.addEventListener('pointerup', onMouseUp)
    divider.addEventListener('dblclick', onDoubleClick)

    return () => {
      divider.removeEventListener('pointerdown', onMouseDown)
      divider.removeEventListener('pointermove', onMouseMove)
      divider.removeEventListener('pointerup', onMouseUp)
      divider.removeEventListener('dblclick', onDoubleClick)
    }
  }, [dividerRef, targetRef, direction, minWidth, maxWidth])
}

export function Layout() {
  const sidebarVisible = useAppStore(s => s.sidebarVisible)
  const previewVisible = useAppStore(s => s.previewVisible)
  const editorVisible = useAppStore(s => s.editorVisible)
  const toggleSidebar = useAppStore(s => s.toggleSidebar)
  const togglePreview = useAppStore(s => s.togglePreview)
  const toggleEditor = useAppStore(s => s.toggleEditor)
  const settings = useAppStore(s => s.settings)
  const currentNote = useAppStore(s => s.currentNote)
  const viewMode = useAppStore(s => s.viewMode)
  const isRecycleBin = viewMode === 'recycle-bin'

  const [sidebarWidth, setSidebarWidth] = useState(settings?.layout.sidebarWidth ?? 260)
  const [previewWidth, setPreviewWidth] = useState(420)
  // 窗口宽度：用于动态计算 max 拖动上界，保证任何一栏都不会把其他挤到看不见
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const sidebarDividerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const previewDividerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isRichText = currentNote?.format === 'richtext'
  const isCode = currentNote?.format === 'code'
  const effectivePreviewVisible = previewVisible && !isRichText && !isCode

  // 拖动 max：保证编辑器至少有 240px 可见，预览至少有 200px 可见（隐藏时给 0）
  // —— 物理上"挤不掉"另一栏
  const sidebarMax = Math.max(160, windowWidth - (effectivePreviewVisible ? 200 : 0) - 240 - 22)
  const previewMax = Math.max(200, windowWidth - sidebarWidth - 240 - 22)

  useHorizontalResize(
    sidebarDividerRef,
    sidebarRef,
    'right',
    useCallback((w: number) => setSidebarWidth(w), []),
    160,
    sidebarMax
  )

  useHorizontalResize(
    previewDividerRef,
    previewRef,
    'left',
    useCallback((w: number) => setPreviewWidth(w), []),
    200,
    previewMax
  )

  const lastSavedWidth = useRef(sidebarWidth)
  useEffect(() => {
    if (lastSavedWidth.current !== sidebarWidth && settings) {
      const timer = setTimeout(() => {
        window.inkslateApi.settings.update({
          layout: { ...settings.layout, sidebarWidth }
        }).catch(() => {})
        lastSavedWidth.current = sidebarWidth
      }, 500) // 叉姈 500ms
      return () => clearTimeout(timer)
    }
  }, [sidebarWidth, settings])

  useEffect(() => {
    if (settings?.layout.sidebarWidth) {
      setSidebarWidth(settings.layout.sidebarWidth)
    }
  }, [settings])

  return (
    <div className="layout-body" style={{ height: '100%', width: '100%' }}>
      <IconSidebar />
      <div
        ref={sidebarRef}
        className={`layout-sidebar ${!sidebarVisible ? 'collapsed' : ''}`}
        style={{ width: sidebarVisible ? sidebarWidth : 0 }}
      >
        <div className="panel-header">
          <span className="panel-title">笔记本</span>
        </div>
        {sidebarVisible && <Sidebar />}
      </div>

            {sidebarVisible && <div ref={sidebarDividerRef} className="layout-divider" />}

            {isRecycleBin ? (
              <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                <RecycleBinView />
              </div>
            ) : (
              <>
                {/* 多标签页：覆盖 editor + preview 两个面板共用的"顶部标题栏" */}
                <div style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <TabBar />
                  <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    <div
                      className={`layout-editor ${!editorVisible ? 'collapsed' : ''}`}
                      style={{
                        // url 和 file 笔记都不渲染 Editor，整列给 preview
                        width: (currentNote?.format === 'url' || currentNote?.format === 'file') ? 0 : (editorVisible ? 'auto' : 0),
                        flex: (currentNote?.format === 'url' || currentNote?.format === 'file') ? 'none' : (editorVisible ? 1 : 'none'),
                        display: (currentNote?.format === 'url' || currentNote?.format === 'file') ? 'none' : undefined
                      }}
                    >
                      {editorVisible && currentNote?.format !== 'url' && currentNote?.format !== 'file' && <Editor />}
                    </div>

                    <div
                      ref={previewDividerRef}
                      className="layout-divider"
                      style={{
                        // 编辑器隐藏时 divider 不可见也不可拖 —— preview 已接管整块
                        // 编辑器显示但 preview 隐藏时也不可拖
                        visibility: (effectivePreviewVisible && editorVisible) ? 'visible' : 'hidden',
                        pointerEvents: (effectivePreviewVisible && editorVisible) ? 'auto' : 'none'
                      }}
                    />

                    <div
                      ref={previewRef}
                      className={`layout-preview ${!effectivePreviewVisible ? 'collapsed' : ''}`}
                      style={{
                        // 关键设计：
                        //  - editor 显示 + preview 显示：preview 用 previewWidth，preview-divider 可拖
                        //  - editor 隐藏 + preview 显示：preview 用 flex: 1 接管右侧全部空间，
                        //    左边界保持在 preview-divider 位置不动（preview-divider 仍可见位置），
                        //    但 divider 不可拖（见上面 visibility 设置）
                        //  - preview 隐藏：preview width 0
                        width: effectivePreviewVisible
                          ? (editorVisible ? previewWidth : 'auto')
                          : 0,
                        flex: effectivePreviewVisible ? (editorVisible ? 'none' : 1) : 'none',
                        minWidth: 0
                      }}
                    >
                      {effectivePreviewVisible && <Preview />}
                    </div>
                  </div>
                </div>
              </>
            )}
    </div>
  )
}
