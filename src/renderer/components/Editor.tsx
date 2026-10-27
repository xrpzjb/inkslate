import { useEffect, useRef, useState, useCallback, useLayoutEffect, forwardRef, useImperativeHandle } from 'react'

// ============ 草稿安全网：localStorage 备份 ============
// 设计原则（2026-09-20「切换笔记内容丢失」事故后重写）：
//   1. 本地写盘不依赖网络、也不依赖 git 同步状态 —— 同步服务端挂了同样必须能存到本地；
//   2. 只要草稿还没被「成功写库」覆盖，就绝不清除它（恢复后也不清）；
//   3. 不能用 updatedAt 判断草稿是否过期：改标题/图标这类元数据写入也会推进 updatedAt，
//      会把更新的正文草稿判成"过期"而丢掉。改用 base —— 起草时磁盘上的内容：
//      base === 当前磁盘内容 ⇒ 本地修改还建立在同一基线上，草稿有效。
const DRAFT_NS = 'inkslate:draft:'
/** 冲突时把「外部写入的那一份」单独存一份，保证任何一方都不会被静默丢弃 */
const REMOTE_STASH_NS = 'inkslate:remote:'

interface DraftRecord {
  title: string
  content: string
  /** 起草时磁盘上的内容（判断草稿是否还建立在同一基线上） */
  base: string
  /** 写入时间戳 */
  t: number
}

const readDraft = (noteId: string): DraftRecord | null => {
  try {
    const raw = localStorage.getItem(DRAFT_NS + noteId)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d.content !== 'string') return null
    return { title: typeof d.title === 'string' ? d.title : '', content: d.content, base: typeof d.base === 'string' ? d.base : '', t: typeof d.t === 'number' ? d.t : 0 }
  } catch { return null }
}
const saveDraft = (noteId: string, title: string, content: string, base: string) => {
  try {
    localStorage.setItem(DRAFT_NS + noteId, JSON.stringify({ title, content, base, t: Date.now() }))
  } catch {}
}
/** 只在草稿内容与刚成功写库的内容一致时清除，避免清掉更新的草稿 */
const clearDraftIf = (noteId: string, savedContent: string) => {
  try {
    const prev = readDraft(noteId)
    if (!prev || prev.content === savedContent) localStorage.removeItem(DRAFT_NS + noteId)
  } catch {}
}
const clearDraft = (noteId: string) => {
  try { localStorage.removeItem(DRAFT_NS + noteId) } catch {}
}
const stashRemote = (noteId: string, content: string, local?: string) => {
  try { localStorage.setItem(REMOTE_STASH_NS + noteId, JSON.stringify({ content, local, t: Date.now() })) } catch {}
}
const readStashedRemote = (noteId: string): string | null => {
  try {
    const raw = localStorage.getItem(REMOTE_STASH_NS + noteId)
    if (!raw) return null
    const d = JSON.parse(raw)
    return typeof d?.content === 'string' ? d.content : null
  } catch { return null }
}
const clearStashedRemote = (noteId: string) => {
  try { localStorage.removeItem(REMOTE_STASH_NS + noteId) } catch {}
}
import { createPortal } from 'react-dom'
import { useAppStore, protectedRootOf, looksLikeCiphertext, withLockGuard } from '../store/app'
import { appThemes } from '../themes'
import { Bold, Italic, Heading1, Heading2, Heading3, Heading4, Link, Link2, Image, Code, Code2, List, ListOrdered, ListChecks, ListTodo, Quote, Save, Underline, Strikethrough, Undo2, Redo2, Pilcrow, Minus, AlignLeft, AlignCenter, AlignRight, Eraser, Indent, Outdent, PanelRightClose, PanelRightOpen, PanelLeftOpen, Table, Wand2, Highlighter, Sigma, SquareSigma, ChartBar, BarChart3, History, Sun, Moon, Bot, Loader2, Lock, Unlock, AlertCircle, MoreHorizontal, WrapText, Check, Download } from 'lucide-react'
import { FileText } from 'lucide-react'
import { CodeEditor } from './CodeEditor'
import { SpreadsheetEditor, spreadsheetToMarkdown, markdownToSpreadsheetData } from './SpreadsheetEditor'
import { toast } from './Toast'

/**
 * 杞婚噺绾?Markdown 缂栬緫鍣? * - 琛屽彿
 * - Tab 缂╄繘
 */

