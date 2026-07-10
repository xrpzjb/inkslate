import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment, Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { format as formatSql } from 'sql-formatter'
// @ts-ignore - js-beautify 没有官方的 ESM 类型，但 default 导出是 CJS 互操作
import beautify from 'js-beautify'
import { useAppStore } from '../store/app'
import { uniqueSlug } from '../utils/headings'

// ============ 缂栬緫鍣ㄤ富棰橈細涓?appTheme id 涓€涓€瀵瑰簲 ============
import type { AppThemeId } from '../themes'

/** CJK 字符优先字体栈（编辑器里中文混排时用） */
const cjkFont = `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', sans-serif`

function makeEditorTheme(opts: {
  isDark: boolean
  bg: string
  fg: string
  caret: string
  activeLine: string
  gutterBg: string
  gutterFg: string
  gutterBorder: string
  activeLineGutterFg: string
  selectionBg: string
  selectionFg: string
  // 26 涓?token 棰滆壊
  c: {
    keyword: string; comment: string; string: string; number: string; bool: string;
    heading: string; link: string; className: string; function: string; typeName: string;
    propertyName: string; attributeName: string; attributeValue: string; tagName: string;
    operator: string; punctuation: string; bracket: string; list: string; meta: string;
    angleBracket: string; quote: string; emphasis: string; strong: string; content: string;
    monospace: string; processingInstruction: string;
  }
}): Extension {
  const base = EditorView.theme({
    '&': { backgroundColor: opts.bg, color: opts.fg, height: '100%' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)' },
    '.cm-content': {
      caretColor: opts.caret, lineHeight: '1.6', padding: '12px 0',
      fontFamily: `var(--font-mono), ${cjkFont}`,
    },
    '.cm-cursor': { borderLeftColor: opts.caret },
    '.cm-activeLine': { backgroundColor: opts.activeLine },
    '.cm-gutters': {
      backgroundColor: opts.gutterBg, color: opts.gutterFg,
      borderRight: `1px solid ${opts.gutterBorder}`, userSelect: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 8px', minWidth: '40px', textAlign: 'right' },
    '.cm-activeLineGutter': { backgroundColor: opts.activeLine, color: opts.activeLineGutterFg },
  }, { dark: opts.isDark })

  const highlight = HighlightStyle.define([
    { tag: tags.keyword, color: opts.c.keyword },
    { tag: tags.comment, color: opts.c.comment },
    { tag: tags.string, color: opts.c.string },
    { tag: tags.number, color: opts.c.number },
    { tag: tags.bool, color: opts.c.bool },
    { tag: tags.heading, color: opts.c.heading, fontWeight: 'bold' },
    { tag: tags.emphasis, color: opts.c.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, color: opts.c.strong, fontWeight: 'bold' },
    { tag: tags.link, color: opts.c.link },
    { tag: tags.url, color: opts.c.link },
    { tag: tags.monospace, color: opts.c.monospace, fontFamily: 'var(--font-mono)' },
    { tag: tags.processingInstruction, color: opts.c.processingInstruction },
    { tag: tags.className, color: opts.c.className },
    { tag: tags.function(tags.variableName), color: opts.c.function },
    { tag: tags.definition(tags.variableName), color: opts.c.function },
    { tag: tags.typeName, color: opts.c.typeName },
    { tag: tags.propertyName, color: opts.c.propertyName },
    { tag: tags.attributeName, color: opts.c.attributeName },
    { tag: tags.attributeValue, color: opts.c.attributeValue },
    { tag: tags.angleBracket, color: opts.c.angleBracket },
    { tag: tags.quote, color: opts.c.quote },
    { tag: tags.list, color: opts.c.list },
    { tag: tags.meta, color: opts.c.meta },
    { tag: tags.tagName, color: opts.c.tagName },
    { tag: tags.operator, color: opts.c.operator },
    { tag: tags.punctuation, color: opts.c.punctuation },
    { tag: tags.bracket, color: opts.c.bracket },
    { tag: tags.content, color: opts.c.content },
  ])

  const selection = EditorView.theme({
    '&.cm-focused .cm-selectionLayer .cm-selectionBackground': { backgroundColor: opts.selectionBg },
    '&.cm-focused ::selection': { backgroundColor: opts.selectionBg },
    '& .cm-selectionLayer .cm-selectionContent': { color: opts.selectionFg },
  })

  return [base, syntaxHighlighting(highlight), selection]
}

const editorLightExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#1a73e8', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: 'var(--accent-color)',
  selectionBg: '#0d47a1', selectionFg: '#ffffff',
  c: {
    keyword: '#cf222e', comment: '#6a737d', string: '#0a3069',
    number: '#0550ae', bool: '#cf222e', heading: '#1a1a1a',
    link: '#1a73e8', className: '#8250df', function: '#8250df',
    typeName: '#0550ae', propertyName: '#24292f',
    attributeName: '#8250df', attributeValue: '#0a3069',
    tagName: '#116329', operator: '#d73a49', punctuation: '#24292f',
    bracket: '#24292f', list: '#1a73e8', meta: '#e67e22',
    angleBracket: '#24292f', quote: '#6a737d', emphasis: '#1a1a1a',
    strong: '#1a1a1a', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#cf222e',
  },
})

