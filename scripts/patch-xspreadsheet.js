/**
 * 补丁 x-data-spreadsheet 的画布配色与文字对比度，让智能表格真正跟随主题
 * ——包括「暗黑编辑器」模式（settings.editorDark）。
 *
 * 库在 canvas 上硬编码了浅色表头（#f4f5f8）、网格线（#e6e6e6）、单元格兜底白底（#ffffff）；
 * 单元格文字色则来自数据里存下的颜色（用户当初在亮色主题下选的），这两类都无法用 CSS 覆盖。
 * 本脚本把画布取色改成"渲染时读当前容器的主题变量"，并对撞色的文字做对比度兜底。
 *
 * v2（本次）相比 v1：
 *  1. 取色作用域：从 document.documentElement 改成表格所在容器 .spreadsheet-view。
 *     暗黑编辑器模式是靠 [data-editor-dark="true"] 覆盖 CSS 变量实现的，
 *     只读 <html> 会拿到"亮色主题"的值 → 外围 DOM 变暗、画布仍是浅色，观感割裂。
 *  2. 画布兜底底色（DrawBox 默认值 / rect 的 '#fff' 兜底）也跟随主题。
 *  3. 新增对比度兜底 spreadsheetReadableStyle()：
 *     数据里写死的颜色（亮色主题下选的深色字、或浅灰底色 + 深色字）在暗色主题下会和
 *     底色撞成一个色系，出现"字看不清"。渲染时按底色亮度校正文字色（只在对比度 < 3 时才改，
 *     且从不改用户选的底色）—— 这是"暗黑模式下有些字体看不清"的直接修复。
 *
 * 在 package.json 的 postinstall 里执行（node scripts/patch-xspreadsheet.js），
 * npm install 后自动生效；脚本幂等，v1 打过补丁的库也能就地升级到 v2。
 *
 * 安全策略：任何一处"既找不到原文、也没有目标态"就放弃该文件（保持原样），绝不写入半成品。
 * 注意：补丁改的是 node_modules 里的库源码（npm 的 main 指向 src/index.js），
 * 改完必须重新 build（Vite 才会把新代码打进 dist）。
 */
const fs = require('node:fs')
const path = require('node:path')

// 库位置：默认 node_modules/x-data-spreadsheet；
// 可用 INKSLATE_XSPREADSHEET_DIR 指向别处（便于在一份未打过补丁的拷贝上验证首次安装路径）。
const LIB = process.env.INKSLATE_XSPREADSHEET_DIR
  ? path.resolve(process.env.INKSLATE_XSPREADSHEET_DIR)
  : path.join(__dirname, '..', 'node_modules', 'x-data-spreadsheet')

/** 注入到库源码里的公共工具（取色 + 颜色解析 + 对比度） */
const THEME_HELPER = `/* ===== inkslate-spreadsheet-theme-patch v2 =====
 * 画布取色 + 文字对比度兜底。由 scripts/patch-xspreadsheet.js 注入，请勿手改。
 * 取色必须读"表格所在容器"而不是 <html>：暗黑编辑器模式是靠在编辑区容器上
 * 覆盖 CSS 变量实现的，读 <html> 会拿到亮色主题的值。
 */
function spreadsheetThemeCss(name, fallback) {
  try {
    if (typeof document === 'undefined') return fallback;
    const el = document.querySelector('.spreadsheet-view') || document.documentElement;
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}
function spreadsheetParseColor(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    return m[1].split('').map((c) => parseInt(c + c, 16));
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\\(([^)]+)\\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\\s,/]+/).filter(Boolean).slice(0, 3).map((x) => parseFloat(x));
    if (parts.length === 3 && parts.every((x) => !Number.isNaN(x))) return parts;
  }
  return null;
}
function spreadsheetLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}
function spreadsheetContrast(a, b) {
  const la = spreadsheetLuminance(a);
  const lb = spreadsheetLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/**
 * 单元格文字色的对比度兜底。
 * 表格数据里存的是"当时那套主题"下选的颜色（亮色主题里设的深色字、或浅灰底色 + 深色字）。
 * 切到暗色主题 / 暗黑编辑器后底色与默认文字色都反了过来，写死的颜色就会和底色同色系 → 看不清。
 * 只在对比度 < 3（确实看不清）时才改文字色：优先用主题文字色，仍不够就按底色亮度取黑/白；
 * 用户选的底色一律不动。
 */
function spreadsheetReadableStyle(rawStyle) {
  try {
    if (!rawStyle) return rawStyle;
    const bg = spreadsheetParseColor(rawStyle.bgcolor || spreadsheetThemeCss('--bg-primary', '#ffffff'));
    if (!bg) return rawStyle;
    const themeTextCss = spreadsheetThemeCss('--text-primary', '#111827');
    const fg = spreadsheetParseColor(rawStyle.color) || spreadsheetParseColor(themeTextCss);
    if (!fg) return rawStyle;
    if (spreadsheetContrast(fg, bg) >= 3) return rawStyle;
    const themeText = spreadsheetParseColor(themeTextCss);
    if (themeText && spreadsheetContrast(themeText, bg) >= 3) {
      return Object.assign({}, rawStyle, { color: themeTextCss });
    }
    const picked = spreadsheetLuminance(bg) > 0.5 ? '#111827' : '#f5f5f5';
    const pickedRgb = spreadsheetParseColor(picked);
    if (pickedRgb && spreadsheetContrast(pickedRgb, bg) >= 3) {
      return Object.assign({}, rawStyle, { color: picked });
    }
    return rawStyle;
  } catch (e) {
    return rawStyle;
  }
}
/* ===== end inkslate patch v2 ===== */
`

