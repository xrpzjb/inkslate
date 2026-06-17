import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store/app'
import { Sidebar } from './Sidebar'
import { Editor } from './Editor'
import { Preview } from './Preview'
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
      target.style.width = `${newWidth}px`
    }

    const onMouseUp = (e: PointerEvent) => {
      if (startXRef.current === 0) return
      startXRef.current = 0
      onCommitRef.current(target.offsetWidth)
      divider.releasePointerCapture(e.pointerId)
      document.body.style.userSelect = ''
    }

    divider.addEventListener('pointerdown', onMouseDown)
    divider.addEventListener('pointermove', onMouseMove)
    divider.addEventListener('pointerup', onMouseUp)

    return () => {
      divider.removeEventListener('pointerdown', onMouseDown)
      divider.removeEventListener('pointermove', onMouseMove)
      divider.removeEventListener('pointerup', onMouseUp)
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

  const [sidebarWidth, setSidebarWidth] = useState(settings?.layout.sidebarWidth ?? 260)
  const [previewWidth, setPreviewWidth] = useState(420)
  const sidebarDividerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const previewDividerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const isRichText = currentNote?.format === 'richtext'
  const effectivePreviewVisible = previewVisible && !isRichText

  useHorizontalResize(
    sidebarDividerRef,
    sidebarRef,
    'right',
    useCallback((w: number) => setSidebarWidth(w), []),
    160,
    1200
  )

  useHorizontalResize(
    previewDividerRef,
    previewRef,
    'left',
    useCallback((w: number) => setPreviewWidth(w), []),
    200,
    2000
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

            <div
        className={`layout-editor ${!editorVisible ? 'collapsed' : ''}`}
        style={{ width: editorVisible ? 'auto' : 0, flex: editorVisible ? 1 : 'none' }}
      >
        {editorVisible && <Editor />}
      </div>

            {sidebarVisible && <div ref={previewDividerRef} className="layout-divider" />}

            <div
        ref={previewRef}
        className={`layout-preview ${!effectivePreviewVisible ? 'collapsed' : ''}`}
        style={{
          width: effectivePreviewVisible
            ? (editorVisible ? previewWidth : '100%')
            : 0,
          flex: effectivePreviewVisible && !editorVisible ? 1 : 'none'
        }}
      >
        <div className="panel-header">
          <span className="panel-title">预览</span>
        </div>
        {effectivePreviewVisible && <Preview />}
      </div>
    </div>
  )
}
