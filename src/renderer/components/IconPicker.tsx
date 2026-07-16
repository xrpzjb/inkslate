import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as LucideIcons from 'lucide-react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import * as PhosphorIcons from '@phosphor-icons/react'
import { useAppStore } from '../store/app'
import { toast } from './Toast'
import './IconPicker.css'

/**
 * 笔记本图标选择器
 * - 按分类展示 lucide 图标
 * - 选中后调 store.updateNotebook(id, { icon })
 * - 支持清除图标（回到默认 Folder）
 */
const ICON_CATEGORIES: { name: string; icons: string[] }[] = [
  {
    name: '全部',
    icons: [] as string[] // 运行时填充全部图标
  },
  {
    name: '常用',
    icons: [
      'Bookmark', 'Star', 'Heart', 'Home', 'Folder', 'FolderOpen', 'Archive',
      'Inbox', 'Lightbulb', 'NotebookText', 'BookText', 'FileText', 'BriefcaseBusiness',
      'Palette', 'Globe', 'Settings', 'UserRound', 'Search', 'Bell', 'CalendarRange',
      'Clock', 'Flag', 'Tag', 'Pin', 'Rocket', 'Zap', 'Target', 'Award'
    ]
  },
  {
    name: '文档',
    icons: [
      'FileText', 'File', 'FilePlus', 'FilePen', 'FileSpreadsheet',
      'FileImage', 'NotebookText', 'BookOpenText', 'Book', 'BookMarked',
      'Clipboard', 'ClipboardList', 'ScrollText', 'Newspaper',
      'Pen', 'PenTool', 'Eraser', 'Printer', 'Paperclip', 'Link'
    ]
  },
  {
    name: '编程',
    icons: [
      'Code', 'Terminal', 'Command', 'GitBranch', 'GitCommit',
      'GitPullRequest', 'GitMerge', 'Github', 'Cloud', 'Database',
      'Server', 'Monitor', 'Smartphone', 'Tablet', 'Keyboard',
      'Mouse', 'Wifi', 'Shield', 'Lock', 'Cpu', 'HardDrive', 'Bug'
    ]
  },
  {
    name: '通信',
    icons: [
      'Mail', 'MessageSquare', 'MessageCircle', 'Send',
      'Phone', 'PhoneCall', 'PhoneForwarded', 'Video',
      'VideoOff', 'Contact', 'Users', 'UserPlus',
      'UserCheck', 'UserX', 'AtSign', 'Hash'
    ]
  },
  {
    name: '媒体',
    icons: [
      'Music', 'Music2', 'Film', 'Camera', 'CameraOff',
      'Image', 'Images', 'Video', 'Play', 'Pause',
      'Stop', 'SkipForward', 'SkipBack', 'Volume2',
      'Headphones', 'Radio', 'Tv', 'Gamepad2'
    ]
  },
  {
    name: '标志',
    icons: [
      'Flag', 'FlagOff', 'Tag', 'Tags', 'Bookmark',
      'BookmarkMinus', 'BookmarkPlus', 'Pin', 'PinOff',
      'MapPin', 'Navigation', 'Compass', 'Crosshair',
      'Circle', 'Target'
    ]
  },
  {
    name: '工具',
    icons: [
      'Wrench', 'Settings', 'Tool', 'Hammer', 'Sliders',
      'Cog', 'Package', 'Box', 'Backpack', 'Clipboard',
      'Scissors', 'Ruler', 'Puzzle', 'Wand', 'Paintbrush',
      'Layers', 'Grid3x3', 'Table', 'List', 'Filter'
    ]
  },
  {
    name: '形状',
    icons: [
      'Circle', 'Square', 'Triangle', 'Diamond', 'Hexagon',
      'Octagon', 'Plus', 'Minus', 'X', 'Check',
      'Divide', 'Equals', 'Infinity', 'Asterisk',
      'Hash', 'Percent', 'AtSign'
    ]
  },
  {
    name: '箭头',
    icons: [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'ChevronUp', 'ChevronDown', 'ChevronLeft', 'ChevronRight',
      'ChevronsUp', 'ChevronsDown', 'ChevronsLeft', 'ChevronsRight',
      'MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight',
      'RotateCcw', 'RotateCw', 'Maximize', 'Minimize',
      'Expand', 'Collapse', 'Move', 'ArrowUpDown'
    ]
  },
  {
    name: '天气',
    icons: [
      'Sun', 'Moon', 'Cloud', 'CloudRain', 'CloudSnow',
      'CloudLightning', 'CloudDrizzle', 'CloudFog',
      'Umbrella', 'Wind', 'Snowflake', 'Thermometer',
      'Sunrise', 'Sunset', 'MoonStar', 'SunDim'
    ]
  },
  {
    name: '食物',
    icons: [
      'Coffee', 'Apple', 'Orange', 'Banana', 'Pizza',
      'Cake', 'Beer', 'Wine', 'GlassWater',
      'Utensils', 'CupSoda', 'Sandwich', 'Egg',
      'Candy', 'Cookie', 'IceCream'
    ]
  },
  {
    name: '交通',
    icons: [
      'Plane', 'PlaneLanding', 'PlaneTakeoff', 'Car',
      'CarTaxi', 'Bike', 'Train', 'Ship', 'Bus',
      'Truck', 'Rocket', 'Satellite', 'Fuel',
      'Navigation', 'Compass'
    ]
  },
  {
    name: '动物',
    icons: [
      'Dog', 'Cat', 'Rabbit', 'Fish', 'Bird',
      'Turtle', 'PawPrint', 'Bug', 'Snail',
      'Bee', 'Butterfly', 'Feather'
    ]
  },
  {
    name: '手势',
    icons: [
      'ThumbsUp', 'ThumbsDown', 'Hand', 'Fingerprint',
      'Pointer', 'Handshake', 'HeartHandshake',
      'Clap', 'Wave', 'Scan', 'ScanFace'
    ]
  },
  {
    name: '实心',
    icons: [
      'ph:MonitorPlayFill', 'ph:HeartFill', 'ph:StarFill', 'ph:BookmarkFill',
      'ph:FolderFill', 'ph:FileTextFill', 'ph:HouseFill', 'ph:LightbulbFill',
      'ph:GlobeFill', 'ph:EnvelopeFill', 'ph:ChatCircleFill', 'ph:PhoneFill',
      'ph:CameraFill', 'ph:ImageFill', 'ph:MusicNoteFill', 'ph:FilmStripFill',
      'ph:FlagFill', 'ph:PushPinFill', 'ph:MapPinFill', 'ph:CompassFill',
      'ph:WrenchFill', 'ph:GearFill', 'ph:PackageFill', 'ph:ClipboardTextFill',
      'ph:SunFill', 'ph:MoonFill', 'ph:CloudRainFill', 'ph:UmbrellaFill',
      'ph:CoffeeFill', 'ph:PizzaFill', 'ph:CarFill', 'ph:AirplaneFill',
      'ph:CatFill', 'ph:DogFill', 'ph:ThumbsUpFill', 'ph:HandHeartFill'
    ]
  }
]