/** v2 版本的主题化常量（与 v1 相同：v1 只差在取色作用域由 helper 决定） */
const THEMED_CONSTANTS = `const tableFixedHeaderCleanStyle = () => ({ fillStyle: spreadsheetThemeCss('--bg-tertiary', '#f4f5f8') });
const tableGridStyle = () => ({
  fillStyle: spreadsheetThemeCss('--bg-primary', '#fff'),
  lineWidth: thinLineWidth,
  strokeStyle: spreadsheetThemeCss('--border-color', '#e6e6e6'),
});
function tableFixedHeaderStyle() {
  return {
    textAlign: 'center',
    textBaseline: 'middle',
    font: \`500 \${npx(12)}px Source Sans Pro\`,
    fillStyle: spreadsheetThemeCss('--text-secondary', '#585757'),
    lineWidth: thinLineWidth(),
    strokeStyle: spreadsheetThemeCss('--border-color', '#e6e6e6'),
  };
}`

/** 库原始（未打补丁）的常量块 */
const PRISTINE_CONSTANTS = `const tableFixedHeaderCleanStyle = { fillStyle: '#f4f5f8' };
const tableGridStyle = {
  fillStyle: '#fff',
  lineWidth: thinLineWidth,
  strokeStyle: '#e6e6e6',
};
function tableFixedHeaderStyle() {
  return {
    textAlign: 'center',
    textBaseline: 'middle',
    font: \`500 \${npx(12)}px Source Sans Pro\`,
    fillStyle: '#585757',
    lineWidth: thinLineWidth(),
    strokeStyle: '#e6e6e6',
  };
}`

/** v1 打过的 helper（只读 <html>），v2 要把它换掉 */
const V1_HELPER = `function spreadsheetThemeCss(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}
`

const V2_MARKER = 'inkslate-spreadsheet-theme-patch v2'

/**
 * v3：draw.text 里"自动换行"的循环。
 *
 * 库的原始版本是在累计宽度**已经超过**盒宽时，才把当前字符挪到下一行，
 * 于是每行末尾都会比格子宽出约一个字符；画布从左到右绘制，溢出部分被
 * 右边格子的底色盖住 → 看起来每行结尾都被切掉一截。
 * 这里改成先判断"加上这个字会不会超宽"，超了就换行，保证每行都在格内。
 */
const WRAP_LOOSE = `        let textLine = { w: 0, len: 0, start: 0 };
        for (let i = 0; i < it.length; i += 1) {
          if (textLine.w >= npx(biw)) {
            ntxts.push(it.substr(textLine.start, textLine.len));
            textLine = { w: 0, len: 0, start: i };
          }
          textLine.len += 1;
          textLine.w += ctx.measureText(it[i]).width + 1;
        }`