const editorDarkExt = makeEditorTheme({
  isDark: true,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#58a6ff', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: 'var(--accent-color)',
  selectionBg: '#1f6feb', selectionFg: '#ffffff',
  c: {
    keyword: '#ff7b72', comment: '#8b949e', string: '#a5d6ff',
    number: '#79c0ff', bool: '#ff7b72', heading: '#f0f6fc',
    link: '#58a6ff', className: '#d2a8ff', function: '#d2a8ff',
    typeName: '#79c0ff', propertyName: '#c9d1d9',
    attributeName: '#d2a8ff', attributeValue: '#a5d6ff',
    tagName: '#7ee787', operator: '#ff7b72', punctuation: '#c9d1d9',
    bracket: '#c9d1d9', list: '#58a6ff', meta: '#ffa657',
    angleBracket: '#c9d1d9', quote: '#8b949e', emphasis: '#f0f6fc',
    strong: '#f0f6fc', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#ff7b72',
  },
})

const editorSolarizedExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#268bd2', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: 'var(--accent-color)',
  selectionBg: '#b58900', selectionFg: '#ffffff',
  c: {
    keyword: '#859900', comment: '#93a1a1', string: '#2aa198',
    number: '#d33682', bool: '#cb4b16', heading: '#073642',
    link: '#268bd2', className: '#b58900', function: '#268bd2',
    typeName: '#b58900', propertyName: '#586e75',
    attributeName: '#b58900', attributeValue: '#2aa198',
    tagName: '#859900', operator: '#cb4b16', punctuation: '#586e75',
    bracket: '#586e75', list: '#cb4b16', meta: '#d33682',
    angleBracket: '#586e75', quote: '#93a1a1', emphasis: '#586e75',
    strong: '#586e75', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#cb4b16',
  },
})

const editorCyberpunkExt = makeEditorTheme({
  isDark: true,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#00f0ff', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#00f0ff',
  selectionBg: '#ff00aa', selectionFg: '#ffffff',
  c: {
    keyword: '#ff00aa', comment: '#6b5b95', string: '#00f0ff',
    number: '#fcee0a', bool: '#ff00aa', heading: '#00f0ff',
    link: '#00f0ff', className: '#fcee0a', function: '#00f0ff',
    typeName: '#fcee0a', propertyName: '#f0f0ff',
    attributeName: '#fcee0a', attributeValue: '#00f0ff',
    tagName: '#00f0ff', operator: '#ff00aa', punctuation: '#c4b5fd',
    bracket: '#c4b5fd', list: '#ff00aa', meta: '#fcee0a',
    angleBracket: '#c4b5fd', quote: '#6b5b95', emphasis: '#f0f0ff',
    strong: '#f0f0ff', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#ff00aa',
  },
})

const editorDraculaExt = makeEditorTheme({
  isDark: true,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#f8f8f0', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#bd93f9',
  selectionBg: '#44475a', selectionFg: '#ffffff',
  c: {
    keyword: '#ff79c6', comment: '#6272a4', string: '#f1fa8c',
    number: '#bd93f9', bool: '#ff79c6', heading: '#f8f8f2',
    link: '#8be9fd', className: '#8be9fd', function: '#50fa7b',
    typeName: '#8be9fd', propertyName: '#f8f8f2',
    attributeName: '#50fa7b', attributeValue: '#f1fa8c',
    tagName: '#ff79c6', operator: '#ff79c6', punctuation: '#f8f8f2',
    bracket: '#f8f8f2', list: '#ff79c6', meta: '#ffb86c',
    angleBracket: '#f8f8f2', quote: '#6272a4', emphasis: '#f8f8f2',
    strong: '#f8f8f2', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#ff79c6',
  },
})

const editorDuneExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#c87533', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#c87533',
  selectionBg: '#c87533', selectionFg: '#ffffff',
  c: {
    keyword: '#a04020', comment: '#8b6a45', string: '#6b4a2b',
    number: '#c87533', bool: '#a04020', heading: '#3d2817',
    link: '#c87533', className: '#a88650', function: '#c87533',
    typeName: '#a88650', propertyName: '#3d2817',
    attributeName: '#a88650', attributeValue: '#6b4a2b',
    tagName: '#a04020', operator: '#a04020', punctuation: '#6b4a2b',
    bracket: '#6b4a2b', list: '#a04020', meta: '#a88650',
    angleBracket: '#6b4a2b', quote: '#8b6a45', emphasis: '#3d2817',
    strong: '#3d2817', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#a04020',
  },
})

const editorMonetExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#a48bd9', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#a48bd9',
  selectionBg: '#a48bd9', selectionFg: '#ffffff',
  c: {
    keyword: '#8a6fc4', comment: '#a89bc8', string: '#5b5780',
    number: '#a48bd9', bool: '#8a6fc4', heading: '#3d3a5c',
    link: '#7c6db8', className: '#a48bd9', function: '#8a6fc4',
    typeName: '#a48bd9', propertyName: '#3d3a5c',
    attributeName: '#a48bd9', attributeValue: '#5b5780',
    tagName: '#8a6fc4', operator: '#7c6db8', punctuation: '#5b5780',
    bracket: '#5b5780', list: '#8a6fc4', meta: '#a48bd9',
    angleBracket: '#5b5780', quote: '#a89bc8', emphasis: '#3d3a5c',
    strong: '#3d3a5c', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#8a6fc4',
  },
})

const editorNewspaperExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#8b4513', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#8b4513',
  selectionBg: '#8b4513', selectionFg: '#f4ecd8',
  c: {
    keyword: '#6b350f', comment: '#8a7050', string: '#5c4530',
    number: '#8b4513', bool: '#6b350f', heading: '#3a2a18',
    link: '#8b4513', className: '#a89868', function: '#6b350f',
    typeName: '#a89868', propertyName: '#3a2a18',
    attributeName: '#a89868', attributeValue: '#5c4530',
    tagName: '#6b350f', operator: '#6b350f', punctuation: '#5c4530',
    bracket: '#5c4530', list: '#6b350f', meta: '#a89868',
    angleBracket: '#5c4530', quote: '#8a7050', emphasis: '#3a2a18',
    strong: '#3a2a18', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#6b350f',
  },
})

const editorForestExt = makeEditorTheme({
  isDark: true,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#7fc285', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#7fc285',
  selectionBg: '#345a45', selectionFg: '#d8e4dc',
  c: {
    keyword: '#9ed5a3', comment: '#5e7c5e', string: '#c5d8a8',
    number: '#f4a261', bool: '#9ed5a3', heading: '#d8e4dc',
    link: '#7fc285', className: '#a8c0b0', function: '#9ed5a3',
    typeName: '#a8c0b0', propertyName: '#d8e4dc',
    attributeName: '#9ed5a3', attributeValue: '#c5d8a8',
    tagName: '#9ed5a3', operator: '#f4a261', punctuation: '#a8c0b0',
    bracket: '#a8c0b0', list: '#7fc285', meta: '#f4a261',
    angleBracket: '#a8c0b0', quote: '#5e7c5e', emphasis: '#d8e4dc',
    strong: '#d8e4dc', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#9ed5a3',
  },
})

const editorSunsetExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#e85d2a', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#e85d2a',
  selectionBg: '#e85d2a', selectionFg: '#fff0e5',
  c: {
    keyword: '#c44a18', comment: '#b86850', string: '#a04020',
    number: '#e85d2a', bool: '#c44a18', heading: '#5c2818',
    link: '#e85d2a', className: '#e89060', function: '#c44a18',
    typeName: '#e89060', propertyName: '#5c2818',
    attributeName: '#e89060', attributeValue: '#a04020',
    tagName: '#c44a18', operator: '#c44a18', punctuation: '#8a4028',
    bracket: '#8a4028', list: '#c44a18', meta: '#e89060',
    angleBracket: '#8a4028', quote: '#b86850', emphasis: '#5c2818',
    strong: '#5c2818', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#c44a18',
  },
})

const editorNordicExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#5b8cb8', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#5b8cb8',
  selectionBg: '#5b8cb8', selectionFg: '#ffffff',
  c: {
    keyword: '#4677a3', comment: '#7a8a9c', string: '#4a5d72',
    number: '#5b8cb8', bool: '#4677a3', heading: '#2c3e50',
    link: '#5b8cb8', className: '#5b8cb8', function: '#4677a3',
    typeName: '#5b8cb8', propertyName: '#2c3e50',
    attributeName: '#5b8cb8', attributeValue: '#4a5d72',
    tagName: '#4677a3', operator: '#4677a3', punctuation: '#4a5d72',
    bracket: '#4a5d72', list: '#4677a3', meta: '#5b8cb8',
    angleBracket: '#4a5d72', quote: '#7a8a9c', emphasis: '#2c3e50',
    strong: '#2c3e50', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#4677a3',
  },
})