interface IconPickerProps {
  notebookId: string
  currentIcon: string | null | undefined
  position: { top: number; left: number }
  onClose: () => void
}

export function IconPicker({ notebookId, currentIcon, position, onClose }: IconPickerProps) {
  const updateNotebook = useAppStore(s => s.updateNotebook)
  const [selected, setSelected] = useState<string | null>(currentIcon ?? null)
  const [busy, setBusy] = useState(false)
  const [categoryIdx, setCategoryIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const catScrollRef = useRef<HTMLDivElement>(null)

  // 运行时填充"全部"标签页：合并所有分类图标并去重
  const allIcons = useMemo(() => {
    const set = new Set<string>()
    for (let i = 1; i < ICON_CATEGORIES.length; i++) {
      for (const icon of ICON_CATEGORIES[i].icons) {
        set.add(icon)
      }
    }
    return Array.from(set)
  }, [])

  const currentCategory = categoryIdx === 0
    ? { name: '全部', icons: allIcons }
    : ICON_CATEGORIES[categoryIdx]
  const icons = currentCategory?.icons ?? []
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const handlePick = async (iconName: string | null) => {
    setSelected(iconName)
    setBusy(true)
    try {
      await updateNotebook(notebookId, { icon: iconName })
    } catch (e) {
      console.error('Failed to update notebook icon:', e)
      toast.error('图标更新失败：' + ((e as Error)?.message || '未知错误'))
    } finally {
      onClose()
    }
  }

  const scrollCat = (dir: 'left' | 'right') => {
    const el = catScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' })
  }

  return createPortal(
    <div
      ref={wrapRef}
      className="notebook-icon-picker"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="notebook-icon-picker-header">
        <span>选择图标</span>
        <button className="notebook-icon-picker-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* 分类标签栏 */}
      <div className="notebook-icon-picker-categories-wrap">
        <button className="notebook-icon-picker-cat-scroll" onClick={() => scrollCat('left')}>
          <ChevronLeft size={12} />
        </button>
        <div className="notebook-icon-picker-categories" ref={catScrollRef}>
          {ICON_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              className={'notebook-icon-picker-cat-btn' + (idx === categoryIdx ? ' active' : '')}
              onClick={() => setCategoryIdx(idx)}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <button className="notebook-icon-picker-cat-scroll" onClick={() => scrollCat('right')}>
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="notebook-icon-picker-grid">
        {icons.map(name => {
          const Icon = name.startsWith('ph:')
            ? (PhosphorIcons as any)[name.slice(3)]
            : (LucideIcons as any)[name]
          if (!Icon) return null
          const isSelected = selected === name
          return (
            <button
              key={name}
              className={'notebook-icon-picker-item' + (isSelected ? ' selected' : '')}
              onClick={() => handlePick(name)}
              title={name}
              disabled={busy}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>

      <div className="notebook-icon-picker-footer">
        <button
          className="notebook-icon-picker-clear"
          onClick={() => handlePick(null)}
          disabled={busy || !currentIcon}
        >
          使用默认图标
        </button>
      </div>
    </div>,
    document.body
  )
}