const WRAP_STRICT = `        let textLine = { w: 0, len: 0, start: 0 };
        for (let i = 0; i < it.length; i += 1) {
          const charWidth = ctx.measureText(it[i]).width + 1;
          // inkslate-wrap-v3：先判断"加上这个字符是否超宽"，超了就换行；
          // 库原本是"已经超宽"之后才换行，会让每行溢出一个字符。
          if (textLine.len > 0 && textLine.w + charWidth > npx(biw)) {
            ntxts.push(it.substr(textLine.start, textLine.len));
            textLine = { w: 0, len: 0, start: i };
          }
          textLine.len += 1;
          textLine.w += charWidth;
        }`

const PATCHES = [
  {
    file: 'src/component/table.js',
    edits: [
      // v1 → v2：换掉取色 helper（作用域 + 对比度工具）。
      // optional：库原始代码里没有 v1 helper，这一项自然不存在，跳过即可。
      { from: V1_HELPER, to: THEME_HELPER, label: 'theme helper v1 -> v2', optional: true },
      // 未打过补丁的库：常量块整体替换（optional 同上，由末尾校验兜底）
      { from: PRISTINE_CONSTANTS, to: THEME_HELPER + THEMED_CONSTANTS, label: 'canvas constants', optional: true },
      { from: 'draw.attr(tableFixedHeaderCleanStyle);', to: 'draw.attr(tableFixedHeaderCleanStyle());', label: 'header clean style call', optional: true },
      { from: 'draw.attr(tableGridStyle)', to: 'draw.attr(tableGridStyle())', label: 'grid style call', optional: true },
      { from: "draw.attr({ fillStyle: '#f4f5f8' })", to: "draw.attr({ fillStyle: spreadsheetThemeCss('--bg-tertiary', '#f4f5f8') })", label: 'left-top cell', optional: true },
      { from: "draw.attr({ strokeStyle: '#c6c6c6' })", to: "draw.attr({ strokeStyle: spreadsheetThemeCss('--border-strong', '#c6c6c6') })", label: 'hidden line marker', all: true, optional: true },
    ],
  },
  {
    file: 'src/core/data_proxy.js',
    edits: [
      { from: 'const defaultSettings = {', to: THEME_HELPER + 'const defaultSettings = {', label: 'theme helper (data_proxy)' },
      {
        from: `  getCellStyleOrDefault(ri, ci) {
    const { styles, rows } = this;
    const cell = rows.getCell(ri, ci);
    const cellStyle = (cell && cell.style !== undefined) ? styles[cell.style] : {};
    return helper.merge(this.defaultStyle(), cellStyle);
  }`,
        to: `  getCellStyleOrDefault(ri, ci) {
    const { styles, rows } = this;
    const cell = rows.getCell(ri, ci);
    const cellStyle = (cell && cell.style !== undefined) ? styles[cell.style] : {};
    const merged = helper.merge(this.defaultStyle(), cellStyle);
    // inkslate: 写死在数据里的颜色在暗色主题 / 暗黑编辑器下可能与底色撞色，这里做对比度兜底
    return spreadsheetReadableStyle(merged);
  }`,
        label: 'readable cell style',
      },
    ],
  },
  {
    file: 'src/canvas/draw.js',
    edits: [
      // 连同原注释后的换行一起吃掉，保证"反做补丁 → 再打补丁"能逐字节还原
      { from: '/* global window */\n', to: '/* global window */\n' + THEME_HELPER, label: 'theme helper (draw)' },
      { from: "    this.bgcolor = '#ffffff';", to: "    this.bgcolor = spreadsheetThemeCss('--bg-primary', '#ffffff');", label: 'drawbox default bgcolor' },
      { from: "    ctx.fillStyle = bgcolor || '#fff';", to: "    ctx.fillStyle = bgcolor || spreadsheetThemeCss('--bg-primary', '#fff');", label: 'rect fallback bgcolor' },
      // v3：换行改成"严格不超宽"
      // 库原本的逻辑是在累计宽度**已经超过**盒宽之后，才把当前字符挪到下一行，
      // 于是每一行末尾都会比格子宽出约一个字符；画布按从左到右绘制，
      // 溢出部分被右边格子的底色盖住 → 视觉上每行末尾都被切掉一截（用户报的"看不全"）。
      { from: WRAP_LOOSE, to: WRAP_STRICT, label: 'strict text wrap (v3)' },
    ],
  },
]

