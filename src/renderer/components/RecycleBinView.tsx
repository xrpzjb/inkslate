import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/app'
import { Note, Notebook } from '@shared/types'
import {
  Trash2, RotateCcw, FileText, Folder, FolderOpen, Inbox,
  Calendar, AlertTriangle, FileCode2, FileType2, Globe, X,
  Link2, Paperclip, Table
} from 'lucide-react'
import { confirm } from './ConfirmDialog'

type Tab = 'notes' | 'notebooks'

/** 回收站主视图：tab 切换笔记/笔记本，每条带"还原"和"永久删除"按钮 */
export function RecycleBinView() {
  const [tab, setTab] = useState<Tab>('notes')

  const deletedNotes = useAppStore(s => s.deletedNotes)
  const deletedNotebooks = useAppStore(s => s.deletedNotebooks)
  const settings = useAppStore(s => s.settings)
  const loadRecycleBin = useAppStore(s => s.loadRecycleBin)
  const restoreNote = useAppStore(s => s.restoreNote)
  const restoreNotebook = useAppStore(s => s.restoreNotebook)
  const purgeNote = useAppStore(s => s.purgeNote)
  const purgeNotebook = useAppStore(s => s.purgeNotebook)

  // 挂载时拉一次（store 里可能为空）
  useEffect(() => {
    loadRecycleBin()
  }, [])

  const retentionDays = settings?.recycleBin?.retentionDays ?? 30
  const totalCount = deletedNotes.length + deletedNotebooks.length
  const isEmpty = totalCount === 0

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)'
    }}>
      {/* 顶部：标题 + 提示 */}
      <div style={{
        padding: '20px 32px 12px',
        backgroundColor: 'var(--bg-primary)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Inbox size={20} color="var(--text-secondary)" />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            回收站
          </h2>
          {totalCount > 0 && (
            <span style={{
              padding: '2px 8px',
              fontSize: 11,
              background: 'var(--bg-secondary)',
              color: 'var(--text-tertiary)',
              borderRadius: 10,
              fontWeight: 500
            }}>
              共 {totalCount} 条
            </span>
          )}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {retentionDays > 0
            ? `已删除的笔记和笔记本会在此处保留 ${retentionDays} 天后自动清理，可在 文件 → 回收站 → 保留天数设置 中修改`
            : '自动清理已关闭，需手动清空'}
        </p>
      </div>

      {/* Tab 栏 */}
      <div style={{
        display: 'flex',
        gap: 0,
        padding: '0 32px',
        backgroundColor: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')} count={deletedNotes.length}>
          笔记
        </TabButton>
        <TabButton active={tab === 'notebooks'} onClick={() => setTab('notebooks')} count={deletedNotebooks.length}>
          笔记本
        </TabButton>
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 32px 32px' }}>
        {isEmpty ? (
          <EmptyState />
        ) : tab === 'notes' ? (
          <NoteList
            notes={deletedNotes}
            onRestore={async (id) => { await restoreNote(id) }}
            onPurge={async (id) => {
              if (await confirm({ message: '永久删除这条笔记？文件将被彻底删除，无法恢复。', danger: true })) {
                await purgeNote(id)
              }
            }}
          />
        ) : (
          <NotebookList
            notebooks={deletedNotebooks}
            onRestore={async (id) => { await restoreNotebook(id) }}
            onPurge={async (id) => {
              if (await confirm({ message: '永久删除这个笔记本？文件夹不会被删除，但里面的笔记若各自仍在回收站仍可单独还原。', danger: true })) {
                await purgeNotebook(id)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, count, children }: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent-color)' : '2px solid transparent',
        color: active ? 'var(--accent-color)' : 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        marginBottom: -1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }}
    >
      {children}
      <span style={{
        fontSize: 11,
        background: active ? 'var(--accent-color)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-tertiary)',
        padding: '1px 6px',
        borderRadius: 8,
        fontWeight: 500
      }}>
        {count}
      </span>
    </button>
  )
}

function EmptyState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      color: 'var(--text-tertiary)',
      gap: 12
    }}>
      <Trash2 size={48} opacity={0.3} />
      <p style={{ margin: 0, fontSize: 14 }}>回收站是空的</p>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>删除的笔记和笔记本会出现在这里</p>
    </div>
  )
}

function NoteList({ notes, onRestore, onPurge }: {
  notes: Note[]
  onRestore: (id: string) => void | Promise<void>
  onPurge: (id: string) => void | Promise<void>
}) {
  if (notes.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        没有已删除的笔记
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {notes.map(n => <NoteRow key={n.id} note={n} onRestore={onRestore} onPurge={onPurge} />)}
    </div>
  )
}

