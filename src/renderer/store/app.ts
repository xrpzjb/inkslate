import { create } from 'zustand'
import { AppSettings, Note, Notebook, NoteTreeNode, SyncStatus } from '@shared/types'

interface AppState {
  // 涓婚
  theme: 'light' | 'dark' | 'auto' | 'solarized' | 'cyberpunk' | 'dracula' | 'dune' | 'monet' | 'newspaper' | 'forest' | 'sunset' | 'nordic' | 'pastoral'
  setTheme: (theme: 'light' | 'dark' | 'auto' | 'solarized' | 'cyberpunk' | 'dracula' | 'dune' | 'monet' | 'newspaper' | 'forest' | 'sunset' | 'nordic' | 'pastoral') => void

  // 璁剧疆
  settings: AppSettings | null
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>

  // 绗旇鏈暟鎹?  notebooks: Notebook[]
  notes: Note[]
  selectedNoteId: string | null
  currentNote: Note | null
  /** 用户手动展开的笔记本 id 集合（启动时恢复） */
  expandedNotebooks: string[]
  /** 切换笔记本展开状态，并持久化 */
  setExpandedNotebook: (id: string, expanded: boolean) => void
  loadNotebooks: () => Promise<void>
  loadNotes: () => Promise<void>
  selectNote: (id: string | null) => Promise<void>
  createNotebook: (name: string, parentId: string | null, icon?: string) => Promise<void>
  createNote: (title: string, notebookId: string, parentId: string | null, icon?: string, format?: Note['format'], language?: Note['language'], url?: string) => Promise<void>
  /** 仅更新内存里的 currentNote，不写库。供编辑器输入时即时同步给 Preview。 */
  updateCurrentNoteDraft: (updates: Partial<Note>) => void
  /** 写库持久化（防抖调用）。从 main process 拿回最新值刷新 currentNote。 */
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  renameNotebook: (id: string, name: string) => Promise<void>
  renameNote: (id: string, title: string) => Promise<void>
  deleteNotebook: (id: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  /** 拖动排序：notebookId 下，orderedIds 是新顺序 */
  reorderNotes: (notebookId: string, orderedIds: string[]) => Promise<void>
  /** 拖动排序：parentId 下，orderedIds 是新顺序；parentId=null 表示顶级 */
  reorderNotebooks: (parentId: string | null, orderedIds: string[]) => Promise<void>

  // ============ 回收站 ============
  deletedNotes: Note[]
  deletedNotebooks: Notebook[]
  /** 回收站里的总条数（笔记+笔记本），用于 sidebar badge */
  recycleBinCount: number
  loadRecycleBin: () => Promise<void>
  restoreNote: (id: string) => Promise<{ restoredNotebooks: string[] }>
  restoreNotebook: (id: string) => Promise<{ restoredNotebooks: string[] }>
  purgeNote: (id: string) => Promise<void>
  purgeNotebook: (id: string) => Promise<void>
  emptyRecycleBin: () => Promise<{ notes: number; notebooks: number }>

  // 甯冨眬
  sidebarVisible: boolean
  previewVisible: boolean
  editorVisible: boolean
  toggleSidebar: () => void
  togglePreview: () => void
  toggleEditor: () => void

  // 主视图模式：'notes' 显示编辑器/预览，'recycle-bin' 显示回收站
  viewMode: 'notes' | 'recycle-bin'
  setViewMode: (mode: 'notes' | 'recycle-bin') => void

  // 淇濆瓨鐘舵€?  saveStatus: { saving: boolean; lastSaved: number | null }
  setSaveStatus: (status: { saving?: boolean; lastSaved?: number | null }) => void

  // 鍚屾鐘舵€?  syncStatus: SyncStatus
  setSyncStatus: (status: SyncStatus) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'auto',
  setTheme: (theme) => set({ theme }),

  settings: null,
  loadSettings: async () => {
    const settings = await window.inkslateApi.settings.get()
    set({
      settings,
      theme: settings.theme,
      sidebarVisible: settings.layout.sidebarVisible,
      previewVisible: settings.layout.previewVisible,
      editorVisible: settings.layout.editorVisible ?? true,
      expandedNotebooks: settings.expandedNotebooks ?? []
    })
  },
  updateSettings: async (updates) => {
    const settings = await window.inkslateApi.settings.update(updates)
    set({ settings })
    if (updates.theme) set({ theme: updates.theme })
    if (updates.layout) {
      set({
        sidebarVisible: settings.layout.sidebarVisible,
        previewVisible: settings.layout.previewVisible,
        editorVisible: settings.layout.editorVisible ?? true
      })
    }
  },

  notebooks: [],
  notes: [],
  selectedNoteId: null,
  currentNote: null,
  loadNotebooks: async () => {
    const notebooks = await window.inkslateApi.notebooks.list()
    set({ notebooks })
  },
  loadNotes: async () => {
    const notes = await window.inkslateApi.notes.list()
    set({ notes })
  },
  selectNote: async (id) => {
    // 任何时候选中笔记都切回笔记视图（从回收站视图点回笔记时尤其需要）
    set({ selectedNoteId: id, viewMode: 'notes' })
    // 持久化 lastSelectedNoteId（启动时恢复）
    if (id) {
      const settings = get().settings
      if (settings && settings.lastSelectedNoteId !== id) {
        window.inkslateApi.settings.update({ lastSelectedNoteId: id }).catch(() => {})
      }
    }
    if (!id) {
      set({ currentNote: null })
      return
    }
    const note = await window.inkslateApi.notes.get(id)
    set({ currentNote: note })
    // 代码/富文本笔记不需要预览面板：选中的瞬间自动收起
    if (note && (note.format === 'code' || note.format === 'richtext')) {
      const layout = get().settings?.layout
      if (layout && layout.previewVisible) {
        // 同步到 settings，下次开 markdown 笔记时不会自动冒出来
        get().updateSettings({ layout: { ...layout, previewVisible: false } })
      }
      set({ previewVisible: false })
      // 代码/富文本笔记没有预览可用，必须确保 editor 显示 —— 否则整个右半空白
      if (!get().editorVisible) {
        set({ editorVisible: true })
        if (layout) {
          get().updateSettings({ layout: { ...layout, editorVisible: true } })
        }
      }
    }
    // markdown/html 笔记：默认进入"只读预览"模式（编辑器关闭、预览打开）。
    // 用户想编辑就手动点中键展开 —— 这是"刚打开一篇已存在的 md"的最常见诉求。
    // 新建笔记的覆盖在 createNote 里做：selectNote 之后立即把 editor 打开，实现"各一半"。
    if (note && (note.format === 'markdown' || note.format === 'html')) {
      const layout = get().settings?.layout
      if (get().editorVisible) {
        set({ editorVisible: false })
        if (layout) {
          get().updateSettings({ layout: { ...layout, editorVisible: false } })
        }
      }
      if (!get().previewVisible) {
        set({ previewVisible: true })
        if (layout) {
          get().updateSettings({ layout: { ...layout, previewVisible: true } })
        }
      }
    }
    // url 网页笔记：Editor 对 url 不渲染（见 Layout），必须强制打开预览，
    // 并把 editorVisible 置为 false 让预览占满整列，否则右侧整片空白。
    // 这尤其修复"从 code/richtext 笔记（previewVisible=false）切到 url 笔记"时空白的 bug。
    if (note && note.format === 'url') {
      const layout = get().settings?.layout
      if (!get().previewVisible) {
        set({ previewVisible: true })
        if (layout) {
          get().updateSettings({ layout: { ...layout, previewVisible: true } })
        }
      }
      if (get().editorVisible) {
        set({ editorVisible: false })
        if (layout) {
          get().updateSettings({ layout: { ...layout, editorVisible: false } })
        }
      }
    }
    // file 文件笔记：跟 url 一样不渲染 Editor，强制预览占满整列
    if (note && note.format === 'file') {
      const layout = get().settings?.layout
      if (!get().previewVisible) {
        set({ previewVisible: true })
        if (layout) {
          get().updateSettings({ layout: { ...layout, previewVisible: true } })
        }
      }
      if (get().editorVisible) {
        set({ editorVisible: false })
        if (layout) {
          get().updateSettings({ layout: { ...layout, editorVisible: false } })
        }
      }
    }
  },
  createNotebook: async (name, parentId, icon) => {
    await window.inkslateApi.notebooks.create(name, parentId, icon)
    await get().loadNotebooks()
  },
  createNote: async (title, notebookId, parentId, icon, format, language, url) => {
    const note = await window.inkslateApi.notes.create(title, notebookId, parentId, icon, format, language, url)
    await get().loadNotes()
    await get().selectNote(note.id)
    // 新建笔记：强制打开 editor（覆盖 selectNote 默认的"只读预览"行为），
    // —— 让新建的笔记默认进入"编辑+预览各一半"，方便用户立即输入
    // 注意：url 笔记的 Editor 不渲染，不应打开 editor（否则预览只占固定宽度而非占满），
    // url 的布局已由 selectNote 中的 url 分支处理，这里跳过。
    if (note && (note.format === 'markdown' || note.format === 'html')) {
      const layout = get().settings?.layout
      set({ editorVisible: true })
      if (layout) {
        get().updateSettings({ layout: { ...layout, editorVisible: true } })
      }
    }
  },
  updateNote: async (id, updates) => {
    get().setSaveStatus({ saving: true })
    try {
      const updated = await window.inkslateApi.notes.update(id, updates)
      const cur = get().currentNote
      // 始终同步 title 和 updatedAt（来自服务端），但保留 content 为用户最新输入
      // 避免保存后 currentNote.content 被服务端旧值覆盖（用户可能还在敲）
      if (cur?.id === updated.id) {
        set({
          currentNote: {
            ...cur,
            title: updated.title,
            updatedAt: updated.updatedAt
          }
        })
      }
      // 局部更新 notes 列表里那一条，让侧边栏树状图同步最新的 title
      // （避免 loadNotes 全量重拉导致列表闪烁）
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n))
      }))
      get().setSaveStatus({ saving: false, lastSaved: Date.now() })
    } catch {
      get().setSaveStatus({ saving: false })
    }
  },
  updateCurrentNoteDraft: (updates) => {
    const cur = get().currentNote
    if (!cur) return
    set({ currentNote: { ...cur, ...updates } })
  },
  renameNotebook: async (id, name) => {
    await window.inkslateApi.notebooks.rename(id, name)
    await get().loadNotebooks()
  },
  renameNote: async (id, title) => {
    const updated = await window.inkslateApi.notes.update(id, { title })
    if (get().currentNote?.id === id) {
      set({ currentNote: updated })
    }
    await get().loadNotes()
  },
  deleteNotebook: async (id) => {
    await window.inkslateApi.notebooks.delete(id)
    await get().loadNotebooks()
    await get().loadRecycleBin()
  },
  deleteNote: async (id) => {
    await window.inkslateApi.notes.delete(id)
    if (get().selectedNoteId === id) {
      set({ selectedNoteId: null, currentNote: null })
    }
    await get().loadNotes()
    await get().loadRecycleBin()
  },

  reorderNotes: async (notebookId, orderedIds) => {
    await window.inkslateApi.notes.reorder(notebookId, orderedIds)
    // 关键：除了重排 notes 数组顺序，还要更新每个 note 的 sortOrder 字段，
    // 否则 buildNoteTree 里的 sortNodes 仍按 sortOrder 排，UI 不变。
    set((state) => {
      const noteMap = new Map(state.notes.map(n => [n.id, n]))
      const reordered = orderedIds
        .map((id, idx) => {
          const n = noteMap.get(id)
          if (!n) return undefined
          // 给一个本地虚拟 sortOrder（不写库），让 buildNoteTree 排序结果与拖动一致
          // 数字越大越靠前，所以新位置 idx 越小，sortOrder 越大
          return { ...n, sortOrder: Date.now() + (orderedIds.length - idx) * 1000 }
        })
        .filter((n): n is Note => !!n)
      const rest = state.notes.filter(n => n.notebookId !== notebookId)
      return { notes: [...rest, ...reordered] }
    })
  },
  reorderNotebooks: async (parentId, orderedIds) => {
    await window.inkslateApi.notebooks.reorder(parentId, orderedIds)
    set((state) => {
      const nbMap = new Map(state.notebooks.map(n => [n.id, n]))
      const reordered = orderedIds
        .map((id, idx) => {
          const n = nbMap.get(id)
          if (!n) return undefined
          return { ...n, sortOrder: Date.now() + (orderedIds.length - idx) * 1000 }
        })
        .filter((n): n is Notebook => !!n)
      const rest = state.notebooks.filter(n => n.parentId !== parentId)
      return { notebooks: [...rest, ...reordered] }
    })
  },

  // ============ 回收站 actions ============
  deletedNotes: [],
  deletedNotebooks: [],
  recycleBinCount: 0,
  loadRecycleBin: async () => {
    const [deletedNotes, deletedNotebooks] = await Promise.all([
      window.inkslateApi.notes.listDeleted(),
      window.inkslateApi.notebooks.listDeleted()
    ])
    set({
      deletedNotes,
      deletedNotebooks,
      recycleBinCount: deletedNotes.length + deletedNotebooks.length
    })
  },
  restoreNote: async (id) => {
    const result = await window.inkslateApi.notes.restore(id)
    await Promise.all([get().loadNotebooks(), get().loadNotes(), get().loadRecycleBin()])
    return result
  },
  restoreNotebook: async (id) => {
    const result = await window.inkslateApi.notebooks.restore(id)
    await Promise.all([get().loadNotebooks(), get().loadNotes(), get().loadRecycleBin()])
    return result
  },
  purgeNote: async (id) => {
    await window.inkslateApi.notes.purge(id)
    await get().loadRecycleBin()
  },
  purgeNotebook: async (id) => {
    await window.inkslateApi.notebooks.purge(id)
    await get().loadRecycleBin()
  },
  emptyRecycleBin: async () => {
    const result = await window.inkslateApi.recycleBin.empty()
    await get().loadRecycleBin()
    return result
  },

  sidebarVisible: true,
  previewVisible: true,
  editorVisible: true,
  expandedNotebooks: [],
  setExpandedNotebook: (id, expanded) => {
    const current = get().expandedNotebooks
    const next = expanded
      ? (current.includes(id) ? current : [...current, id])
      : current.filter(x => x !== id)
    set({ expandedNotebooks: next })
    // 持久化（fire-and-forget；空数组也存，覆盖老值）
    const settings = get().settings
    if (settings) {
      window.inkslateApi.settings.update({ expandedNotebooks: next }).catch(() => {})
    }
  },
  toggleSidebar: () => {
    const visible = !get().sidebarVisible
    set({ sidebarVisible: visible })
    get().updateSettings({ layout: { ...get().settings!.layout, sidebarVisible: visible } })
  },
  togglePreview: () => {
    const visible = !get().previewVisible
    set({ previewVisible: visible })
    get().updateSettings({ layout: { ...get().settings!.layout, previewVisible: visible } })
  },
  toggleEditor: () => {
    const visible = !get().editorVisible
    set({ editorVisible: visible })
    get().updateSettings({ layout: { ...get().settings!.layout, editorVisible: visible } })
  },

  viewMode: 'notes',
  setViewMode: (mode) => set({ viewMode: mode }),

  saveStatus: { saving: false, lastSaved: null },
  setSaveStatus: (status) => set(s => ({
    saveStatus: { ...s.saveStatus, ...status }
  })),

  syncStatus: { state: 'idle' },
  setSyncStatus: (status) => set({ syncStatus: status })
}))

