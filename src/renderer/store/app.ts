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
  loadNotebooks: () => Promise<void>
  loadNotes: () => Promise<void>
  selectNote: (id: string | null) => Promise<void>
  createNotebook: (name: string, parentId: string | null, icon?: string) => Promise<void>
  createNote: (title: string, notebookId: string, parentId: string | null, icon?: string, format?: Note['format'], language?: Note['language']) => Promise<void>
  /** 仅更新内存里的 currentNote，不写库。供编辑器输入时即时同步给 Preview。 */
  updateCurrentNoteDraft: (updates: Partial<Note>) => void
  /** 写库持久化（防抖调用）。从 main process 拿回最新值刷新 currentNote。 */
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  renameNotebook: (id: string, name: string) => Promise<void>
  renameNote: (id: string, title: string) => Promise<void>
  deleteNotebook: (id: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>

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
      editorVisible: settings.layout.editorVisible ?? true
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
    }
  },
  createNotebook: async (name, parentId, icon) => {
    await window.inkslateApi.notebooks.create(name, parentId, icon)
    await get().loadNotebooks()
  },
  createNote: async (title, notebookId, parentId, icon, format, language) => {
    const note = await window.inkslateApi.notes.create(title, notebookId, parentId, icon, format, language)
    await get().loadNotes()
    await get().selectNote(note.id)
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

  const sortNodes = (nodes: NoteTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'notebook' ? -1 : 1
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    })
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(rootNodes)

  return rootNodes
}
