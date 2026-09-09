import { create } from 'zustand'
import { AppSettings, Note, Notebook, NoteTreeNode, SyncStatus, FlashThought } from '@shared/types'
import { matchNotebookIcon } from '@shared/notebookIcons'

interface AppState {
  // 涓婚
  theme: 'light' | 'dark' | 'auto' | 'solarized' | 'cyberpunk' | 'dracula' | 'dune' | 'monet' | 'newspaper' | 'forest' | 'sunset' | 'nordic' | 'pastoral'
  setTheme: (theme: 'light' | 'dark' | 'auto' | 'solarized' | 'cyberpunk' | 'dracula' | 'dune' | 'monet' | 'newspaper' | 'forest' | 'sunset' | 'nordic' | 'pastoral') => void

  // 璁剧疆
  settings: AppSettings | null
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>

  // 绗旇鏈暟鎹?  notebooks: Notebook[]  // 修原文件预存 bug：notebooks 字段被注释吃掉了
  notebooks: Notebook[]
  notes: Note[]
  selectedNoteId: string | null
  selectedNotebookId: string | null
  currentNote: Note | null
  /** 多标签页：当前打开的笔记 id 列表（按打开顺序，不含已删除/已回收的） */
  openTabs: string[]
  /** 多标签页：当前激活标签对应的笔记 id */
  activeTabId: string | null
  /** 多标签页：打开笔记（已存在则切过去 + 激活，否则追加到末尾） */
  openTab: (id: string) => Promise<void>
  /** 多标签页：激活指定标签（不改 openTabs 列表） */
  activateTab: (id: string) => Promise<void>
  /** 多标签页：关闭标签；关闭当前激活的则切到相邻标签 */
  closeTab: (id: string) => Promise<void>
  /** 多标签页：批量关闭。mode='left' 关闭 id 左侧所有，'right' 关闭右侧所有，'other' 关闭除 id 外所有；当前激活标签被关闭时激活 id */
  closeTabsExcept: (id: string, mode: 'left' | 'right' | 'other') => Promise<void>
  /** 多标签页：拖动重排序 */
  reorderTabs: (orderedIds: string[]) => void
  /** 用户手动展开的笔记本 id 集合（启动时恢复） */
  expandedNotebooks: string[]
  /** 切换笔记本展开状态，并持久化 */
  setExpandedNotebook: (id: string, expanded: boolean) => void
  loadNotebooks: () => Promise<void>
  loadNotes: () => Promise<void>
  selectNote: (id: string | null) => Promise<void>
  selectNotebook: (id: string | null) => void
  createNotebook: (name: string, parentId: string | null, icon?: string) => Promise<Notebook>
  createNote: (title: string, notebookId: string, parentId: string | null, icon?: string, format?: Note['format'], language?: Note['language'], url?: string) => Promise<Note>
  /** 仅更新内存里的 currentNote，不写库。供编辑器输入时即时同步给 Preview。 */
  updateCurrentNoteDraft: (updates: Partial<Note>) => void
  /** 写库持久化（防抖调用）。从 main process 拿回最新值刷新 currentNote。 */
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>
  renameNotebook: (id: string, name: string) => Promise<void>
  /** 通用更新笔记本（name / icon / parentId 任一） */
  updateNotebook: (id: string, updates: { name?: string; icon?: string | null; parentId?: string | null }) => Promise<void>
  renameNote: (id: string, title: string) => Promise<void>
  deleteNotebook: (id: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  /** 拖动排序：notebookId 下，orderedIds 是新顺序 */
  reorderNotes: (notebookId: string, orderedIds: string[]) => Promise<void>
  /** 拖动排序：parentId 下，orderedIds 是新顺序；parentId=null 表示顶级 */
  reorderNotebooks: (parentId: string | null, orderedIds: string[]) => Promise<void>
  /** 移动笔记到新笔记本 */
  moveNote: (id: string, newNotebookId: string) => Promise<void>
  /** 移动笔记本到新父笔记本 */
  moveNotebook: (id: string, newParentId: string | null) => Promise<void>

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

  // ============ 闪念 ============
  flashThoughts: FlashThought[]
  loadFlashThoughts: () => Promise<void>
  createFlashThought: (content: string) => Promise<void>
  updateFlashThought: (id: string, content: string) => Promise<void>
  setFlashThoughtDone: (id: string, done: boolean) => Promise<void>
  deleteFlashThought: (id: string) => Promise<void>

  // 甯冨眬
  sidebarVisible: boolean
  previewVisible: boolean
  editorVisible: boolean
  /** 每个标签页独立保存的布局状态，切换时恢复 */
  tabLayouts: Record<string, { editorVisible: boolean; previewVisible: boolean }>
  toggleSidebar: () => void
  togglePreview: () => void
  toggleEditor: () => void

  // 主视图模式：'notes' 显示编辑器/预览，'recycle-bin' 显示回收站，'flash-thoughts' 显示闪念
  viewMode: 'notes' | 'recycle-bin' | 'flash-thoughts'
  setViewMode: (mode: 'notes' | 'recycle-bin' | 'flash-thoughts') => void

  // 淇濆瓨鐘舵€?  saveStatus: { saving: boolean; lastSaved: number | null }
  saveStatus: { saving: boolean; lastSaved: number | null }
  setSaveStatus: (status: { saving?: boolean; lastSaved?: number | null }) => void

  // 同步状态字段（之前在原文件里被注释吃掉了，导致 TS 编译报"Property 'syncStatus' does not exist"。
  //   这里显式声明，加上后面我新增的 refreshSyncStatus action。）
  syncStatus: SyncStatus
  setSyncStatus: (status: SyncStatus) => void
  /**
   * 刷新同步状态：
   *  - 调 git.status() 数未同步文件 → pendingFiles
   *  - 调 git.isConfigured() 看是否已配置 → 决定 unconfigured / idle
   *  - 把当前 settings.gitSync.lastSyncAt 接到 syncStatus
   *
   *  在以下时机调：
   *  - 应用启动后（loadSettings 之后）
   *  - 任何写笔记/写笔记本的 store action 完成后
   *  - push / pull / sync 完成后（先 setSyncStatus 让用户看到状态，再调一次刷新 pendingFiles）
   */
  refreshSyncStatus: () => Promise<void>
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
      expandedNotebooks: settings.expandedNotebooks ?? [],
      // 多标签页：启动恢复（去重 + 过滤空）
      openTabs: Array.isArray(settings.layout?.openTabs)
        ? Array.from(new Set(settings.layout.openTabs.filter(Boolean)))
        : [],
      activeTabId: settings.layout?.activeTabId ?? null
    })
    // 同步 lastSyncAt 到 syncStatus（启动时让 UI 立刻看到上次同步时间）
    if (settings.gitSync?.lastSyncAt) {
      const cur = get().syncStatus
      if (cur.lastSyncAt !== settings.gitSync.lastSyncAt) {
        set({
          syncStatus: { ...cur, lastSyncAt: settings.gitSync.lastSyncAt }
        })
      }
    }
    // 检查 pending / unconfigured
    await get().refreshSyncStatus()
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
  selectedNotebookId: null,
  currentNote: null,
  openTabs: [],
  activeTabId: null,
  /** 追踪 selectNote 请求序列，防止快速切换时旧请求覆盖新笔记 */
  _selectNoteSeq: 0,
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
    // 立即用 store 里已有的 note 数据占位 currentNote，避免 await 期间 currentNote 仍是上一个笔记
    // 但仅当 currentNote 非 null（即切换笔记时）才做抢占。
    // 启动时 currentNote 为 null，跳过缓存抢占，避免缓存内容为空导致编辑器先闪一帧空白。
    const cached = get().notes.find(n => n.id === id)
    if (cached && get().currentNote) {
      set({ currentNote: cached })
    }
    // 递增序列号，用于忽略快速切换时过时的响应
    const seq = get()._selectNoteSeq + 1
    set({ _selectNoteSeq: seq })
    const note = await window.inkslateApi.notes.get(id)
    // 忽略过时响应（当前序列号已不是本次请求的 seq）
    if (get()._selectNoteSeq !== seq) return
    set({ currentNote: note })
    // 同时更新 notes 缓存列表里这一条的 content，避免后续切回时用旧缓存覆盖
    set((state) => ({
      notes: state.notes.map((n) => (n.id === note.id ? note : n))
    }))
    // 多标签页：维护 openTabs + activeTabId
    //  - 笔记已在 openTabs 里：保持位置不变，仅激活（不重排，避免手动切换时标签跳动）
    //  - 笔记不在：追加到末尾 + 激活，并初始化布局
    const tabs = get().openTabs
    const existingIdx = tabs.indexOf(id)
    const isNewTab = existingIdx < 0
    const newTabs = isNewTab
      ? [...tabs, id]
      : tabs
    set({ openTabs: newTabs, activeTabId: id })
    // 持久化 tabs（防抖到 settings.layout.openTabs）
    const layout = get().settings?.layout
    if (layout && (layout.openTabs?.join(',') !== newTabs.join(',') || layout.activeTabId !== id)) {
      window.inkslateApi.settings.update({
        layout: { ...layout, openTabs: newTabs, activeTabId: id }
      }).catch(() => {})
    }
    // 多标签页布局：切换前保存当前 tab 的布局状态
    const prevTabId = get().activeTabId
    if (prevTabId && prevTabId !== id) {
      const layouts = { ...get().tabLayouts }
      layouts[prevTabId] = {
        editorVisible: get().editorVisible,
        previewVisible: get().previewVisible
      }
      set({ tabLayouts: layouts })
    }

    // 布局初始化：
    //  - 代码/富文本笔记：无论新标签还是已有标签，都必须确保 editor 可见、预览关闭，
    //    否则启动时恢复的 layout 可能是上次看 markdown 时保存的 editorVisible=false → 右半空白
    //  - 其他格式：仅对新打开的标签页做布局初始化
    if (note && (note.format === 'code' || note.format === 'richtext' || note.format === 'spreadsheet')) {
      if (layout && layout.previewVisible) {
        get().updateSettings({ layout: { ...layout, previewVisible: false } })
      }
      set({ previewVisible: false })
      if (!get().editorVisible) {
        set({ editorVisible: true })
        if (layout) {
          get().updateSettings({ layout: { ...layout, editorVisible: true } })
        }
      }
    } else if (note && isNewTab) {
      // 代码/富文本笔记不需要预览面板：选中的瞬间自动收起
      if (note.format === 'code' || note.format === 'richtext' || note.format === 'spreadsheet') {
        if (layout && layout.previewVisible) {
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
      if (note.format === 'markdown' || note.format === 'html') {
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
      // url 网页笔记：Editor 对 url 不渲染（见 Layout），必须强制打开预览
      if (note.format === 'url' || note.format === 'file') {
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
      // 保存新标签的布局
      set(state => ({
        tabLayouts: { ...state.tabLayouts, [id]: { editorVisible: state.editorVisible, previewVisible: state.previewVisible } }
      }))
    } else if (note && !isNewTab) {
      // 恢复已保存的布局（如果有）
      const saved = get().tabLayouts[id]
      if (saved) {
        set({ editorVisible: saved.editorVisible, previewVisible: saved.previewVisible })
      } else if (note.format === 'url' || note.format === 'file') {
        // 兜底：tabLayouts 是 zustand 内存态，重启后丢失。
        // 但 openTabs 在 settings 里持久化了，启动时 App.tsx 只 selectNote(active)
        // 恢复当前激活标签，openTabs 里其他标签的 tabLayouts 都是空。
        // 这里按格式强制初始化：url/file 笔记的 Editor 不渲染，editorVisible 必为 false，
        // 否则全局 editorVisible=true（上一个 md 标签打开过）会让 preview 卡在 previewWidth
        // 填不满右侧 → 用户看到"半个屏幕空白"
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
      // 无论 saved 与否，都把当前布局写回 tabLayouts，
      // 保证后续切换/重启场景下，这个标签的布局不会再次缺失
      set(state => ({
        tabLayouts: { ...state.tabLayouts, [id]: { editorVisible: get().editorVisible, previewVisible: get().previewVisible } }
      }))
    }
  },

  selectNotebook: (id) => {
    set({ selectedNotebookId: id, selectedNoteId: null })
  },

  // ============ 多标签页 ============
  openTab: async (id) => {
    // 复用 selectNote 的逻辑（它会自动维护 openTabs + activeTabId）
    await get().selectNote(id)
  },
  activateTab: async (id) => {
    if (!get().openTabs.includes(id)) {
      // 不在 tab 列表里 → 当作打开新 tab
      await get().openTab(id)
      return
    }
    // 已存在但未激活：复用 selectNote（会更新 activeTabId / currentNote / 持久化）
    if (get().activeTabId !== id) {
      await get().selectNote(id)
    }
  },
  closeTab: async (id) => {
    const { openTabs, activeTabId, currentNote } = get()
    const idx = openTabs.indexOf(id)
    if (idx < 0) return
    const newTabs = openTabs.filter(t => t !== id)
    let newActive = activeTabId
    let newCurrent = currentNote
    let newSelected = get().selectedNoteId
    if (activeTabId === id) {
      // 优先选右侧，没有则选左侧，再没有则 null
      newActive = newTabs[idx] || newTabs[idx - 1] || null
      newSelected = newActive
      if (newActive) {
        const note = await window.inkslateApi.notes.get(newActive)
        newCurrent = note
      } else {
        newCurrent = null
      }
    }
    set({
      openTabs: newTabs,
      activeTabId: newActive,
      selectedNoteId: newSelected,
      currentNote: newCurrent
    })
    // 清理已关闭标签的布局
    const layouts = { ...get().tabLayouts }
    delete layouts[id]
    set({ tabLayouts: layouts })
    // 持久化
    const layout = get().settings?.layout
    if (layout) {
      window.inkslateApi.settings.update({
        layout: { ...layout, openTabs: newTabs, activeTabId: newActive }
      }).catch(() => {})
    }
  },
  reorderTabs: (orderedIds) => {
    set({ openTabs: orderedIds })
    const layout = get().settings?.layout
    if (layout) {
      window.inkslateApi.settings.update({
        layout: { ...layout, openTabs: orderedIds }
      }).catch(() => {})
    }
  },
  closeTabsExcept: async (id, mode) => {
    const { openTabs, activeTabId, currentNote } = get()
    const idx = openTabs.indexOf(id)
    if (idx < 0) return
    let newTabs: string[]
    if (mode === 'left') newTabs = openTabs.slice(idx)
    else if (mode === 'right') newTabs = openTabs.slice(0, idx + 1)
    else newTabs = [id]

    let newActive = activeTabId
    let newCurrent = currentNote
    let newSelected = get().selectedNoteId
    if (!newTabs.includes(activeTabId)) {
      // 当前激活标签被关掉了 → 激活锚点 id
      newActive = id
      newSelected = id
      const note = await window.inkslateApi.notes.get(id)
      newCurrent = note
    }
    // 清理已关闭标签的布局
    const closed = openTabs.filter(t => !newTabs.includes(t))
    const layouts = { ...get().tabLayouts }
    closed.forEach(t => delete layouts[t])

    set({
      openTabs: newTabs,
      activeTabId: newActive,
      selectedNoteId: newSelected,
      currentNote: newCurrent,
      tabLayouts: layouts
    })
    const layout = get().settings?.layout
    if (layout) {
      window.inkslateApi.settings.update({
        layout: { ...layout, openTabs: newTabs, activeTabId: newActive }
      }).catch(() => {})
    }
  },

  createNotebook: async (name, parentId, icon) => {
    // 未显式指定图标时按名称自动匹配（占位名如「新建笔记本」不命中 → 保持默认文件夹）
    const matched = icon ?? matchNotebookIcon(name) ?? undefined
    const nb = await window.inkslateApi.notebooks.create(name, parentId, matched)
    await get().loadNotebooks()
    await get().refreshSyncStatus()
    return nb
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
      // 保存到 tabLayouts
      set(state => ({
        tabLayouts: { ...state.tabLayouts, [note.id]: { editorVisible: true, previewVisible: state.previewVisible } }
      }))
    }
    await get().refreshSyncStatus()
    return note
  },
  updateNote: async (id, updates) => {
    get().setSaveStatus({ saving: true })
    try {
      console.log('[store] updateNote called', id, 'content length:', updates.content?.length)
      const updated = await window.inkslateApi.notes.update(id, updates)
      console.log('[store] updateNote IPC done, updated.path:', updated.path)
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
      // 局部更新 notes 列表里那一条，让侧边栏树状图和切回时的缓存占位使用最新数据
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? { ...n, title: updated.title, content: updated.content, url: updated.url, updatedAt: updated.updatedAt } : n))
      }))
      get().setSaveStatus({ saving: false, lastSaved: Date.now() })
      // 同步状态：内容/title 改了 → 磁盘文件被重写 → 视作"待同步"
      console.log('[store] about to refreshSyncStatus')
      await get().refreshSyncStatus()
      console.log('[store] refreshSyncStatus done, new status:', get().syncStatus)
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
    // 取旧名与旧图标（loadNotebooks 前的 store 仍是旧数据）
    const prev = get().notebooks.find(n => n.id === id)
    await window.inkslateApi.notebooks.rename(id, name)
    if (prev) {
      // 仅当图标从未设置、或当前图标正是「旧名称的自动匹配结果」时才重新匹配，
      // 保证用户手动选择的图标在重命名时不被覆盖。
      const autoPrev = matchNotebookIcon(prev.name)
      const isAuto = !prev.icon || prev.icon === autoPrev
      if (isAuto) {
        const nextIcon = matchNotebookIcon(name)
        if (nextIcon !== (prev.icon ?? null)) {
          await window.inkslateApi.notebooks.update(id, { icon: nextIcon })
        }
      }
    }
    await get().loadNotebooks()
    await get().refreshSyncStatus()
  },
  updateNotebook: async (id, updates) => {
    await window.inkslateApi.notebooks.update(id, updates)
    await get().loadNotebooks()
    await get().refreshSyncStatus()
  },
  renameNote: async (id, title) => {
    const updated = await window.inkslateApi.notes.update(id, { title })
    if (get().currentNote?.id === id) {
      set({ currentNote: updated })
    }
    await get().loadNotes()
    await get().refreshSyncStatus()
  },
  deleteNotebook: async (id) => {
    await window.inkslateApi.notebooks.delete(id)
    await get().loadNotebooks()
    await get().loadRecycleBin()
    await get().refreshSyncStatus()
  },
  deleteNote: async (id) => {
    await window.inkslateApi.notes.delete(id)
    // 多标签页：从 openTabs 移除被删笔记；若它是当前激活的，激活相邻那个
    const { openTabs, activeTabId, currentNote } = get()
    const idx = openTabs.indexOf(id)
    if (idx >= 0) {
      const newTabs = openTabs.filter(t => t !== id)
      let newActive = activeTabId
      if (activeTabId === id) {
        // 优先选右侧，没有则选左侧，再没有则 null
        newActive = newTabs[idx] || newTabs[idx - 1] || null
      }
      set({
        openTabs: newTabs,
        activeTabId: newActive,
        selectedNoteId: newActive,
        currentNote: currentNote?.id === id ? null : currentNote
      })
      // 持久化
      const layout = get().settings?.layout
      if (layout) {
        window.inkslateApi.settings.update({
          layout: { ...layout, openTabs: newTabs, activeTabId: newActive }
        }).catch(() => {})
      }
      // 切换到新激活笔记（如果有）
      if (newActive && newActive !== id) {
        await get().selectNote(newActive)
      }
    }
    await get().loadNotes()
    await get().loadRecycleBin()
    await get().refreshSyncStatus()
  },

  reorderNotes: async (notebookId, orderedIds) => {
    await window.inkslateApi.notes.reorder(notebookId, orderedIds)
    // 关键：除了重排 notes 数组顺序，还要更新每个 note 的 sortOrder 字段，
    // 否则 buildNoteTree 里的 sortNodes 仍按 sortOrder 排，UI 不变。
    set((state) => {
      const noteMap = new Map(state.notes.map(n => [n.id, n]))
      const reordered: Note[] = orderedIds
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
    await get().refreshSyncStatus()
  },
  reorderNotebooks: async (parentId, orderedIds) => {
    await window.inkslateApi.notebooks.reorder(parentId, orderedIds)
    set((state) => {
      const nbMap = new Map(state.notebooks.map(n => [n.id, n]))
      const reordered: Notebook[] = orderedIds
        .map((id, idx) => {
          const n = nbMap.get(id)
          if (!n) return undefined
          return { ...n, sortOrder: Date.now() + (orderedIds.length - idx) * 1000 }
        })
        .filter((n): n is Notebook => !!n)
      const rest = state.notebooks.filter(n => n.parentId !== parentId)
      return { notebooks: [...rest, ...reordered] }
    })
    await get().refreshSyncStatus()
  },

  moveNote: async (id, newNotebookId) => {
    await window.inkslateApi.notes.move(id, newNotebookId)
    await get().loadNotes()
    await get().refreshSyncStatus()
  },

  moveNotebook: async (id, newParentId) => {
    await window.inkslateApi.notebooks.move(id, newParentId)
    await get().loadNotebooks()
    await get().refreshSyncStatus()
  },

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

  // ============ 闪念 ============
  flashThoughts: [],
  loadFlashThoughts: async () => {
    const flashThoughts = await window.inkslateApi.flashThoughts.list()
    set({ flashThoughts })
  },
  createFlashThought: async (content) => {
    await window.inkslateApi.flashThoughts.create(content)
    await get().loadFlashThoughts()
    await get().refreshSyncStatus()
  },
  updateFlashThought: async (id, content) => {
    await window.inkslateApi.flashThoughts.update(id, content)
    await get().loadFlashThoughts()
    await get().refreshSyncStatus()
  },
  setFlashThoughtDone: async (id, done) => {
    await window.inkslateApi.flashThoughts.setDone(id, done)
    await get().loadFlashThoughts()
    await get().refreshSyncStatus()
  },
  deleteFlashThought: async (id) => {
    await window.inkslateApi.flashThoughts.delete(id)
    await get().loadFlashThoughts()
    await get().refreshSyncStatus()
  },

  sidebarVisible: true,
  previewVisible: true,
  editorVisible: true,
  tabLayouts: {},
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
    // 互斥逻辑：如果要关闭预览，检查编辑器是否可见，如果编辑器不可见，则不允许关闭预览
    if (!visible && !get().editorVisible) {
      // 预览关闭时编辑器不可见，不允许关闭预览（至少保持一个面板可见）
      return
    }
    set({ previewVisible: visible })
    // 保存到当前标签页布局
    const tabId = get().activeTabId
    if (tabId) {
      const layouts = { ...get().tabLayouts }
      layouts[tabId] = { ...(layouts[tabId] || {}), previewVisible: visible }
      set({ tabLayouts: layouts })
    }
    get().updateSettings({ layout: { ...get().settings!.layout, previewVisible: visible } })
  },
  toggleEditor: () => {
    const visible = !get().editorVisible
    // 互斥逻辑：如果要关闭编辑器，检查预览是否可见，如果预览不可见，则不允许关闭编辑器
    if (!visible && !get().previewVisible) {
      // 编辑器关闭时预览不可见，不允许关闭编辑器（至少保持一个面板可见）
      return
    }
    set({ editorVisible: visible })
    // 保存到当前标签页布局
    const tabId = get().activeTabId
    if (tabId) {
      const layouts = { ...get().tabLayouts }
      layouts[tabId] = { ...(layouts[tabId] || {}), editorVisible: visible }
      set({ tabLayouts: layouts })
    }
    get().updateSettings({ layout: { ...get().settings!.layout, editorVisible: visible } })
  },

  viewMode: 'notes',
  setViewMode: (mode) => set({ viewMode: mode }),

  saveStatus: { saving: false, lastSaved: null },
  setSaveStatus: (status) => set(s => ({
    saveStatus: { ...s.saveStatus, ...status }
  })),

  syncStatus: { state: 'idle' },
  setSyncStatus: (status) => set({ syncStatus: status }),

  /**
   * 刷新 pendingFiles / lastSyncAt / unconfigured 标记
   *
   * 关键设计：
   *  - 不强行覆盖 state（如果是 syncing / success / error 留给上层决定）
   *  - 只在 idle 时，根据 pendingFiles 算 connected / pending
   *  - unconfigured 优先于一切（用户还没配好 Git）
   */
  refreshSyncStatus: async () => {
    try {
      // 配置 / 初始化检查
      const cfg = await window.inkslateApi.git.isConfigured()
      if (!cfg.configured || !cfg.initialized) {
        const next: SyncStatus = {
          state: 'unconfigured',
          message: '未配置 Git 同步',
          pendingFiles: 0
        }
        const settings = get().settings
        if (settings?.gitSync?.lastSyncAt) next.lastSyncAt = settings.gitSync.lastSyncAt
        // 只有不同才 set，避免无谓的 re-render
        const cur = get().syncStatus
        if (cur.state !== next.state || cur.pendingFiles !== 0) {
          set({ syncStatus: next })
        }
        return
      }

      // 已配置 → 拿工作区变更
      let pendingFiles = 0
      try {
        const changes = await window.inkslateApi.git.status()
        // git.status() 只返回有变更的文件；包含 modified / new / deleted / untracked
        pendingFiles = Array.isArray(changes) ? changes.length : 0
      } catch (e) {
        // git status 失败（未初始化 / 路径不存在等） → 当 0 个待同步
        console.warn('[sync] status failed:', e)
      }

      const settings = get().settings
      const lastSyncAt = settings?.gitSync?.lastSyncAt

      const cur = get().syncStatus
      // 只有 idle / pending / unconfigured 才需要被 pendingFiles 改变；
      // syncing / success / error 是用户主动操作的瞬时态，不能被这个 hook 干扰
      if (cur.state === 'syncing' || cur.state === 'success' || cur.state === 'error') {
        // 但 pendingFiles / lastSyncAt 还是要更新（用户操作前显示的 badge）
        const next: SyncStatus = {
          ...cur,
          pendingFiles,
          lastSyncAt: lastSyncAt ?? cur.lastSyncAt
        }
        if (next.pendingFiles !== cur.pendingFiles || next.lastSyncAt !== cur.lastSyncAt) {
          set({ syncStatus: next })
        }
        return
      }

      // idle / pending / connected → 用 pendingFiles 决定标签
      const next: SyncStatus = {
        state: pendingFiles > 0 ? 'pending' : 'idle',
        message: pendingFiles > 0 ? '待同步' : '就绪',
        pendingFiles,
        lastSyncAt
      }
      if (
        cur.state !== next.state ||
        cur.pendingFiles !== next.pendingFiles ||
        cur.lastSyncAt !== next.lastSyncAt
      ) {
        set({ syncStatus: next })
      }
    } catch (e) {
      console.warn('[sync] refreshSyncStatus failed:', e)
    }
  }
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