export function Editor() {
  const currentNote = useAppStore(s => s.currentNote)
  const updateNote = useAppStore(s => s.updateNote)
  const updateCurrentNoteDraft = useAppStore(s => s.updateCurrentNoteDraft)
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const shadowDark = settings?.editorDark === true ||
    (settings?.theme != null && appThemes[settings.theme as keyof typeof appThemes]?.colorScheme === 'dark')
  // 应用主题是否为暗色（auto 视为跟随系统，不按暗色处理）
  const appIsDark = settings?.theme != null && appThemes[settings.theme as keyof typeof appThemes]?.colorScheme === 'dark'

  const [content, setContent] = useState(() => currentNote?.content ?? '')
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const previewVisible = useAppStore(s => s.previewVisible)
  const togglePreview = useAppStore(s => s.togglePreview)
  const setSaveStatus = useAppStore(s => s.setSaveStatus)
  const [title, setTitle] = useState(() => currentNote?.title ?? '')
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const contentTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 智能表格：SpreadsheetEditor 通过 onChange 维护 content（数组格式），
  // 一旦用户编辑过（dirty=true），currentNote.content 里的旧磁盘值就不得再覆盖 content，
  // 否则新增 sheet / 编辑会被回滚；仅在未编辑（如 git pull 恢复）时允许同步。
  const spreadsheetDirtyRef = useRef(false)
  const codeEditorRef = useRef<import('./CodeEditor').CodeEditorHandle>(null)
  const richtextEditorRef = useRef<{ setHTML: (html: string) => void }>(null)

  // CodeEditor 的 onSave / 防抖里读到的必须是最新值，用 ref 兜住（在声明处就同步，别等下文的重新赋值）
  const contentRef = useRef(content)
  contentRef.current = content
  const titleRef = useRef(title)
  titleRef.current = title
  const currentNoteRef = useRef(currentNote)
  currentNoteRef.current = currentNote

  // 关键防御：跟踪"本组件正在为哪个 note 持有本地 title/content 草稿"。
  // 切笔记时：旧 note 的草稿用完即弃，新 note 的同步效果跑完后才允许写入。
  // 防止"切到 B 时，A 的本地 content/title 错存到 B"。
  const editingNoteIdRef = useRef<string | null>(null)
  // 缓存上一个 note 的草稿（用于切换时 flush 保存）
  const lastDraftRef = useRef<{ id: string; title: string; content: string } | null>(null)
  /** 当前笔记"磁盘上已知内容"：用来识别外部写入（git pull / 另一端同步 / 外部程序改文件） */
  const baselineRef = useRef<string>('')
  /** 检测到「外部写入 vs 本地未保存修改」冲突的笔记 id；置位期间暂停自动写盘，避免用旧内容覆盖远端 */
  const conflictNoteIdRef = useRef<string | null>(null)
  const [conflictNoteId, setConflictNoteId] = useState<string | null>(null)

  const clearTimers = useCallback(() => {
    if (titleTimerRef.current) { clearTimeout(titleTimerRef.current); titleTimerRef.current = null }
    if (contentTimerRef.current) { clearTimeout(contentTimerRef.current); contentTimerRef.current = null }
  }, [])

  /**
   * 把一个笔记的本地草稿写入本地库。
   * 本地优先：不看 git 同步状态 —— 同步服务端挂掉 / 同步卡住时，本地照样必须落盘。
   * 唯一例外是这篇笔记处在"外部冲突"状态（外部已写入新内容），此时写回会覆盖远端，
   * 由界面上的冲突条让用户显式选择。
   */
  const flushDraft = useCallback((draft: { id: string; title: string; content: string }) => {
    if (!draft) return
    if (conflictNoteIdRef.current === draft.id) {
      toast.info('该笔记检测到外部更新，本地修改已保留为草稿，请先在编辑器顶部选择保留哪一份', 5000)
      return
    }
    // 没有本地修改就不写盘：切换笔记很频繁，空写会产生无谓的 git 噪声
    const cached = useAppStore.getState().notes.find(n => n.id === draft.id)
    const contentChanged = draft.content !== baselineRef.current
    const titleChanged = !!draft.title && draft.title.trim() !== '' && draft.title !== cached?.title
    if (!contentChanged && !titleChanged) return
    const updates: { title?: string; content: string } = { content: draft.content }
    // 防御：不保存空标题，避免把标题清成空
    if (draft.title && draft.title.trim()) updates.title = draft.title
    // 标题 + 正文一次写完：走单次 IPC，主进程里就是一次原子的"改名 + 写文件"
    updateNote(draft.id, updates)
      .then(() => {
        clearDraftIf(draft.id, draft.content)
        // 只有 flush 的正是当前正在编辑的笔记时才动基线/脏标记，
        // 否则会把 A 的内容当成 B 的磁盘基线
        if (editingNoteIdRef.current === draft.id) {
          baselineRef.current = draft.content
          setSaveStatus({ dirty: false })
        }
      })
      .catch(() => { /* 失败已由 store.updateNote 提示 + 草稿仍在 localStorage */ })
  }, [updateNote, setSaveStatus])

  // 同步当前笔记（切换时 + 外部重命名时）
  // 用 useLayoutEffect：在浏览器绘制前同步 content/title，避免切换到笔记时先闪一帧空白
  useLayoutEffect(() => {
    if (currentNote) {
      // 切到新 note 前：把上一个 note 的草稿 flush 一次（清掉 timer 立即写库）
      const last = lastDraftRef.current
      if (last && last.id !== currentNote.id) {
        clearTimers()
        flushDraft(last)
      }

      // 检查 localStorage 是否有未保存的草稿（安全网恢复）
      const dbContent = currentNote.content ?? ''
      const draft = readDraft(currentNote.id)
      let activeContent = dbContent
      let restored = false
      // 切进来时先清掉上一个笔记遗留的冲突标记
      conflictNoteIdRef.current = null
      setConflictNoteId(null)
      if (draft && draft.content && draft.content !== dbContent) {
        if (draft.base === dbContent) {
          // 草稿建立在当前磁盘内容之上 ⇒ 就是还没写成功的本地修改，恢复出来
          activeContent = draft.content
          restored = true
        } else {
          // 磁盘在本地编辑期间被外部改过（git pull / 另一端 / 外部程序）：
          // 两份内容都有价值 —— 本地那份继续显示在编辑器里，外部那份另存一份，
          // 绝不像以前那样"直接丢弃本地、按 updatedAt 判草稿过期"。由用户选择保留哪份。
          stashRemote(currentNote.id, dbContent)
          activeContent = draft.content
          restored = true
          conflictNoteIdRef.current = currentNote.id
          setConflictNoteId(currentNote.id)
          toast.info(`「${currentNote.title || '笔记'}」检测到外部更新：已保留你的本地修改，外部版本已备份，请在编辑器顶部确认`, 6000)
        }
      } else if (draft && draft.content === dbContent) {
        // 草稿内容已经落盘 → 清理（说明之前保存成功过）
        clearDraft(currentNote.id)
      }

      baselineRef.current = dbContent
      setContent(activeContent)
      setTitle(currentNote.title ?? '')
      editingNoteIdRef.current = currentNote.id
      spreadsheetDirtyRef.current = false
      lastDraftRef.current = { id: currentNote.id, title: currentNote.title ?? '', content: activeContent }
      if (restored) {
        // 注意：草稿不清除 —— 还没写库成功，清了就等于把安全网拆了
        toast.info('已恢复未保存的编辑内容')
      }
    } else {
      // 切到无选中状态：也 flush 一次
      const last = lastDraftRef.current
      if (last) {
        clearTimers()
        flushDraft(last)
      }

      setContent('')
      setTitle('')
      editingNoteIdRef.current = null
      lastDraftRef.current = null
    }
    // 注意：故意不把 flushDraft 加进依赖——它依赖的 updateNote 来自 store，引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNote?.id])

  // 每次本地 title/content 变化时，更新 lastDraftRef
  // 这样切换时能拿到最新草稿
  useEffect(() => {
    if (editingNoteIdRef.current) {
      lastDraftRef.current = { id: editingNoteIdRef.current, title, content }
    }
  }, [title, content])

  // 更多设置菜单：点击外部或按 Esc 关闭
  useEffect(() => {
    if (!moreMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreMenuOpen])

  // 外部更新 title（如 Sidebar 重命名）时，刷新本地 title
  // 仅在 store 里的 title 跟本地不一致时同步，避免覆盖用户正在输入
  useEffect(() => {
    if (!currentNote) return
    if (currentNote.id !== editingNoteIdRef.current) return
    if (currentNote.title !== title && currentNote.title !== undefined) {
      setTitle(currentNote.title)
    }
  }, [currentNote?.title])

  // 当前 content 同步：外部（git pull / 另一端 / store 重新拉取）改了磁盘内容时，
  // 判断要不要跟随。核心约束：绝不静默丢掉用户还没落盘的修改。
  useEffect(() => {
    if (!currentNote) return
    if (currentNote.id !== editingNoteIdRef.current) return
    if (currentNote.content === content) return
    if (currentNote.content == null) return
    // 智能表格：store 里的 currentNote.content 是全量表格 JSON，直接 setContent 会把用户
    // 新增/编辑的 sheet 整块回滚 —— 所以"是否允许用外部内容刷新编辑器"要挡住。
    // ⚠️ 但只是挡住 setContent，不能连"外部改过磁盘"的检测一起跳过：
    // 一旦跳过，下面 2 秒防抖的自动保存就会把编辑器里这份（建立在旧基线之上的）表格写回文件，
    // 覆盖另一端刚同步过来的内容（2026-10-08 周报被整份覆盖就是这条路径）。
    const spreadsheetDirty = currentNote.format === 'spreadsheet' && spreadsheetDirtyRef.current
    // 有活跃防抖 timer 说明用户正在输入；此时不覆盖本地编辑
    if (contentTimerRef.current) return

    const external = currentNote.content
    const locallyDirty = content !== baselineRef.current
    if (external !== baselineRef.current) {
      // 磁盘内容确实被外部改过
      if (locallyDirty || spreadsheetDirty) {
        // 本地有未保存修改 + 外部也写了：两边都有价值。
        // 暂停自动写盘（写回会覆盖外部那份），把外部内容备份下来，等用户选择。
        stashRemote(currentNote.id, external)
        conflictNoteIdRef.current = currentNote.id
        setConflictNoteId(currentNote.id)
        toast.info(`「${currentNote.title || '笔记'}」检测到外部更新：已保留你的本地修改，外部版本已备份，请在编辑器顶部确认`, 6000)
        return
      }
      // 本地没有未保存修改 → 直接跟随外部内容
      baselineRef.current = external
      clearDraft(currentNote.id)
      setContent(external)
      return
    }

    // 外部内容没变（例如空内容兜底 / store 回填旧值）：只在本地干净时跟随，
    // 本地脏就保持用户输入，避免把正在写的内容冲掉
    if (locallyDirty || spreadsheetDirty) return
    if (!external && content) return
    setContent(external)
  }, [currentNote?.id, currentNote?.content])

  // 即时同步草稿到 store（不进库），让 Preview 实时看到最新内容
  // 仅响应用户编辑（content / title 变化），不随 currentNote 对象变动触发，
  // 避免异步 fetch 返回的新对象覆盖掉已正确渲染的本地草稿。
  useEffect(() => {
    if (!currentNote) return
    // 关键 guard：只为本组件正在编辑的 note 同步草稿
    if (currentNote.id !== editingNoteIdRef.current) return
    if (content === currentNote.content && title === currentNote.title) return
    updateCurrentNoteDraft({ content, title })
  }, [content, title])

  // 每次编辑即时备份到 localStorage（安全网：写库失败 / 崩溃 / 断电都能恢复）
  // 注意：只备份"有本地修改"的状态，且带 base（起草时的磁盘内容），
  // 这样恢复时能判断磁盘有没有被外部改过，也不会把空白状态盖到好草稿上。
  useEffect(() => {
    if (!currentNote || currentNote.id !== editingNoteIdRef.current) return
    const baseline = baselineRef.current
    if (content === baseline && title === currentNote.title) return
    saveDraft(currentNote.id, title, content, baseline)
    setSaveStatus({ dirty: true })
  }, [content, title])

  // 标题：立即写库（单行输入，成本低，用户期望即时反馈）
  useEffect(() => {
    if (!currentNote) return
    if (currentNote.id !== editingNoteIdRef.current) return
    if (title === currentNote.title) return
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      // 二次 guard：timer 触发时再次确认还在编辑同一个 note
      if (currentNote.id !== editingNoteIdRef.current) return
      // 防御：不保存空标题
      if (!title?.trim()) return
      // 只传 title，避免覆盖 content。
      // 注意：这里不看 git 同步状态 —— 改标题是纯本地写盘，同步卡住也必须落盘。
      updateNote(currentNote.id, { title }).catch(() => { /* 错误已由 store.updateNote 提示 */ })
    }, 300) // 300ms 防抖，避免连续按键触发多次写入
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current)
    }
  }, [title, currentNote?.id])

  // 正文：2s 防抖写库（纯本地写盘，与 git 同步状态无关）
  useEffect(() => {
    if (!currentNote) return
    if (currentNote.id !== editingNoteIdRef.current) return
    if (content === baselineRef.current) return
    // 外部冲突未决：不自动写盘（会用本地旧内容覆盖外部已写入的新内容）
    if (conflictNoteIdRef.current === currentNote.id) return
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    contentTimerRef.current = setTimeout(() => {
      // 二次 guard：timer 触发时再次确认还在编辑同一个 note
      if (currentNote.id !== editingNoteIdRef.current) return
      if (conflictNoteIdRef.current === currentNote.id) return
      const noteId = currentNote.id
      const payload = content
      updateNote(noteId, { content: payload })
        .then(() => {
          // 只有"写进去的就是当前编辑器内容"时才更新基线 / 清草稿，
          // 否则会把用户在保存期间新敲的内容判成已保存
          if (editingNoteIdRef.current === noteId && contentRef.current === payload) {
            baselineRef.current = payload
            clearDraftIf(noteId, payload)
            setSaveStatus({ dirty: false })
          }
        })
        .catch(() => { /* 失败已提示，草稿仍在 localStorage */ })
    }, 2000)
    return () => {
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    }
  }, [content, currentNote?.id])

  // 组件卸载时 flush 草稿到库
  // 修复：切换 md 笔记时 selectNote 同时改 currentNote + editorVisible=false，
  // Editor 被卸载，上面的 flush effect 来不及跑，内容丢失。
  // 此 effect 的 cleanup 在卸载时触发，保证草稿不丢（本地优先，不看同步状态）。
  useEffect(() => {
    return () => {
      const last = lastDraftRef.current
      if (!last) return
      clearTimers()
      flushDraft(last)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听 AI 面板替换内容事件
  useEffect(() => {
    const onReplace = (e: Event) => {
      const text = (e as CustomEvent).detail as string
      const cn = currentNoteRef.current
      if (!cn || cn.id !== editingNoteIdRef.current) return
      // AI 替换内容时，必须清掉防抖 timer，否则之前输入的旧内容 timer 会覆盖 AI 内容
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current)
        titleTimerRef.current = null
      }
      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current)
        contentTimerRef.current = null
      }
      if (cn.format === 'richtext') {
        richtextEditorRef.current?.setHTML(text)
      } else {
        setContent(text)
      }
    }
    window.addEventListener('inkslate:ai-replace', onReplace)
    return () => window.removeEventListener('inkslate:ai-replace', onReplace)
  }, [])

  /** 手动保存（菜单 / Ctrl+S / 窗口失焦）：显式写盘，不看同步状态；冲突时以用户意图为准 */
  const handleSave = async () => {
    if (!currentNote) return
    if (currentNote.id !== editingNoteIdRef.current) return
    clearTimers()
    // 用户显式保存 = 明确要保留本地这一份：解除冲突保护，
    // 外部那一份已经在 localStorage 里备份，不会丢
    if (conflictNoteIdRef.current === currentNote.id) {
      conflictNoteIdRef.current = null
      setConflictNoteId(null)
      toast.info('已按你的选择保留本地版本，外部版本仍备份在本地草稿中')
    }
    setSaveStatus({ saving: true })
    try {
      const updates: { title?: string; content: string } = { content }
      if (title && title.trim()) updates.title = title
      await updateNote(currentNote.id, updates)
      baselineRef.current = content
      clearDraftIf(currentNote.id, content)
      setSaveStatus({ dirty: false })
    } finally {
      setSaveStatus({ saving: false })
    }
  }

  /** 导出智能表格笔记为 Excel（.xlsx）：content 即为表格 JSON */
  const handleExportExcel = async () => {
    if (!currentNote) return
    setMoreMenuOpen(false)
    setSaveStatus({ saving: true })
    try {
      const res = await window.inkslateApi.file.exportXlsx({
        title: title || '表格',
        content
      })
      if (res.ok) toast.success('已导出 Excel 文件')
      else if (res.message && res.message !== '已取消') toast.error('Excel 导出失败：' + res.message)
    } catch (e) {
      toast.error('Excel 导出失败：' + (e as Error).message)
    } finally {
      setSaveStatus({ saving: false })
    }
  }

  // CodeEditor 的 onSave 在 useEffect 内闭包，不会随 title/content 变化更新。
  // 用 ref 持有最新值（声明见组件顶部），传给 CodeEditor 的始终是最新值。

  const stableSave = useCallback(() => {
    const cn = currentNoteRef.current
    if (!cn || cn.id !== editingNoteIdRef.current) return
    clearTimers()
    setSaveStatus({ saving: true })
    const payload = contentRef.current
    const updates: { title?: string; content: string } = { content: payload }
    if (titleRef.current && titleRef.current.trim()) updates.title = titleRef.current
    updateNote(cn.id, updates)
      .then(() => {
        baselineRef.current = payload
        clearDraftIf(cn.id, payload)
        setSaveStatus({ dirty: false })
      })
      .finally(() => setSaveStatus({ saving: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听菜单触发的保存事件
  useEffect(() => {
    const onSaveEvent = () => handleSave()
    window.addEventListener('inkslate:save-current', onSaveEvent)
    return () => window.removeEventListener('inkslate:save-current', onSaveEvent)
  }, [currentNote, content, title])
  // 窗口失焦时强制保存（用户切到其他应用）
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stableSave()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ============ 「外部写入 vs 本地未保存修改」冲突处理 ============
  // 场景：git pull 把另一端的内容落到磁盘，而本地编辑器里还有没写库的修改。
  // 以前的做法是同步期间一律禁写 + 按 updatedAt 丢草稿（内容会无声消失）。
  // 现在：两份都留着，由用户选 —— 选哪一份都不会丢内容（另一份进 localStorage 备份）。

  /** 保留本地版本（把本地内容写回文件，可能覆盖外部版本） */
  const resolveKeepLocal = async () => {
    if (!currentNote) return
    conflictNoteIdRef.current = null
    setConflictNoteId(null)
    clearTimers()
    setSaveStatus({ saving: true })
    try {
      const updates: { title?: string; content: string } = { content }
      if (title && title.trim()) updates.title = title
      await updateNote(currentNote.id, updates)
      baselineRef.current = content
      clearDraftIf(currentNote.id, content)
      setSaveStatus({ dirty: false })
      toast.success('已保留你的本地版本（外部版本仍备份在本地草稿里）')
    } finally {
      setSaveStatus({ saving: false })
    }
  }

  /** 采用外部版本（本地版本转存为备份，不清空） */
  const resolveUseRemote = async () => {
    if (!currentNote) return
    const noteId = currentNote.id
    const remote = readStashedRemote(noteId)
    const localCopy = content
    conflictNoteIdRef.current = null
    setConflictNoteId(null)
    clearTimers()
    const next = remote ?? (currentNote.content ?? '')
    // 本地那一份转存到备份里，然后清掉草稿（避免下次切回来又被当成新冲突弹出来）
    stashRemote(noteId, next, localCopy)
    clearDraft(noteId)
    setContent(next)
    baselineRef.current = next
    setSaveStatus({ saving: true })
    try {
      await updateNote(noteId, { content: next })
      setSaveStatus({ dirty: false })
      toast.success('已改用外部版本（你的本地版本备份在本地草稿里，需要时可找回）')
    } finally {
      setSaveStatus({ saving: false })
    }
  }

  const insertText = useCallback((before: string, after: string, placeholder: string, cursorOffset?: number) => {
    codeEditorRef.current?.insertText(before, after, placeholder, cursorOffset)
  }, [])

  // ============ 表格弹窗 ============
  const [tableDlg, setTableDlg] = useState({ open: false, rows: 3, cols: 3 })
  // AI 对话框（弹框模式已移除，仅保留侧栏面板在 Layout 中）

  const confirmMarkdownTable = useCallback(() => {
    const rows = Math.max(2, Math.min(20, tableDlg.rows))
    const cols = Math.max(2, Math.min(8, tableDlg.cols))
    // 表头：| 列1 | 列2 | ... |
    // 分隔：| --- | --- | ... |
    // 数据行 N-2 行：|     |     | ... |
    const sep = '| ' + Array(cols).fill('---').join(' | ') + ' |'
    const header = '| ' + Array.from({ length: cols }, (_, i: number) => `列${i + 1}`).join(' | ') + ' |'
    const dataLine = '| ' + Array(cols).fill('     ').join(' | ') + ' |'
    const data = Array(rows - 1).fill(dataLine).join('\n')
    // 模板：表头 \n 分隔 \n 第一行数据（光标落在第一行第一个单元格内）
    const block = `\n${header}\n${sep}\n${data}\n`
    // 光标落在 header 第一格 "列1" 之后 - "before.length + 3" = 跳过 "| 列"
    const cursorOffset = block.indexOf('列1') + 2 // "列1" 两个字中间，让用户直接覆盖
    insertText(block, '', '', cursorOffset)
    setTableDlg(d => ({ ...d, open: false }))
  }, [tableDlg, insertText])

  // ============ Mermaid 图表弹窗 ============
  const insertMermaid = useCallback((type: string) => {
    const templates: Record<string, { code: string; offset: number }> = {
      flowchart: {
        code: `\n\`\`\`mermaid\ngraph TD\n    A[开始] --> B{判断}\n    B -->|是| C[结束]\n    B -->|否| B\n\`\`\`\n`,
        offset: 0 // 落地在代码块起始，光标已在图代码内
      },
      sequence: {
        code: `\n\`\`\`mermaid\nsequenceDiagram\n    participant A as 用户\n    participant B as 系统\n    A->>B: 请求\n    B-->>A: 响应\n\`\`\`\n`,
        offset: 0
      },
      classDiagram: {
        code: `\n\`\`\`mermaid\nclassDiagram\n    class Animal {\n        +String name\n        +makeSound()\n    }\n    class Dog {\n        +fetch()\n    }\n    Animal <|-- Dog\n\`\`\`\n`,
        offset: 0
      },
      gantt: {
        code: `\n\`\`\`mermaid\ngantt\n    title 项目计划\n    dateFormat YYYY-MM-DD\n    section 阶段\n    需求 :a1, 2024-01-01, 7d\n    开发 :a2, after a1, 14d\n    测试 :a3, after a2, 7d\n\`\`\`\n`,
        offset: 0
      },
      pie: {
        code: `\n\`\`\`mermaid\npie title 数据分布\n    \"A\" : 40\n    \"B\" : 30\n    \"C\" : 20\n    \"D\" : 10\n\`\`\`\n`,
        offset: 0
      },
      stateDiagram: {
        code: `\n\`\`\`mermaid\nstateDiagram-v2\n    [*] --> 待处理\n    待处理 --> 处理中: 开始\n    处理中 --> 已完成: 完成\n    已完成 --> [*]\n\`\`\`\n`,
        offset: 0
      }
    }
    const t = templates[type] ?? templates.flowchart
    insertText(t.code, '', '', t.code.indexOf('mermaid') + 8) // 光标落在 ```mermaid 之后
  }, [insertText])

  // 通用：选中多行文本时整段前缀；单行时只对当前行加
  const prefixLines = useCallback((prefix: string) => {
    const view = (codeEditorRef.current as any)?.view
    if (!view) return
    // 直接调 CodeMirror：所有选中行行首加前缀
    const { state, dispatch } = view
    const sel = state.selection.main
    const fromLine = state.doc.lineAt(sel.from)
    const toLine = state.doc.lineAt(sel.to)
    const changes = []
    for (let i = fromLine.number; i <= toLine.number; i++) {
      const line = state.doc.line(i)
      changes.push({ from: line.from, insert: prefix })
    }
    dispatch({ changes })
    view.focus()
  }, [])

  const handleFormatCode = useCallback(() => {
    const result = codeEditorRef.current?.formatCode()
    if (!result) return
    if (!result.ok && result.message) {
      toast.error(result.message)
    } else if (result.ok && result.message) {
      // 成功 + 提示，短暂显示在 saveStatus（复用 setSaveStatus 通道）
      setSaveStatus({ saving: false, lastSaved: Date.now() })
    }
  }, [])

  const fontSize = settings?.fontSize ?? 14

  // 加密笔记检测：locked 由主进程判定（受密码保护且本进程未解锁 / 密文没解开）；
  // 再用 looksLikeCiphertext 兜一层，任何情况下都不会把密文当正文显示。
  // 解锁入口统一走全局密码弹窗（promptUnlockNote），编辑器里不再放第二个输入框。
  const needsUnlock = !!(currentNote?.locked || looksLikeCiphertext(currentNote?.content))

  if (!currentNote) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-tertiary)',
        gap: 12
      }}>
        <FileText size={48} opacity={0.3} />
        <p>选择一篇笔记开始编辑</p>
        <p style={{ fontSize: 12 }}>或点击左侧"新建"创建笔记</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }} data-editor-dark={settings?.editorDark === true ? 'true' : undefined}>
      {needsUnlock && (
        // zIndex 必须高于下面的编辑器工具条（同为绝对定位），否则锁定状态下标题栏还会露在上面
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, background: 'var(--bg-primary)', zIndex: 20 }}>
          <Lock size={48} opacity={0.3} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>此笔记受密码保护</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>需要输入密码才能查看内容</div>
          <button
            onClick={() => useAppStore.getState().promptUnlockNote(currentNote.id)}
            style={{ marginTop: 4, padding: '8px 20px', fontSize: 13, borderRadius: 6, border: 'none', background: 'var(--accent-color)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Unlock size={14} /> 输入密码
          </button>
        </div>
      )}
      {conflictNoteId === currentNote.id && !needsUnlock && (
        // 冲突条：外部（git pull / 另一端）改了内容，本地还有未保存修改。
        // 两份都保留着，等用户显式选择，绝不静默丢内容。
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          flexShrink: 0,
          fontSize: 12,
          color: 'var(--text-primary)',
          background: appIsDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.14)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.45)',
          zIndex: 11
        }}>
          <AlertCircle size={14} color="#f59e0b" />
          <span style={{ flex: 1, minWidth: 0 }}>
            这篇笔记在外部被更新过（git 同步 / 另一端），而你本地还有未保存的修改。两份都已保留，请选择以哪一份为准。
          </span>
          <button
            onClick={resolveKeepLocal}
            style={{ padding: '3px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--accent-color)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}
          >
            保留我的版本
          </button>
          <button
            onClick={resolveUseRemote}
            style={{ padding: '3px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0 }}
          >
            用外部版本
          </button>
        </div>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 'var(--header-height)',
        minHeight: 'var(--header-height)',
        padding: '0 16px',
        backgroundColor: settings?.editorDark ? '#1e1e1e' : 'var(--bg-primary)',
        flexShrink: 0,
        boxSizing: 'border-box',
        marginLeft: -1,
        marginRight: -1,
        position: 'relative',
        zIndex: 10,
        boxShadow: currentNote?.format === 'code'
          ? (shadowDark ? '0 2px 3px -1px rgba(0,0,0,0.35)' : '0 2px 3px -1px rgba(0,0,0,0.08)')
          : undefined
      }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题..."
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            fontSize: 16,
            fontWeight: 600,
            padding: 0,
            color: settings?.editorDark ? '#e8e8e8' : 'var(--text-primary)',
            outline: 'none'
          }}
        />
                {currentNote?.format !== 'richtext' && currentNote?.format !== 'code' && currentNote?.format !== 'spreadsheet' && !previewVisible && (
          <button
            className="panel-action-btn"
            onClick={togglePreview}
            title="展开预览"
          >
            <PanelRightOpen size={16} />
          </button>
        )}
        {/* 美化（格式化代码）：仅 code 类型且 language 在 CodeEditor 支持列表内才显示 */}
        {currentNote && currentNote.format === 'code' && isFormatableLanguage(currentNote.language) && (
          <button
            className="panel-action-btn"
            onClick={handleFormatCode}
            title={`美化代码（${getLangLabel(currentNote.language)}）`}
          >
            <Wand2 size={16} />
          </button>
        )}
        {/* 美化 HTML */}
        {currentNote && currentNote.format === 'html' && (
          <button
            className="panel-action-btn"
            onClick={handleFormatCode}
            title="美化 HTML"
          >
            <Wand2 size={16} />
          </button>
        )}
        {/* 更多设置：自动换行 / 编辑器暗色模式 / Git历史 / AI写作 / 保存 */}
        <div ref={moreMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            className="panel-action-btn"
            onClick={() => setMoreMenuOpen(o => !o)}
            title="编辑器设置"
          >
            <MoreHorizontal size={16} />
          </button>
          {moreMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                minWidth: 180,
                padding: 4,
                borderRadius: 8,
                background: settings?.editorDark ? '#252526' : 'var(--bg-primary)',
                color: settings?.editorDark ? '#e8e8e8' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                zIndex: 1000,
              }}
            >
              {currentNote?.format !== 'spreadsheet' && (
                <MenuButton
                  dark={settings?.editorDark === true}
                  active={settings?.wordWrap === true}
                  label="自动换行"
                  icon={<WrapText size={14} style={{ flexShrink: 0 }} />}
                  onClick={() => updateSettings({ wordWrap: !(settings?.wordWrap === true) })}
                />
              )}
              {!appIsDark && (
                <MenuButton
                  dark={settings?.editorDark === true}
                  active={settings?.editorDark === true}
                  label={settings?.editorDark === true ? '默认编辑器' : '暗黑编辑器'}
                  icon={settings?.editorDark === true
                    ? <Sun size={14} style={{ flexShrink: 0 }} />
                    : <Moon size={14} style={{ flexShrink: 0 }} />}
                  onClick={() => updateSettings({ editorDark: !(settings?.editorDark === true) })}
                />
              )}
              {currentNote && !['url', 'file'].includes(currentNote.format) && (
                <>
                  <MenuDivider />
                  {currentNote.format === 'spreadsheet' ? (
                    <MenuButton
                      dark={settings?.editorDark === true}
                      label="导出为 Excel"
                      icon={<Download size={14} style={{ flexShrink: 0 }} />}
                      onClick={handleExportExcel}
                    />
                  ) : (
                    <>
                      <MenuButton
                        dark={settings?.editorDark === true}
                        label="Git 历史快照"
                        icon={<History size={14} style={{ flexShrink: 0 }} />}
                        onClick={() => { setMoreMenuOpen(false); window.dispatchEvent(new CustomEvent('inkslate:open-history')) }}
                      />
                      <MenuButton
                        dark={settings?.editorDark === true}
                        label="AI 写作"
                        icon={<Bot size={14} style={{ flexShrink: 0 }} />}
                        onClick={() => { setMoreMenuOpen(false); window.dispatchEvent(new CustomEvent('inkslate:open-ai-panel')) }}
                      />
                    </>
                  )}
                  <MenuButton
                    dark={settings?.editorDark === true}
                    label="保存"
                    icon={<Save size={14} style={{ flexShrink: 0 }} />}
                    onClick={() => { setMoreMenuOpen(false); handleSave() }}
                  />
                </>
              )}
            </div>
          )}
        </div>
    </div>

            {currentNote.format === 'markdown' && (
        <div style={{
          display: 'flex',
          gap: 2,
          padding: '4px 8px',
          backgroundColor: settings?.editorDark ? '#1e1e1e' : 'var(--bg-primary)',
          flexShrink: 0,
          marginLeft: -1,
          marginRight: -1,
          flexWrap: 'wrap',
          position: 'relative',
          zIndex: 1,
          boxShadow: shadowDark ? '0 2px 3px -1px rgba(0,0,0,0.35)' : '0 2px 3px -1px rgba(0,0,0,0.08)'
        }}>
          <ToolbarBtn icon={<Bold size={14} />} title="粗体 (Ctrl+B)" onClick={() => insertText('**', '**', 'bold')} />
          <ToolbarBtn icon={<Italic size={14} />} title="斜体 (Ctrl+I)" onClick={() => insertText('*', '*', 'italic')} />
          <ToolbarBtn icon={<Underline size={14} />} title="下划线" onClick={() => insertText('<u>', '</u>', 'text')} />
          <ToolbarBtn icon={<Strikethrough size={14} />} title="删除线" onClick={() => insertText('~~', '~~', 'text')} />
          <ToolbarBtn icon={<Highlighter size={14} />} title="高亮 (==text==)" onClick={() => insertText('==', '==', 'text')} />
          <Divider />
          <ToolbarBtn icon={<Heading1 size={14} />} title="标题 1" onClick={() => insertText('\n# ', '\n', 'heading')} />
          <ToolbarBtn icon={<Heading2 size={14} />} title="标题 2" onClick={() => insertText('\n## ', '\n', 'heading')} />
          <ToolbarBtn icon={<Heading3 size={14} />} title="标题 3" onClick={() => insertText('\n### ', '\n', 'heading')} />
          <ToolbarBtn icon={<Heading4 size={14} />} title="标题 4" onClick={() => insertText('\n#### ', '\n', 'heading')} />
          <Divider />
          <ToolbarBtn icon={<Link size={14} />} title="链接" onClick={() => insertText('[', '](https://)', 'link')} />
          <ToolbarBtn icon={<Image size={14} />} title="图片" onClick={() => insertText('![', '](https://)', 'alt')} />
          <ToolbarBtn icon={<Code size={14} />} title="行内代码" onClick={() => insertText('`', '`', 'code')} />
          <ToolbarBtn icon={<Code2 size={14} />} title="代码块" onClick={() => {
            const t = '\n```js\n\n```\n'
            insertText(t, '', '', t.indexOf('\n', 4) + 1)
          }} />
          <Divider />
          <ToolbarBtn icon={<List size={14} />} title="无序列表" onClick={() => insertText('\n- ', '\n', 'item')} />
          <ToolbarBtn icon={<ListOrdered size={14} />} title="有序列表" onClick={() => insertText('\n1. ', '\n', 'item')} />
          <ToolbarBtn icon={<ListTodo size={14} />} title="任务列表" onClick={() => insertText('\n- [ ] ', '\n', 'task')} />
          <ToolbarBtn icon={<ListChecks size={14} />} title="勾选任务" onClick={() => insertText('\n- [x] ', '\n', 'done')} />
          <ToolbarBtn icon={<Quote size={14} />} title="引用" onClick={() => insertText('\n> ', '\n', 'quote')} />
          <ToolbarBtn icon={<Minus size={14} />} title="分割线" onClick={() => insertText('\n---\n', '', '')} />
          <Divider />
          <ToolbarBtn icon={<Table size={14} />} title="插入表格" onClick={() => setTableDlg({ open: true, rows: 3, cols: 3 })} />
          <Divider />
          <ToolbarBtn icon={<Sigma size={14} />} title="行内公式 $E=mc^2$" onClick={() => insertText('$', '$', 'E=mc^2')} />
          <ToolbarBtn icon={<SquareSigma size={14} />} title="公式块" onClick={() => {
            const t = '\n$$\nE = mc^2\n$$\n'
            insertText(t, '', '', t.indexOf('E ='))
          }} />
          <MermaidMenu onInsert={insertMermaid} />
        </div>
      )}
      {currentNote.format === 'html' && (
        <div style={{
          display: 'flex',
          gap: 2,
          padding: '4px 8px',
          backgroundColor: settings?.editorDark ? '#1e1e1e' : 'var(--bg-primary)',
          flexShrink: 0,
          marginLeft: -1,
          marginRight: -1,
          flexWrap: 'wrap',
          position: 'relative',
          zIndex: 1,
          boxShadow: shadowDark ? '0 2px 3px -1px rgba(0,0,0,0.35)' : '0 2px 3px -1px rgba(0,0,0,0.08)'
        }}>
          <ToolbarBtn icon={<Bold size={14} />} title="粗体 (Ctrl+B)" onClick={() => insertText('<b>', '</b>', 'text')} />
          <ToolbarBtn icon={<Italic size={14} />} title="斜体 (Ctrl+I)" onClick={() => insertText('<i>', '</i>', 'text')} />
          <ToolbarBtn icon={<Underline size={14} />} title="下划线" onClick={() => insertText('<u>', '</u>', 'text')} />
          <ToolbarBtn icon={<Strikethrough size={14} />} title="删除线" onClick={() => insertText('<del>', '</del>', 'text')} />
          <ToolbarBtn icon={<Highlighter size={14} />} title="高亮" onClick={() => insertText('<mark>', '</mark>', 'text')} />
          <Divider />
          <ToolbarBtn icon={<Heading1 size={14} />} title="一级标题" onClick={() => insertText('\n<h1>', '</h1>\n', 'text')} />
          <ToolbarBtn icon={<Heading2 size={14} />} title="二级标题" onClick={() => insertText('\n<h2>', '</h2>\n', 'text')} />
          <ToolbarBtn icon={<Heading3 size={14} />} title="三级标题" onClick={() => insertText('\n<h3>', '</h3>\n', 'text')} />
          <ToolbarBtn icon={<Heading4 size={14} />} title="四级标题" onClick={() => insertText('\n<h4>', '</h4>\n', 'text')} />
          <Divider />
          <ToolbarBtn icon={<Link size={14} />} title="超链接" onClick={() => insertText('<a href="https://">', '</a>', 'text')} />
          <ToolbarBtn icon={<Image size={14} />} title="图片" onClick={() => insertText('<img src="https://" alt="', '" />', 'text')} />
          <ToolbarBtn icon={<Code size={14} />} title="行内代码" onClick={() => insertText('<code>', '</code>', 'code')} />
          <ToolbarBtn icon={<Code2 size={14} />} title="代码块" onClick={() => {
            const t = '\n<pre><code>\n\n</code></pre>\n'
            insertText(t, '', '', t.indexOf('\n', 4) + 1)
          }} />
          <Divider />
          <ToolbarBtn icon={<List size={14} />} title="无序列表" onClick={() => {
            const t = '\n<ul>\n  <li></li>\n</ul>\n'
            insertText(t, '', '', t.indexOf('<li>') + 4)
          }} />
          <ToolbarBtn icon={<ListOrdered size={14} />} title="有序列表" onClick={() => {
            const t = '\n<ol>\n  <li></li>\n</ol>\n'
            insertText(t, '', '', t.indexOf('<li>') + 4)
          }} />
          <ToolbarBtn icon={<ListChecks size={14} />} title="复选框" onClick={() => insertText('<input type="checkbox"> ', '', '')} />
          <ToolbarBtn icon={<Quote size={14} />} title="引用块" onClick={() => insertText('<blockquote>', '</blockquote>', 'text')} />
          <ToolbarBtn icon={<Minus size={14} />} title="分割线" onClick={() => insertText('\n<hr>\n', '', '')} />
          <ToolbarBtn icon={<ListTodo size={14} />} title="换行" onClick={() => insertText('<br>\n', '', '')} />
          <Divider />
          <ToolbarBtn icon={<Table size={14} />} title="插入表格" onClick={() => {
            const t = '\n<table>\n  <tr><th></th></tr>\n  <tr><td></td></tr>\n</table>\n'
            insertText(t, '', '', t.indexOf('<th>') + 4)
          }} />
          <Divider />
          <ToolbarBtn icon={<Sigma size={14} />} title="行内公式" onClick={() => insertText('<span class="katex">', '</span>', 'E=mc^2')} />
          <ToolbarBtn icon={<SquareSigma size={14} />} title="公式块" onClick={() => {
            const t = '\n<div class="katex-block">\nE = mc^2\n</div>\n'
            insertText(t, '', '', t.indexOf('E ='))
          }} />
        </div>
      )}

      {/* 表格弹窗（Markdown 模式） */}
      {currentNote.format === 'markdown' && createPortal(
        <ModalShell
          open={tableDlg.open}
          title="插入 Markdown 表格"
          onClose={() => setTableDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmMarkdownTable}
          confirmText="插入"
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="行数（含表头）">
              <input
                type="number"
                min={2}
                max={20}
                value={tableDlg.rows}
                onChange={e => setTableDlg(d => ({ ...d, rows: Math.max(2, Math.min(20, parseInt(e.target.value) || 2)) }))}
                style={inputStyle}
              />
            </Field>
            <Field label="列数">
              <input
                type="number"
                min={2}
                max={8}
                value={tableDlg.cols}
                onChange={e => setTableDlg(d => ({ ...d, cols: Math.max(2, Math.min(8, parseInt(e.target.value) || 2)) }))}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            将插入 {tableDlg.rows} 行 × {tableDlg.cols} 列的 GFM 表格，光标落在第一个单元格
          </div>
        </ModalShell>,
        document.body
      )}

      {currentNote.format === 'url' && (
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color)',
          background: settings?.editorDark ? '#2a2a2b' : 'var(--bg-tertiary)',
          flexShrink: 0,
          alignItems: 'center',
          marginLeft: -1,
          marginRight: -1
        }}>
          <Link2 size={14} color="var(--text-tertiary)" />
          <input
            value={currentNote.url ?? ''}
            placeholder="https://..."
            onChange={(e) => {
              // 直接改 url（不进本地 draft state，url 即内容）
              const newUrl = e.target.value
              updateNote(currentNote.id, { url: newUrl })
            }}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              color: 'var(--text-primary)',
              padding: 0,
              outline: 'none',
              fontFamily: 'var(--font-mono)'
            }}
          />
        </div>
      )}

            {/* 锁定状态（受密码保护且未解锁）不挂载编辑器：此时 content 是密文，
                既不该显示密文，也不该让自动保存把密文/空内容写回去 */}
            {!needsUnlock && (currentNote.format === 'spreadsheet' ? (
        <SpreadsheetEditor
          noteId={currentNote.id}
          value={content}
          onChange={(j) => {
            spreadsheetDirtyRef.current = true
            setContent(j)
          }}
        />
      ) : currentNote.format === 'richtext' ? (
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          background: settings?.editorDark ? '#1e1e1e' : 'var(--bg-primary)',
          minHeight: 0
        }}>
          <RichTextEditor
            ref={richtextEditorRef}
            value={content}
            onChange={setContent}
            fontSize={fontSize}
            editorDark={shadowDark}
            noteFilePath={currentNote.path}
          />
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}>
          <CodeEditor
            key={currentNote.id}
            ref={codeEditorRef}
            value={content}
            onChange={setContent}
            fontSize={fontSize}
            format={currentNote.format as 'markdown' | 'html' | 'code'}
            language={currentNote.language}
            onSave={stableSave}
          />
        </div>
      ))}
    </div>
  )
}