const editorPastoralExt = makeEditorTheme({
  isDark: false,
  bg: 'var(--bg-primary)', fg: 'var(--text-primary)',
  caret: '#7a9a3a', activeLine: 'var(--bg-hover)',
  gutterBg: 'var(--bg-secondary)', gutterFg: 'var(--text-tertiary)',
  gutterBorder: 'var(--border-color)', activeLineGutterFg: '#7a9a3a',
  selectionBg: '#7a9a3a', selectionFg: '#ffffff',
  c: {
    keyword: '#5e7c28', comment: '#7a8850', string: '#5a6828',
    number: '#7a9a3a', bool: '#5e7c28', heading: '#3a4818',
    link: '#7a9a3a', className: '#a8b070', function: '#5e7c28',
    typeName: '#a8b070', propertyName: '#3a4818',
    attributeName: '#a8b070', attributeValue: '#5a6828',
    tagName: '#5e7c28', operator: '#5e7c28', punctuation: '#5a6828',
    bracket: '#5a6828', list: '#5e7c28', meta: '#a8b070',
    angleBracket: '#5a6828', quote: '#7a8850', emphasis: '#3a4818',
    strong: '#3a4818', content: 'inherit', monospace: 'inherit',
    processingInstruction: '#5e7c28',
  },
})

const editorThemes: Record<AppThemeId, () => Extension> = {
  'light': () => editorLightExt,
  'dark': () => editorDarkExt,
  'solarized': () => editorSolarizedExt,
  'cyberpunk': () => editorCyberpunkExt,
  'dracula': () => editorDraculaExt,
  'dune': () => editorDuneExt,
  'monet': () => editorMonetExt,
  'newspaper': () => editorNewspaperExt,
  'forest': () => editorForestExt,
  'sunset': () => editorSunsetExt,
  'nordic': () => editorNordicExt,
  'pastoral': () => editorPastoralExt,
}