function NoteRow({ note, onRestore, onPurge }: {
  note: Note
  onRestore: (id: string) => void | Promise<void>
  onPurge: (id: string) => void | Promise<void>
}) {
  const formatInfo = {
    markdown: { Icon: FileText, label: 'Markdown', color: '#7d8590' },
    html: { Icon: Globe, label: 'HTML', color: '#e67e22' },
    richtext: { Icon: FileType2, label: '富文本', color: '#9b59b6' },
    code: { Icon: FileCode2, label: '代码', color: '#4a90e2' },
    url: { Icon: Link2, label: '网址', color: '#3b82f6' },
    file: { Icon: Paperclip, label: '文件', color: '#8b5cf6' },
    spreadsheet: { Icon: Table, label: '智能表格', color: '#0d9488' }
  }[note.format] ?? { Icon: FileText, label: note.format || '未知', color: '#7d8590' }
  const { Icon: FormatIcon, label: formatLabel, color: formatColor } = formatInfo

  const daysAgo = note.deletedAt ? Math.floor((Date.now() - note.deletedAt) / (24 * 60 * 60 * 1000)) : 0

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      border: '1px solid var(--border-color)',
      borderRadius: 6,
      background: 'var(--bg-secondary)',
      transition: 'background 150ms ease'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
    >
      <span style={{ color: formatColor, display: 'inline-flex' }}>
        <FormatIcon size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          color: 'var(--text-primary)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {note.title || '（无标题）'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
          <span>{formatLabel}</span>
          <span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={10} />
            {daysAgo === 0 ? '今天删除' : `${daysAgo} 天前删除`}
          </span>
          {daysAgo >= 25 && (
            <>
              <span>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#e67e22' }}>
                <AlertTriangle size={10} />
                即将清理
              </span>
            </>
          )}
        </div>
      </div>
      <ActionButton icon={<RotateCcw size={13} />} label="还原" onClick={() => onRestore(note.id)} primary />
      <ActionButton icon={<X size={13} />} label="永久删除" onClick={() => onPurge(note.id)} danger />
    </div>
  )
}

function NotebookList({ notebooks, onRestore, onPurge }: {
  notebooks: Notebook[]
  onRestore: (id: string) => void | Promise<void>
  onPurge: (id: string) => void | Promise<void>
}) {
  if (notebooks.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        没有已删除的笔记本
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {notebooks.map(nb => <NotebookRow key={nb.id} notebook={nb} onRestore={onRestore} onPurge={onPurge} />)}
    </div>
  )
}

function NotebookRow({ notebook, onRestore, onPurge }: {
  notebook: Notebook
  onRestore: (id: string) => void | Promise<void>
  onPurge: (id: string) => void | Promise<void>
}) {
  const daysAgo = notebook.deletedAt ? Math.floor((Date.now() - notebook.deletedAt) / (24 * 60 * 60 * 1000)) : 0

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      border: '1px solid var(--border-color)',
      borderRadius: 6,
      background: 'var(--bg-secondary)'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
    >
      <span style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}>
        <FolderOpen size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          color: 'var(--text-primary)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {notebook.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={10} />
            {daysAgo === 0 ? '今天删除' : `${daysAgo} 天前删除`}
          </span>
          {daysAgo >= 25 && (
            <>
              <span>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#e67e22' }}>
                <AlertTriangle size={10} />
                即将清理
              </span>
            </>
          )}
        </div>
      </div>
      <ActionButton icon={<RotateCcw size={13} />} label="还原" onClick={() => onRestore(notebook.id)} primary />
      <ActionButton icon={<X size={13} />} label="永久删除" onClick={() => onPurge(notebook.id)} danger />
    </div>
  )
}

function ActionButton({ icon, label, onClick, primary, danger }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
  danger?: boolean
}) {
  const [hover, setHover] = useState(false)
  const baseColor = primary ? 'var(--accent-color)' : danger ? '#e74c3c' : 'var(--text-secondary)'
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        fontSize: 12,
        background: hover ? (primary ? 'var(--accent-color)' : danger ? '#e74c3c' : 'var(--bg-active)') : 'transparent',
        color: hover ? '#fff' : baseColor,
        border: `1px solid ${hover ? baseColor : 'var(--border-color)'}`,
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap'
      }}
    >
      {icon}
      {label}
    </button>
  )
}