/**
 */
const RichTextEditor = forwardRef<{ setHTML: (html: string) => void }, {
  value: string
  onChange: (v: string) => void
  fontSize: number
  editorDark: boolean
  noteFilePath?: string
}>(function RichTextEditor({ value, onChange, fontSize, editorDark, noteFilePath }, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef(false)
  // 图片选中 + 缩放
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null)
  const [imgBox, setImgBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number; img: HTMLImageElement } | null>(null)

  useImperativeHandle(ref, () => ({
    setHTML: (html: string) => {
      if (editorRef.current) {
        isInternalUpdate.current = true
        editorRef.current.innerHTML = html
        setSelectedImage(null)
        onChange(htmlToValue(editorRef.current.innerHTML))
      }
    }
  }))

  // 弹窗状态
  const [linkDlg, setLinkDlg] = useState({ open: false, url: '', text: '' })
  const [imageDlg, setImageDlg] = useState<{ open: boolean; url: string; alt: string; busy: boolean; sourcePath?: string; localName?: string }>({ open: false, url: '', alt: '', busy: false })
  const [tableDlg, setTableDlg] = useState({ open: false, rows: 3, cols: 3 })

  // 绝对路径 → 可被 Chromium 正确加载的 file:// URL（编码中文/空格等字符）
  const toFileUrl = (absPath: string): string => {
    let normalized = absPath.replace(/\\/g, '/')
    if (!normalized.startsWith('/')) normalized = `/${normalized}`
    return `file://${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
  }

  // 相对路径（assets/xxx.png）→ file:// 绝对路径用于显示；data/http/file 原样返回
  const resolveImageSrc = (rawSrc: string): string => {
    if (!rawSrc) return ''
    if (/^(?:data|https?|blob|file):/i.test(rawSrc)) return rawSrc
    // Windows 绝对路径 / POSIX 绝对路径直接转 file://
    if (/^[a-zA-Z]:[\\/]/.test(rawSrc) || rawSrc.startsWith('/')) return toFileUrl(rawSrc)
    if (!noteFilePath) return rawSrc
    const noteDir = noteFilePath.replace(/[\\/][^\\/]+$/, '')
    const rel = rawSrc.replace(/^\.?[\\/]/, '').replace(/\\/g, '/')
    return toFileUrl(`${noteDir}/${rel}`)
  }

  // ===== 图片选中 / 拖动缩放 =====
  const updateImgBox = () => {
    const img = selectedImage
    const wrapper = wrapperRef.current
    if (!img || !wrapper || !img.isConnected) {
      setImgBox(null)
      return
    }
    const wr = wrapper.getBoundingClientRect()
    const ir = img.getBoundingClientRect()
    setImgBox({ top: ir.top - wr.top, left: ir.left - wr.left, width: ir.width, height: ir.height })
  }

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target && target.tagName === 'IMG' && target.getAttribute('data-richtext-image') !== null) {
      setSelectedImage(target as HTMLImageElement)
    } else {
      setSelectedImage(null)
    }
  }

  const startImageResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const img = selectedImage
    if (!img) return
    const ir = img.getBoundingClientRect()
    resizeStateRef.current = { startX: e.clientX, startWidth: ir.width, img }
    const onMove = (ev: MouseEvent) => {
      const st = resizeStateRef.current
      if (!st) return
      // 以编辑器可视宽度为上限，保持宽高比（height:auto）
      const maxW = wrapperRef.current ? Math.max(40, wrapperRef.current.clientWidth - 48) : 4000
      const w = Math.max(40, Math.min(maxW, st.startWidth + (ev.clientX - st.startX)))
      st.img.style.width = `${Math.round(w)}px`
      st.img.style.height = 'auto'
      st.img.setAttribute('data-richtext-width', String(Math.round(w)))
      updateImgBox()
    }
    const onUp = () => {
      resizeStateRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      handleInput()
      updateImgBox()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    if (!selectedImage) {
      setImgBox(null)
      return
    }
    updateImgBox()
    const onWinResize = () => updateImgBox()
    window.addEventListener('resize', onWinResize)
    return () => window.removeEventListener('resize', onWinResize)
  }, [selectedImage])

  // 鎶?JSON 杞垚 HTML 鐢ㄤ簬鏄剧ず
  const valueToHtml = (jsonStr: string): string => {
    try {
      const doc = JSON.parse(jsonStr)
      const renderNode = (node: any): string => {
        if (!node) return ''
        if (node.type === 'text') {
          let text = escapeHtml(node.text || '')
          if (node.marks) {
            for (const m of node.marks) {
              if (m.type === 'bold') text = `<strong>${text}</strong>`
              if (m.type === 'italic') text = `<em>${text}</em>`
              if (m.type === 'underline') text = `<u>${text}</u>`
              if (m.type === 'code') text = `<span class="rt-inline-code">${text}</span>`
              if (m.type === 'link') text = `<a href="${escapeHtml(m.attrs?.href || '#')}" target="_blank" rel="noopener">${text}</a>`
            }
          }
          return text
        }
        if (node.type === 'paragraph') {
          return `<p>${(node.content || []).map(renderNode).join('')}</p>`
        }
        if (node.type === 'heading') {
          const level = node.attrs?.level || 1
          return `<h${level}>${(node.content || []).map(renderNode).join('')}</h${level}>`
        }
        if (node.type === 'bulletList') {
          return `<ul>${(node.content || []).map(renderNode).join('')}</ul>`
        }
        if (node.type === 'orderedList') {
          return `<ol>${(node.content || []).map(renderNode).join('')}</ol>`
        }
        if (node.type === 'listItem') {
          return `<li>${(node.content || []).map(renderNode).join('')}</li>`
        }
        if (node.type === 'blockquote') {
          return `<blockquote>${(node.content || []).map(renderNode).join('')}</blockquote>`
        }
        if (node.type === 'hardBreak') {
          return '<br>'
        }
        if (node.type === 'code_block') {
          const text = (node.content || []).map((n: any) => n.text || '').join('')
          return `<div class="rt-code-block">${escapeHtml(text)}</div>`
        }
        if (node.type === 'image') {
          const rawSrc = node.attrs?.src || ''
          const alt = escapeHtml(node.attrs?.alt || '')
          const width = node.attrs?.width
          // 相对路径（assets/xxx.png）→ 解析为 file:// 绝对路径用于显示
          const src = escapeHtml(resolveImageSrc(rawSrc))
          const widthStyle = width > 0 ? `width: ${width}px;` : ''
          const widthAttr = width > 0 ? ` data-richtext-width="${width}"` : ''
          return `<img src="${src}" alt="${alt}" draggable="false" data-richtext-image="1" data-richtext-src="${escapeHtml(rawSrc)}"${widthAttr} style="max-width: 100%; ${widthStyle}">`
        }
        if (node.type === 'table') {
          return `<table data-richtext-table="1" style="border-collapse: collapse; width: 100%;">${(node.content || []).map(renderNode).join('')}</table>`
        }
        if (node.type === 'tableRow') {
          return `<tr>${(node.content || []).map(renderNode).join('')}</tr>`
        }
        if (node.type === 'tableCell') {
          return `<td style="border: 1px solid #ddd; padding: 6px; min-width: 40px;">${(node.content || []).map(renderNode).join('')}</td>`
        }
        return ''
      }
      return (doc.content || []).map(renderNode).join('')
    } catch {
      return '<p></p>'
    }
  }

  // 鎶?HTML 杞垚 JSON
  const htmlToValue = (html: string): string => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html

    const parseInline = (node: Node): any => {
      if (node.nodeType === Node.TEXT_NODE) {
        return { type: 'text', text: node.textContent || '' }
      }
      const el = node as HTMLElement
      const tag = el.tagName?.toLowerCase()
      const className = el.className || ''
      if (tag === 'img') {
        // 优先取 data-richtext-src（原始相对路径），否则用 src
        const src = el.getAttribute('data-richtext-src') || el.getAttribute('src') || ''
        const widthAttr = el.getAttribute('data-richtext-width') || ''
        const attrs: { src: string; alt: string; width?: number } = {
          src,
          alt: el.getAttribute('alt') || ''
        }
        const width = parseInt(widthAttr, 10)
        if (width > 0) attrs.width = width
        return { type: 'image', attrs }
      }
      if (tag === 'br') {
        return { type: 'hardBreak' }
      }
      // 优先用 className 识别自定义的 inline code / code block
      if (className.includes('rt-inline-code') || tag === 'code') {
        return { type: 'text', text: el.textContent || '', marks: [{ type: 'code' }] }
      }
      if (className.includes('rt-code-block') || tag === 'pre') {
        return { type: 'code_block', content: [{ type: 'text', text: el.textContent || '' }] }
      }
      const text = { type: 'text', text: el.textContent || '' }
      if (tag === 'strong' || tag === 'b') return { type: 'text', text: el.textContent || '', marks: [{ type: 'bold' }] }
      if (tag === 'em' || tag === 'i') return { type: 'text', text: el.textContent || '', marks: [{ type: 'italic' }] }
      if (tag === 'u') return { type: 'text', text: el.textContent || '', marks: [{ type: 'underline' }] }
      if (tag === 'a') return { type: 'text', text: el.textContent || '', marks: [{ type: 'link', attrs: { href: el.getAttribute('href') || '#' } }] }
      return text
    }

    const parseBlock = (node: Element): any => {
      const tag = node.tagName?.toLowerCase()
      const className = (node as HTMLElement).className || ''
      // 优先识别自定义的 code block className
      if (className.includes('rt-code-block') || tag === 'pre') {
        return { type: 'code_block', content: [{ type: 'text', text: node.textContent || '' }] }
      }
      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
        return { type: 'heading', attrs: { level: parseInt(tag[1]) }, content: [{ type: 'paragraph', content: [parseInline(node.firstChild || document.createTextNode(''))] }] }
      }
      if (tag === 'p' || !tag) {
        const content: any[] = []
        for (const child of Array.from(node.childNodes)) {
          const inline = parseInline(child)
          if (inline) content.push(inline)
        }
        if (content.length === 0) content.push({ type: 'text', text: '' })
        return { type: 'paragraph', content }
      }
      if (tag === 'ul') {
        return { type: 'bulletList', content: Array.from(node.children).map(li => parseBlock(li)) }
      }
      if (tag === 'ol') {
        return { type: 'orderedList', content: Array.from(node.children).map(li => parseBlock(li)) }
      }
      if (tag === 'li') {
        return { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }] }
      }
      if (tag === 'blockquote') {
        return { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }] }
      }
      if (tag === 'table') {
        return {
          type: 'table',
          content: Array.from(node.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr')).map(tr => parseBlock(tr))
        }
      }
      if (tag === 'tr') {
        return {
          type: 'tableRow',
          content: Array.from(node.children).map(td => parseBlock(td as Element))
        }
      }
      if (tag === 'td' || tag === 'th') {
        return {
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }]
        }
      }
      return { type: 'paragraph', content: [{ type: 'text', text: node.textContent || '' }] }
    }

    try {
      const content = Array.from(tmp.children).map(parseBlock)
      if (content.length === 0) content.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] })
      return JSON.stringify({ type: 'doc', content })
    } catch {
      return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] })
    }
  }

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      editorRef.current.innerHTML = valueToHtml(value)
      setSelectedImage(null)
    }
    isInternalUpdate.current = false
  }, [value])

  const handleInput = () => {
    if (editorRef.current) {
      isInternalUpdate.current = true
      onChange(htmlToValue(editorRef.current.innerHTML))
    }
    // 选中的图片被删除时收起缩放框
    if (selectedImage && !selectedImage.isConnected) setSelectedImage(null)
  }

  // 在 code block 内按 Enter 时光标跳到后面的段落
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !editorRef.current) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const node = sel.anchorNode
    if (!node) return
    // 找到最近的祖先元素
    let el: HTMLElement | null = node.nodeType === 1 ? (node as HTMLElement) : (node.parentElement as HTMLElement)
    let codeBlock: HTMLElement | null = null
    while (el) {
      if (el.classList?.contains('rt-code-block')) { codeBlock = el; break }
      el = el.parentElement
    }
    if (!codeBlock) return
    // 光标在 code block 内：阻止默认行为，手动插入新段落
    e.preventDefault()
    const after = codeBlock.nextElementSibling as HTMLElement | null
    if (after && after.tagName === 'P') {
      // 已有段落，把光标移过去
      const range = document.createRange()
      range.setStart(after, 0)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      // 兜底：插入一个 <p><br></p>
      document.execCommand('insertHTML', false, '<p><br></p>')
    }
    handleInput()
  }

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    handleInput()
  }

  // ============== 弹窗处理 ==============
  const confirmLink = () => {
    if (!linkDlg.url) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) {
      // 有选中文本 → 用 createLink 包裹
      exec('createLink', linkDlg.url)
    } else {
      // 无选中文本 → 插入 <a>text</a>
      const text = linkDlg.text || linkDlg.url
      exec('insertHTML', `<a href="${escapeHtml(linkDlg.url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>&nbsp;`)
    }
    setLinkDlg(d => ({ ...d, open: false }))
  }

  const pickLocalImage = async () => {
    const [filePath] = await window.inkslateApi.file.openDialog({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      properties: ['openFile']
    })
    if (!filePath) return
    const localName = filePath.split(/[\\/]/).pop() || filePath
    setImageDlg(d => ({ ...d, url: '', localName, sourcePath: filePath, busy: false }))
  }

  const confirmImage = async () => {
    const alt = imageDlg.alt || 'image'

    // 本地图片：先复制进笔记文件库（笔记同级的 assets/），正文只保存相对路径，
    // 这样图片会跟着笔记一起被 git 同步，而不是引用用户电脑上的原始路径。
    if (imageDlg.sourcePath) {
      if (!noteFilePath) {
        toast.error('当前笔记还没有保存路径，暂时无法导入图片')
        return
      }
      setImageDlg(d => ({ ...d, busy: true }))
      try {
        const relativePath = await window.inkslateApi.file.saveAsset(noteFilePath, imageDlg.sourcePath)
        if (!relativePath) throw new Error('无法读取源图片')
        const displaySrc = resolveImageSrc(relativePath)
        exec('insertHTML', `<img src="${escapeHtml(displaySrc)}" alt="${escapeHtml(alt)}" draggable="false" data-richtext-image="1" data-richtext-src="${escapeHtml(relativePath)}" style="max-width: 100%;">`)
        setImageDlg(d => ({ ...d, open: false, busy: false, url: '', sourcePath: undefined, localName: undefined }))
      } catch (e) {
        toast.error('保存图片到笔记失败：' + (e as Error).message)
        setImageDlg(d => ({ ...d, busy: false }))
      }
      return
    }

    if (!imageDlg.url) return
    exec('insertHTML', `<img src="${escapeHtml(imageDlg.url)}" alt="${escapeHtml(alt)}" draggable="false" data-richtext-image="1" style="max-width: 100%;">`)
    setImageDlg(d => ({ ...d, open: false }))
  }

  const confirmTable = () => {
    const rows = Math.max(1, Math.min(20, tableDlg.rows))
    const cols = Math.max(1, Math.min(10, tableDlg.cols))
    let html = '<table data-richtext-table="1" style="border-collapse: collapse; width: 100%;">'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) {
        html += '<td style="border: 1px solid #ddd; padding: 6px; min-width: 40px;">&nbsp;</td>'
      }
      html += '</tr>'
    }
    html += '</table>'
    exec('insertHTML', html)
    setTableDlg(d => ({ ...d, open: false }))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
        display: 'flex',
        gap: 2,
        padding: '4px 8px',
        backgroundColor: editorDark ? '#1e1e1e' : 'var(--bg-primary)',
        flexShrink: 0,
        flexWrap: 'wrap',
        position: 'relative',
        zIndex: 1,
        boxShadow: editorDark ? '0 2px 3px -1px rgba(0,0,0,0.35)' : '0 2px 3px -1px rgba(0,0,0,0.08)'
      }}>
        <ToolbarBtn icon={<Undo2 size={14} />} title="撤销 (Ctrl+Z)" onClick={() => exec('undo')} />
        <ToolbarBtn icon={<Redo2 size={14} />} title="重做 (Ctrl+Shift+Z)" onClick={() => exec('redo')} />
        <Divider />
        <ToolbarBtn icon={<Bold size={14} />} title="粗体 (Ctrl+B)" onClick={() => exec('bold')} />
        <ToolbarBtn icon={<Italic size={14} />} title="斜体 (Ctrl+I)" onClick={() => exec('italic')} />
        <ToolbarBtn icon={<Underline size={14} />} title="下划线 (Ctrl+U)" onClick={() => exec('underline')} />
        <ToolbarBtn icon={<Strikethrough size={14} />} title="删除线" onClick={() => exec('strikeThrough')} />
        <Divider />
        <ToolbarBtn icon={<Pilcrow size={14} />} title="段落" onClick={() => exec('formatBlock', '<p>')} />
        <ToolbarBtn icon={<Heading1 size={14} />} title="标题 1" onClick={() => exec('formatBlock', '<h1>')} />
        <ToolbarBtn icon={<Heading2 size={14} />} title="标题 2" onClick={() => exec('formatBlock', '<h2>')} />
        <ToolbarBtn icon={<Heading3 size={14} />} title="标题 3" onClick={() => exec('formatBlock', '<h3>')} />
        <ToolbarBtn icon={<Quote size={14} />} title="引用" onClick={() => exec('formatBlock', '<blockquote>')} />
        <Divider />
        <ToolbarBtn icon={<List size={14} />} title="无序列表" onClick={() => exec('insertUnorderedList')} />
        <ToolbarBtn icon={<ListOrdered size={14} />} title="有序列表" onClick={() => exec('insertOrderedList')} />
        <ToolbarBtn icon={<ListChecks size={14} />} title="待办列表" onClick={() => exec('insertHTML', '<ul style="list-style: none; padding-left: 0;"><li><input type="checkbox"> 待办项</li></ul>')} />
        <ToolbarBtn icon={<Indent size={14} />} title="增加缩进" onClick={() => exec('indent')} />
        <ToolbarBtn icon={<Outdent size={14} />} title="减少缩进" onClick={() => exec('outdent')} />
        <Divider />
        <ToolbarBtn icon={<AlignLeft size={14} />} title="左对齐" onClick={() => exec('justifyLeft')} />
        <ToolbarBtn icon={<AlignCenter size={14} />} title="居中" onClick={() => exec('justifyCenter')} />
        <ToolbarBtn icon={<AlignRight size={14} />} title="右对齐" onClick={() => exec('justifyRight')} />
        <ToolbarBtn icon={<Link size={14} />} title="插入链接" onClick={() => setLinkDlg({ open: true, url: 'https://', text: window.getSelection()?.toString() || '' })} />
        <ToolbarBtn icon={<Image size={14} />} title="插入图片" onClick={() => setImageDlg({ open: true, url: '', alt: '', busy: false })} />
        <ToolbarBtn icon={<Code size={14} />} title="行内代码" onClick={() => {
          const sel = window.getSelection()?.toString() || '代码'
          exec('insertHTML', `<span class="rt-inline-code">${sel}</span>`)
          // 在 inline code 后插入零宽字符，让光标离开 inline code
          exec('insertHTML', '&#8203;')
        }} />
        <ToolbarBtn icon={<Code2 size={14} />} title="代码块" onClick={() => {
          const sel = window.getSelection()?.toString() || ''
          // 代码块单独占一行，前后用 <p><br></p> 隔开
          exec('insertHTML', `<p><br></p><div class="rt-code-block">${sel || '代码块'}</div><p><br></p>`)
        }} />
        <ToolbarBtn icon={<Table size={14} />} title="插入表格" onClick={() => setTableDlg({ open: true, rows: 3, cols: 3 })} />
        <ToolbarBtn icon={<Minus size={14} />} title="分割线" onClick={() => exec('insertHTML', '<hr>')} />
        <Divider />
        <ToolbarBtn icon={<Eraser size={14} />} title="清除格式" onClick={() => exec('removeFormat')} />
      </div>

      {/* ============== 链接弹窗 ============== */}
      {createPortal(
        <ModalShell
          open={linkDlg.open}
          title="插入链接"
          onClose={() => setLinkDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmLink}
          confirmText="插入"
          confirmDisabled={!linkDlg.url}
        >
          <Field label="链接地址">
            <input
              autoFocus
              value={linkDlg.url}
              onChange={e => setLinkDlg(d => ({ ...d, url: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmLink() }}
              placeholder="https://"
              style={inputStyle}
            />
          </Field>
          <Field label="显示文字（可选）">
            <input
              value={linkDlg.text}
              onChange={e => setLinkDlg(d => ({ ...d, text: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmLink() }}
              placeholder="留空则使用 URL 本身"
              style={inputStyle}
            />
          </Field>
        </ModalShell>,
        document.body
      )}

      {/* ============== 图片弹窗 ============== */}
      {createPortal(
        <ModalShell
          open={imageDlg.open}
          title="插入图片"
          onClose={() => setImageDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmImage}
          confirmText="插入"
          confirmDisabled={(!imageDlg.url && !imageDlg.sourcePath) || imageDlg.busy}
        >
          <Field label="图片来源">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={imageDlg.sourcePath ? `（本地文件）${imageDlg.localName ?? ''}` : imageDlg.url}
                readOnly={!!imageDlg.sourcePath}
                onChange={e => setImageDlg(d => ({ ...d, url: e.target.value, sourcePath: undefined, localName: undefined }))}
                onKeyDown={e => { if (e.key === 'Enter') confirmImage() }}
                placeholder="https://example.com/image.png"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={pickLocalImage}
                disabled={imageDlg.busy}
                style={btnStyle}
              >
                {imageDlg.busy ? '保存中...' : '本地文件'}
              </button>
            </div>
            {imageDlg.sourcePath && (
              <button
                onClick={() => setImageDlg(d => ({ ...d, url: '', sourcePath: undefined, localName: undefined }))}
                style={{ ...btnStyle, marginTop: 6, fontSize: 12 }}
              >
                清除并改用 URL
              </button>
            )}
          </Field>
          <Field label="替代文字（alt，可选）">
            <input
              value={imageDlg.alt}
              onChange={e => setImageDlg(d => ({ ...d, alt: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmImage() }}
              placeholder="用于图片无法显示时的替代文本"
              style={inputStyle}
            />
          </Field>
          {(imageDlg.sourcePath || imageDlg.url) && (
            <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-secondary)', borderRadius: 4, textAlign: 'center' }}>
              <img
                src={imageDlg.sourcePath ? toFileUrl(imageDlg.sourcePath) : imageDlg.url}
                alt="预览"
                style={{ maxWidth: '100%', maxHeight: 160 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
        </ModalShell>,
        document.body
      )}

      {/* ============== 表格弹窗 ============== */}
      {createPortal(
        <ModalShell
          open={tableDlg.open}
          title="插入表格"
          onClose={() => setTableDlg(d => ({ ...d, open: false }))}
          onConfirm={confirmTable}
          confirmText="插入"
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="行数">
              <input
                type="number"
                min={1}
                max={20}
                value={tableDlg.rows}
                onChange={e => setTableDlg(d => ({ ...d, rows: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) }))}
                style={inputStyle}
              />
            </Field>
            <Field label="列数">
              <input
                type="number"
                min={1}
                max={10}
                value={tableDlg.cols}
                onChange={e => setTableDlg(d => ({ ...d, cols: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) }))}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            将插入 {tableDlg.rows} × {tableDlg.cols} 表格，可在单元格内继续编辑
          </div>
        </ModalShell>,
        document.body
      )}

      <div ref={wrapperRef} style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          ref={editorRef}
          className="richtext-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleEditorClick}
          onScroll={updateImgBox}
          style={{
            flex: 1,
            padding: '8px 24px',
            outline: 'none',
            overflow: 'auto',
            background: editorDark ? '#1e1e1e' : 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize,
            lineHeight: 1.6,
            minHeight: 0,
            // 编辑区域字体：设置页选过就用它，否则跟随全局 UI 字体
            fontFamily: 'var(--editor-font, var(--font-family))'
          }}
        />
        {imgBox && (
          <div
            style={{
              position: 'absolute',
              top: imgBox.top,
              left: imgBox.left,
              width: imgBox.width,
              height: imgBox.height,
              border: '1px solid var(--accent-color)',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 5
            }}
          >
            <div
              title="拖动缩放图片"
              onMouseDown={startImageResize}
              style={{
                position: 'absolute',
                right: -6,
                bottom: -6,
                width: 12,
                height: 12,
                borderRadius: 2,
                background: 'var(--accent-color)',
                border: '1px solid #fff',
                cursor: 'nwse-resize',
                pointerEvents: 'auto',
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function ToolbarBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 26,
        borderRadius: 4,
        color: 'var(--text-secondary)',
        transition: 'all 150ms ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border-color)', margin: '0 4px', alignSelf: 'center' }} />
}

/** 编辑器更多菜单里的条目：图标 + 文字，可带勾选状态 */
function MenuButton({ icon, label, active, dark, onClick }: {
  icon: React.ReactNode
  label: string
  active?: boolean
  dark?: boolean
  onClick: () => void
}) {
  return (
    <button
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 8px',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'inherit',
        fontSize: 13,
        textAlign: 'left',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = dark ? '#3a3a3a' : 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      onClick={onClick}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {active && <Check size={14} style={{ color: 'var(--accent-color)' }} />}
    </button>
  )
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
}

// ==================== 富文本弹窗通用组件 ====================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box'
}

const btnStyle: React.CSSProperties = {
  padding: '5px 14px',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  cursor: 'pointer'
}

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--accent-color)',
  borderColor: 'var(--accent-color)',
  color: '#fff'
}

function ModalShell({ open, title, onClose, onConfirm, confirmText = '确定', confirmDisabled = false, children }: {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: () => void
  confirmText?: string
  confirmDisabled?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn-secondary" onClick={onClose}>取消</button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease;
        }
        .modal-content {
          background: var(--bg-primary);
          border-radius: 12px;
          minWidth: 380;
          maxWidth: 480;
          width: 90%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          animation: slideUp 0.2s ease;
          overflow: hidden;
        }
        .modal-header {
          padding: 16px 20px 0;
        }
        .modal-title {
          margin: 0;
          font-size: 16;
          font-weight: 600;
          color: var(--text-primary);
        }
        .modal-body {
          padding: 16px 20px;
          color: var(--text-secondary);
          font-size: 14;
          line-height: 1.5;
        }
        .modal-footer {
          padding: 12px 20px 16;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          border-top: 1px solid var(--border-color);
        }
        .modal-btn {
          padding: 8px 16px;
          font-size: 13;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }
        .modal-btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .modal-btn-secondary:hover {
          background: var(--bg-hover);
        }
        .modal-btn-primary {
          background: var(--accent-color);
          color: #fff;
        }
        .modal-btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .modal-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

/** 把代码语言 id 翻成中文显示名（用于工具栏展示） */
function getLangLabel(lang?: string): string {
  const map: Record<string, string> = {
    plaintext: '纯文本', javascript: 'JavaScript', typescript: 'TypeScript',
    python: 'Python', java: 'Java', go: 'Go', rust: 'Rust',
    c: 'C', cpp: 'C++', csharp: 'C#', ruby: 'Ruby', php: 'PHP',
    html: 'HTML', css: 'CSS', json: 'JSON', xml: 'XML', yaml: 'YAML',
    markdown: 'Markdown', shell: 'Shell', sql: 'SQL',
    kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart'
  }
  return map[lang ?? ''] ?? lang ?? '纯文本'
}

/** CodeEditor.formatCode 支持美化的语言（与 CodeEditor.tsx 内的 if 分支保持同步） */
const FORMATABLE_LANGS = new Set(['json', 'sql', 'javascript', 'typescript', 'html', 'css'])
function isFormatableLanguage(lang?: string): boolean {
  return !!lang && FORMATABLE_LANGS.has(lang.toLowerCase())
}

/** 图表按钮：点击展开 6 种 mermaid 模板下拉 */
function MermaidMenu({ onInsert }: { onInsert: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const items = [
    { id: 'flowchart', label: '流程图 (graph)' },
    { id: 'sequence', label: '时序图 (sequence)' },
    { id: 'classDiagram', label: '类图 (classDiagram)' },
    { id: 'stateDiagram', label: '状态图 (stateDiagram)' },
    { id: 'gantt', label: '甘特图 (gantt)' },
    { id: 'pie', label: '饼图 (pie)' }
  ]

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <ToolbarBtn
        icon={<ChartBar size={14} />}
        title="插入图表"
        onClick={() => setOpen(o => !o)}
      />
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 100,
          minWidth: 180,
          padding: '4px 0'
        }}>
          {items.map(it => (
            <div
              key={it.id}
              onClick={() => { onInsert(it.id); setOpen(false) }}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                color: 'var(--text-primary)'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {it.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface AiJsonResponse {
  status: 'completed' | 'question'
  content: string
  description: string
}

function extractJson(text: string): AiJsonResponse | null {
  let raw = text
  let prefix = ''
  // 仅当 ``` 包裹整个响应时才剥离（避免匹配 content 内部的代码块）
  const fence = raw.match(/^\s*```(?:json)?\s*([\s\S]*?)```\s*$/)
  if (fence) { raw = fence[1]; prefix = text.replace(fence[0], '').trim() }
  // 找第一个 { 前的文字作为前缀
  const braceIdx = raw.indexOf('{')
  if (braceIdx > 0) { prefix = raw.substring(0, braceIdx).trim(); raw = raw.substring(braceIdx) }
  raw = raw.trim()

  const tryParse = (jsonStr: string): AiJsonResponse | null => {
    const attempt = (s: string): AiJsonResponse | null => {
      try {
        const p = JSON.parse(s)
        if (p && typeof p.status === 'string' && ['completed', 'question'].includes(p.status)) {
          const d = p.description || ''
          return { status: p.status, content: p.content || '', description: (prefix && d) ? `${prefix}\n\n${d}` : (d || prefix) }
        }
      } catch {}
      return null
    }
    // direct parse
    let r = attempt(jsonStr)
    if (r) return r
    // repair: escape actual newlines/tabs inside JSON strings, retry
    const repaired = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (full, inner) =>
      '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"')
    r = attempt(repaired)
    if (r) return r
    return null
  }

  // strategy 1: parse raw directly
  const r1 = tryParse(raw)
  if (r1) return r1

  // strategy 2: brace-counting to find exact JSON substring
  let depth = 0, inStr = false, esc = false, start = -1
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (!inStr) {
      if (ch === '{') { if (depth === 0) start = i; depth++ }
      if (ch === '}') { depth--; if (depth === 0 && start >= 0) { const r = tryParse(raw.substring(start, i + 1)); if (r) return r } }
    }
  }

  // strategy 3: regex fallback for individual fields
  const s = (raw.match(/"status"\s*:\s*"(completed|question)"/i) || [])[1]
  if (!s) return null
  const dm = raw.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const desc = dm ? dm[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : ''
  return { status: s as AiJsonResponse['status'], content: '', description: prefix ? `${prefix}\n\n${desc}` : desc }
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  completed: { label: '已完成', color: '#16a34a' },
  question:  { label: '询问中', color: '#2563eb' },
}

export function AIDialog({ mode = 'modal', noteId, noteTitle, noteContent, noteFormat, history, onHistoryChange, onClose, onReplace }: {
  mode?: 'modal' | 'panel'
  noteId: string
  noteTitle: string
  noteContent: string
  noteFormat: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  onHistoryChange: (h: Array<{ role: 'user' | 'assistant'; content: string }>) => void
  onClose: () => void
  onReplace: (text: string) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastStatus, setLastStatus] = useState<string | null>(null)
  // 实时进度：主进程在工具调用/请求阶段推送的进度文案（方案C）
  const [progress, setProgress] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taRef.current?.focus()
  }, [])

  // 订阅主进程推送的 AI 处理进度（loading 期间实时更新）
  useEffect(() => {
    if (!loading) { setProgress(null); return }
    const off = window.inkslateApi.ai.onProgress(text => setProgress(text))
    return () => off()
  }, [loading])

  const handleSend = async () => {
    if (!prompt.trim() || loading) return
    const userMsg = prompt.trim()
    setPrompt('')
    setLoading(true)
    setError('')
    setLastStatus(null)

    const newHistory = [...history, { role: 'user' as const, content: userMsg }]
    onHistoryChange(newHistory)

    try {
      const isSpreadsheet = noteFormat === 'spreadsheet'
      // 智能表格：把 AI 返回的 Markdown 表格 / JSON 转成 x-data-spreadsheet 格式再写回；
      // 解析失败返回 null（不替换，避免清空表格），其他格式原样使用。
      const applyFormatTransform = (text: string): string | null => {
        if (noteFormat !== 'spreadsheet') return text
        try {
          return JSON.stringify(markdownToSpreadsheetData(text))
        } catch (e: any) {
          setError('AI 输出无法解析为表格：' + (e?.message || '格式错误'))
          return null
        }
      }
      // 智能表格：把 JSON 转成 Markdown 表格给 AI 作为上下文
      let contextContent = noteContent
      if (isSpreadsheet) {
        try {
          contextContent = spreadsheetToMarkdown(JSON.parse(noteContent || '[]'))
        } catch {
          contextContent = '(表格内容无法解析)'
        }
      }
      const formatHint = noteFormat === 'html' ? '注意：content 中的内容必须是纯 HTML（不要用 ```html 包裹）'
        : noteFormat === 'richtext' ? '注意：content 中的内容必须是纯 HTML，包含表格、列表等直接用 <table><h1><ul> 等 HTML 标签'
        : noteFormat === 'code' ? '注意：content 中的内容必须是纯代码'
        : noteFormat === 'spreadsheet' ? '注意：content 必须是 Markdown 表格格式，首行为表头，每行用 | 分隔单元格，不要用 ``` 包裹，不要输出 JSON、代码块或解释文字。示例：\n| 日期 | 任务 | 状态 |\n| --- | --- | --- |\n| 2026-09-01 | 需求评审 | 完成 |'
        : ''

      const sshHint = `

## SSH 远程工具
除本地工具外，你还能通过 SSH 访问远程服务器（凭据由你提供，可访问多台服务器），可用工具：
- ssh_list_dir(host, username, password, path, port?): 列出远程目录内容
- ssh_read_file(host, username, password, path, port?): 读取远程文件文本
- ssh_write_file(host, username, password, path, content, port?): 写入远程文件（系统会先弹出确认框请用户批准，用户拒绝则不会写入）

调用 ssh_* 工具时必须携带 host / username / password。远程路径请使用绝对路径，例如 /etc/nginx/nginx.conf。只在确有必要时才访问远程服务器。`

      const systemMsg = {
        role: 'system',
        content: `你是 Inkslate 的 AI 笔记编辑助手。你有 scan_dir、read_file、grep_dir 三个工具。${sshHint}

## 工作流程
1. 先用工具获取信息（scan_dir / read_file / grep_dir），可以多次、反复调用工具直到信息齐全
2. 工具调用由系统自动执行并把结果返回给你；工具执行期间用户界面会显示实时进度，你无需回报"处理中"
3. 全部信息收集完成后，最终回复必须是纯 JSON

## 最终 JSON 格式
{"status":"completed|question","content":"...","description":"..."}

status 含义：
- completed: 任务完成。content=完整的最终笔记内容（必须包含全部输出，不能为空）。description=简短说明（1-2句）。
- question: 需要追问。content=""。description=你的问题。

示例：
{"status":"completed","content":"# 标题\\n\\n这是完整的文档内容，包含所有信息","description":"已生成文档。"}
{"status":"question","content":"","description":"请问你希望分析哪个模块？"}

重要规则——必须严格遵守：
- 不要返回 working/处理中 状态；工具调用由系统自动执行，你只需要在一次请求里完成所有工具调用并给出最终 JSON
- 最终回复必须是纯 JSON，第1个字符必须是 {，最后1个字符必须是 }
- JSON 前面不能有任何文字，不要写"开始生成"之类的说明
- status=completed 时 content 必须包含完整的最终笔记内容，content 不能为空字符串
- content 中的双引号用 \\" 转义，换行用 \\n 表示
- ${formatHint || ''}

当前笔记标题：${noteTitle || '(未命名)'}
当前笔记内容（原文）：
${contextContent}
`}
      // 方案C：单次请求内主进程自动执行所有工具调用并实时推送进度（ai.chat 内部完成），
      // 渲染端只订阅进度显示 + 处理最终 JSON。不再循环追问 working。
      const messages = [systemMsg, ...newHistory.map(m => ({ role: m.role, content: m.content }))]
      const res = await window.inkslateApi.ai.chat(messages)
      const raw = res || 'AI 未返回内容'
      const parsed = extractJson(raw)

      if (parsed) {
        onHistoryChange([...newHistory, { role: 'assistant', content: raw }])
        setLastStatus(parsed.status)
        if (parsed.status === 'completed' && parsed.content) {
          const finalContent = applyFormatTransform(parsed.content)
          if (finalContent != null) onReplace(finalContent)
        }
      } else if (raw === 'AI 未返回内容') {
        onHistoryChange([...newHistory, { role: 'assistant', content: raw }])
      } else {
        // 模型未按 JSON 协议返回（如直接输出整篇 Markdown），整段视为笔记内容自动填入
        onHistoryChange([...newHistory, { role: 'assistant', content: raw }])
        setLastStatus('completed')
        const finalContent = applyFormatTransform(raw)
        if (finalContent != null) onReplace(finalContent)
      }
    } catch (e: any) {
      setError(e?.message || '请求失败')
      setLastStatus(null)
    } finally {
      setLoading(false)
    }
  }

  const isPanel = mode === 'panel'

  return (
    <div
      className={isPanel ? '' : 'search-dialog-overlay'}
      onMouseDown={isPanel ? undefined : onClose}
      style={isPanel ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' } : undefined}
    >
      <div className={isPanel ? '' : 'search-dialog'} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} style={isPanel ? { display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 } : { width: 750, maxHeight: '88vh', minHeight: '60vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, justifyContent: 'space-between', padding: '8px 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            <Bot size={16} style={{ color: 'var(--accent-color)' }} />AI 写作
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {history.length > 0 && (
              <button onClick={() => { onHistoryChange([]); setError(''); setLastStatus(null) }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                清空对话
              </button>
            )}
            <button onClick={onClose} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '8px 16px' }}>
          {history.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 13 }}>
              输入提示词开始 AI 写作，多轮对话保留上下文
            </div>
          )}
          {history.map((msg, i) => {
            let displayContent = msg.content
            let status: string | null = null
            const parsed = msg.role === 'assistant' ? extractJson(msg.content) : null
            if (parsed) {
              displayContent = parsed.description || (parsed.status === 'completed' ? '已完成笔记更新' : '')
              status = parsed.status
            } else if (msg.role === 'assistant') {
              displayContent = `内容已自动填入笔记（${msg.content.length} 字）`
              status = 'completed'
            }
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2, display: 'flex', alignItems: 'center' }}>
                  {msg.role === 'user' ? '你' : 'AI'}
                  {status && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_LABEL[status]?.color || 'var(--text-tertiary)', background: (STATUS_LABEL[status]?.color || '#888') + '18', padding: '1px 8px', borderRadius: 4, marginLeft: 6 }}>
                      {STATUS_LABEL[status]?.label || status}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', padding: '8px 12px', borderRadius: 6,
                  background: msg.role === 'user' ? 'var(--bg-secondary)' : 'var(--accent-bg)',
                  border: msg.role === 'user' ? '1px solid var(--border-color)' : '1px solid transparent'
                }}>
                  {displayContent}
                </div>
              </div>
            )
          })}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, color: 'var(--text-tertiary)', fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: 'ai-spin 1s linear infinite', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {progress || '思考中...'}
              </span>
              <style>{'@keyframes ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
            </div>
          )}
          {error && (
            <div style={{ padding: '8px 12px', color: '#ef4444', fontSize: 13, borderRadius: 6, background: 'rgba(239,68,68,0.08)' }}>
              {error}
            </div>
          )}
          {lastStatus === 'completed' && (
            <div style={{ padding: '6px 12px', fontSize: 12, color: '#16a34a', textAlign: 'center', background: '#16a34a0c', borderRadius: 4, marginBottom: 4 }}>
              笔记内容已自动更新
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-color)', padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="输入提示词，Enter 发送，Shift+Enter 换行"
            rows={4}
            style={{
              flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'var(--font-family)',
              lineHeight: 1.5, minWidth: 0
            }}
          />
          <button
            onClick={handleSend}
            disabled={!prompt.trim() || loading}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: loading ? 'var(--bg-hover)' : 'var(--accent-color)',
              color: loading ? 'var(--text-tertiary)' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              flexShrink: 0, marginBottom: 2
            }}
          >
            {loading ? '...' : '发送'}
          </button>
        </div>
      </div>
      {isPanel ? null : <div className="search-dialog-overlay" />}
    </div>
  )
}