function applyFile(patch) {
  const target = path.join(LIB, patch.file)
  if (!fs.existsSync(target)) {
    console.warn(`[patch-xspreadsheet] not found, skip: ${patch.file}`)
    return { file: patch.file, status: 'missing', applied: 0 }
  }
  let src = fs.readFileSync(target, 'utf-8')

  // 注意：不再因为"已经打过 v2"就整体跳过——补丁会不断加新项（例如 v3 的严格换行），
  // 必须能对已装好的库做增量升级。每一项都会先看目标态是否已存在。
  let applied = 0
  for (const edit of patch.edits) {
    if (src.includes(edit.to)) continue // 已是目标态（含 v1 已打过的项）→ 跳过
    if (!src.includes(edit.from)) {
      // optional 的项（v1 专用替换、库原始常量块）在另一种起点下本来就不存在 → 跳过，
      // 由文件末尾的校验兜底；非 optional 的项缺失说明库版本变了 → 放弃本文件。
      if (edit.optional) continue
      console.warn(`[patch-xspreadsheet] ${patch.file}: pattern not found (${edit.label}), leave file untouched`)
      return { file: patch.file, status: 'aborted', applied: 0 }
    }
    src = edit.all ? src.split(edit.from).join(edit.to) : src.replace(edit.from, edit.to)
    applied += 1
  }

  if (applied === 0) {
    console.log(`[patch-xspreadsheet] ${patch.file}: up to date, skip`)
    return { file: patch.file, status: 'current', applied: 0 }
  }

  fs.writeFileSync(target, src, 'utf-8')
  console.log(`[patch-xspreadsheet] ${patch.file}: patched (${applied} edit${applied === 1 ? '' : 's'})`)
  return { file: patch.file, status: 'patched', applied }
}

const results = PATCHES.map(applyFile)

// 校验：关键标记都在才算成功
const checks = [
  ['src/component/table.js', 'spreadsheetReadableStyle'],
  ['src/component/table.js', "spreadsheetThemeCss('--bg-primary', '#fff')"],
  ['src/core/data_proxy.js', 'spreadsheetReadableStyle(merged)'],
  ['src/canvas/draw.js', "spreadsheetThemeCss('--bg-primary', '#ffffff')"],
  ['src/canvas/draw.js', 'inkslate-wrap-v3'],
]
let ok = true
for (const [file, needle] of checks) {
  const p = path.join(LIB, file)
  const src = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
  if (!src.includes(needle)) {
    console.error(`[patch-xspreadsheet] verification failed: ${file} missing "${needle}"`)
    ok = false
  }
}
if (!ok) {
  // 刻意不返回非零退出码：库没匹配上只是"表格画布不跟随主题"这一处退化，
  // 不该把 npm install 整个卡住（沿用原有安全策略：宁可不打补丁，也不写坏 bundle）。
  console.warn(
    '[patch-xspreadsheet] ⚠️ 补丁未完全生效（多半是 x-data-spreadsheet 升级后源码变了）：\n' +
    '  表格画布的底色/网格/表头会退回库自带的浅色，暗色主题下观感会不一致。'
  )
} else {
  console.log('[patch-xspreadsheet] canvas colors + text contrast now follow the app theme (v2), strict text wrap (v3)')
}

/**
 * 清掉 Vite 的依赖预打包缓存。
 *
 * 这一步是必须的：Vite 会把 node_modules 里的依赖预打包到 node_modules/.vite/deps
 * 并长期复用；我们打的补丁改的是库源码，**不会**触发重新预打包。
 * 不清缓存的话，dev 模式下跑的还是补丁前的旧代码（"补丁明明打了却没生效"）。
 */
try {
  const viteCacheDirs = [
    path.join(LIB, '..', '.vite'),
    path.join(LIB, '..', '.vite-temp'),
  ]
  for (const dir of viteCacheDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`[patch-xspreadsheet] cleared Vite dep cache: ${path.relative(path.join(LIB, '..', '..'), dir)}`)
    }
  }
} catch (e) {
  console.warn('[patch-xspreadsheet] 清理 Vite 缓存失败（下次启动会自动重建）：', e.message)
}