/** 把扁平的笔记本/笔记列表组装成树 */
export function buildNoteTree(notebooks: Notebook[], notes: Note[]): NoteTreeNode[] {
  const notebookNodes = new Map<string, NoteTreeNode>()
  const noteNodes = new Map<string, NoteTreeNode>()

  // 第一遍：把所有节点创建出来
  for (const nb of notebooks) {
    notebookNodes.set(nb.id, {
      id: nb.id,
      name: nb.name,
      type: 'notebook',
      parentId: nb.parentId,
      children: [],
      icon: nb.icon,
      updatedAt: nb.updatedAt,
      createdAt: nb.createdAt,
      sortOrder: nb.sortOrder,
      isExpanded: true
    })
  }
  for (const note of notes) {
    noteNodes.set(note.id, {
      id: note.id,
      name: note.title,
      type: 'note',
      parentId: note.parentId ?? note.notebookId,
      children: [],
      icon: note.icon,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      sortOrder: note.sortOrder,
      // 鎶?format 鏀惧湪 node 涓婏紝鏂逛究 UI 璇诲彇
      ...({ format: note.format } as any)
    })
  }

  const allNodes = new Map([...notebookNodes, ...noteNodes])
  const rootNodes: NoteTreeNode[] = []

  for (const node of allNodes.values()) {
    const parentId = node.parentId
    if (!parentId) {
      rootNodes.push(node)
    } else {
      const parent = allNodes.get(parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        rootNodes.push(node)
      }
    }
  }

  // 顺序：按 sortOrder 倒序（sortOrder 大的在前），未填的兜底为 createdAt
  // —— 用户拖动改 sortOrder；从未拖动时表现为按 createdAt DESC
  const sortNodes = (nodes: NoteTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'notebook' ? -1 : 1
      return (b.sortOrder ?? b.createdAt ?? 0) - (a.sortOrder ?? a.createdAt ?? 0)
    })
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(rootNodes)

  return rootNodes
}