export interface CodeEditorHandle {
  insertText: (before: string, after?: string, placeholder?: string, cursorOffset?: number) => void
  /** 格式化当前代码。返回 { ok, message? }，message 是错误时给用户看的提示。 */
  formatCode: () => { ok: boolean; message?: string }
}

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  fontSize: number
  format: 'markdown' | 'html' | 'code'
  language?: string
  onSave?: () => void
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ value, onChange, fontSize, format, language, onSave }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())
  const formatCompartment = useRef(new Compartment())
  const fontSizeCompartment = useRef(new Compartment())
  // settings.theme 可以是 'auto'，但 editorThemes 只有具体 12 种配色，'auto' 落到 'light'
  const settingsTheme = useAppStore(s => s.settings?.theme)
  const theme: AppThemeId = ((settingsTheme === 'auto' || !settingsTheme || !(settingsTheme in editorThemes)) ? 'light' : settingsTheme) as AppThemeId

  useImperativeHandle(ref, () => ({
    insertText: (before: string, after = '', placeholder = '', cursorOffset?: number) => {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const selected = view.state.sliceDoc(from, to)
      const text = selected || placeholder

      const insert = before + text + after
      // 默认光标停在插入文本末尾；cursorOffset 给出时停在 from + cursorOffset
      const cursorPos = cursorOffset !== undefined ? from + cursorOffset : from + insert.length
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: cursorPos }
      })
      view.focus()
    },
    formatCode: (): { ok: boolean; message?: string } => {
      const view = viewRef.current
      if (!view) return { ok: false, message: '编辑器未就绪' }
      const text = view.state.doc.toString()
      if (!text.trim()) return { ok: true }

      const lang = (language ?? '').toLowerCase()
      try {
        let formatted: string
        let used = ''

        // 1. 优先按 language 分发
        if (lang === 'json') {
          formatted = JSON.stringify(JSON.parse(text), null, 2)
          used = 'JSON'
        } else if (lang === 'sql') {
          formatted = formatSql(text, { language: 'sql', tabWidth: 2, keywordCase: 'upper', indentStyle: 'standard' })
          used = 'SQL'
        } else if (lang === 'javascript' || lang === 'typescript') {
          formatted = (beautify as any).js(text, { indent_size: 2, space_in_empty_paren: true, end_with_newline: false })
          used = 'JavaScript'
        } else if (lang === 'html') {
          formatted = (beautify as any).html(text, { indent_size: 2, wrap_line_length: 120, end_with_newline: false })
          used = 'HTML'
        } else if (lang === 'css') {
          formatted = (beautify as any).css(text, { indent_size: 2, end_with_newline: false })
          used = 'CSS'
        } else {
          // 2. 没有 language 或不支持的 language：自动嗅探
          const trimmed = text.trim()
          // 试 JSON
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              formatted = JSON.stringify(JSON.parse(trimmed), null, 2)
              used = 'JSON (自动检测)'
            } catch {}
          }
          // 试 SQL（看是否含 SQL 关键字）
          if (!used && /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE)\b/i.test(trimmed)) {
            try {
              formatted = formatSql(trimmed, { language: 'sql', tabWidth: 2, keywordCase: 'upper', indentStyle: 'standard' })
              used = 'SQL (自动检测)'
            } catch {}
          }
          // 试 JS/TS（看是否像代码）
          if (!used && /[{};]/.test(trimmed)) {
            try {
              formatted = (beautify as any).js(trimmed, { indent_size: 2, space_in_empty_paren: true, end_with_newline: false })
              used = 'JavaScript (自动检测)'
            } catch {}
          }
          if (!used) {
            return { ok: false, message: '未识别到可格式化的代码（试试 JSON/SQL/JS）' }
          }
        }

        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: formatted },
          selection: { anchor: 0 }
        })
        view.focus()
        return { ok: true, message: `已按 ${used} 格式化` }
      } catch (e) {
        return { ok: false, message: '格式化失败：' + (e as Error).message }
      }
    }
  }), [language])

  useEffect(() => {
    if (!containerRef.current) return

    const languageExtension = (() => {
      if (format === 'code') {
        // 代码笔记：按语言选扩展（未支持的走 javascript 作为高亮 fallback，纯文本走无扩展）
        if (language === 'javascript' || language === 'typescript') return javascript({ typescript: language === 'typescript' })
        if (language === 'html') return html()
        if (language === 'css') return css()
        if (language === 'json') return javascript() // json 用 JS 模式粗略高亮
        return []
      }
      return format === 'html'
        ? html()
        : markdown({ base: markdownLanguage })
    })()

    const fontSizeExtension = EditorView.theme({
      '&': { fontSize: `${fontSize}px` },
      '.cm-content': { fontSize: `${fontSize}px` },
      '.cm-scroller': { overflow: 'auto' },
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: 'Mod-s',
          run: () => { onSave?.(); return true },
        },
        {
          key: 'Tab',
          run: (view) => {
            view.dispatch(view.state.replaceSelection('  '))
            return true
          }
        }
      ]),
      formatCompartment.current.of(languageExtension),
      themeCompartment.current.of(editorThemes[theme]()),
      fontSizeCompartment.current.of(fontSizeExtension),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString())
        }
      }),
    ]

    const state = EditorState.create({ doc: value, extensions })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    // 同步滚动：编辑器滚动时把"最靠近顶部的标题"id 派发给 Preview
    // 复用 utils/headings.ts 的 uniqueSlug，id 跟 attachHeadingIds 注入到 DOM 的一致
    let scrollTimer: number | null = null
    const onEditorScroll = () => {
      if (scrollTimer !== null) window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        const doc = view.state.doc
        const scrollTop = view.scrollDOM.scrollTop
        const usedIds = new Set<string>()
        let topId: string | null = null
        for (let i = 1; i <= doc.lines; i++) {
          const lineText = doc.line(i).text
          const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lineText)
          if (!m) continue
          const id = uniqueSlug(m[2], usedIds)
          const block = view.lineBlockAt(i)
          if (block.top <= scrollTop + 30) {
            topId = id
          } else {
            break
          }
        }
        window.dispatchEvent(new CustomEvent('inkslate:editor-top-heading', { detail: topId }))
      }, 60)
    }
    view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })

    return () => {
      view.scrollDOM.removeEventListener('scroll', onEditorScroll)
      if (scrollTimer !== null) window.clearTimeout(scrollTimer)
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, language])

  useEffect(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      effects: themeCompartment.current.reconfigure(editorThemes[theme]())
    })
  }, [theme])

  useEffect(() => {
    if (!viewRef.current) return
    const fontSizeExtension = EditorView.theme({
      '&': { fontSize: `${fontSize}px` },
      '.cm-content': { fontSize: `${fontSize}px` },
    })
    viewRef.current.dispatch({
      effects: fontSizeCompartment.current.reconfigure(fontSizeExtension)
    })
  }, [fontSize])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', minHeight: 0, height: '100%' }}
    />
  )
})

