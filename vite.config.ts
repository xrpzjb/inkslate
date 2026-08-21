import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html')
    }
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src/renderer') },
      { find: '@shared', replacement: path.resolve(__dirname, 'src/shared') },
      // 只精确匹配包名（用正则避免把 x-data-spreadsheet/dist/*.css 也重写掉）。
      // x-data-spreadsheet 的入口是 ES 源码且 import 了 .less（未装 less 预处理器），
      // 直接指向它预编译好的 UMD 产物；类型声明走 package.json 的 src/index.d.ts
      { find: /^x-data-spreadsheet$/, replacement: path.resolve(__dirname, 'node_modules/x-data-spreadsheet/dist/xspreadsheet.js') }
    ]
  },
  server: {
    port: 5173,
    // 关闭 Vite 默认注入的 CSP（'default-src self data: blob:'）—— 网址笔记的 iframe
    // 需要主窗口允许加载任意外部 URL，但 Vite dev 默认 CSP 会通过 frame-src 拒绝。
    // 只影响 dev server；生产构建用 dist 时由主进程 webRequest 兜底。
    headers: {
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *;"
    }
  }
})
