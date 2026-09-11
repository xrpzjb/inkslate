/**
 * 补丁 x-data-spreadsheet 的画布配色，让表格网格跟随应用主题。
 *
 * 库在 canvas 上硬编码了浅色表头（#f4f5f8）、网格线（#e6e6e6）等颜色，
 * 这些无法用 CSS 覆盖。本脚本把这几处改成渲染时读取当前主题的 CSS 变量
 * （--bg-primary / --bg-tertiary / --border-color / --text-secondary），
 * 这样智能表格的单元格底色 / 文字 / 表头 / 网格线都能跟随主题切换。
 *
 * 在 package.json 的 postinstall 里执行（node scripts/patch-xspreadsheet.js），
 * npm install 后自动生效；脚本幂等，重复执行安全。
 *
 * 安全策略：任何一处匹配不到就不写文件（保持原样退出，绝不写入半成品），
 * 避免库升级后把 bundle 弄坏。
 */
const fs = require('node:fs')
const path = require('node:path')

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'x-data-spreadsheet',
  'src',
  'component',
  'table.js',
)

if (!fs.existsSync(target)) {
  console.warn('[patch-xspreadsheet] table.js not found, skip:', target)
  process.exit(0)
}

let src = fs.readFileSync(target, 'utf-8')

// 已补丁则跳过（幂等）
if (src.includes('spreadsheetThemeCss')) {
  console.log('[patch-xspreadsheet] already patched, skip')
  process.exit(0)
}

const themeHelper = `function spreadsheetThemeCss(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}
`

const replacements = []

// 1) 顶部常量 → 改为函数，渲染时读取主题变量
replacements.push([
  `const tableFixedHeaderCleanStyle = { fillStyle: '#f4f5f8' };
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
}`,
  `${themeHelper}const tableFixedHeaderCleanStyle = () => ({ fillStyle: spreadsheetThemeCss('--bg-tertiary', '#f4f5f8') });
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
}`,
])

// 2) 调用点：常量变成函数，加括号调用
replacements.push([`draw.attr(tableFixedHeaderCleanStyle);`, `draw.attr(tableFixedHeaderCleanStyle());`])
replacements.push([`draw.attr(tableGridStyle)`, `draw.attr(tableGridStyle())`])

// 3) 左上角固定格 / 隐藏行列标记线
replacements.push([
  `draw.attr({ fillStyle: '#f4f5f8' })`,
  `draw.attr({ fillStyle: spreadsheetThemeCss('--bg-tertiary', '#f4f5f8') })`,
])
replacements.push([
  `draw.attr({ strokeStyle: '#c6c6c6' })`,
  `draw.attr({ strokeStyle: spreadsheetThemeCss('--border-strong', '#c6c6c6') })`,
])

for (const [oldStr, newStr] of replacements) {
  if (!src.includes(oldStr)) {
    console.warn(
      `[patch-xspreadsheet] pattern not found, leave file untouched: ${oldStr.slice(0, 60)}...`,
    )
    process.exit(0)
  }
  src = src.replace(oldStr, newStr)
}

// 校验关键标记都替换成功后才写盘
if (!src.includes('tableFixedHeaderCleanStyle()') || !src.includes('tableGridStyle()')) {
  console.warn('[patch-xspreadsheet] verification failed, leave file untouched')
  process.exit(0)
}

fs.writeFileSync(target, src, 'utf-8')
console.log('[patch-xspreadsheet] patched x-data-spreadsheet canvas colors to follow app theme')