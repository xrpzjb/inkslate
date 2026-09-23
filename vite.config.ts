import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
// 端口/地址与主进程共用一份定义（src/main/index.ts 也 import 它），
// 避免"Vite 换了端口、主进程还去老端口找人"。
import { resolveDevServerPort } from './src/shared/devServer'

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
      { find: '@shared', replacement: path.resolve(__dirname, 'src/shared') }
    ]
  },
  server: {
    // 端口来自 src/shared/devServer.ts，不再在这里写字面量。
    // 注意：主进程 dev 模式加载的就是这个地址，改端口只改那个文件（或设
    // MDTEXT_DEV_PORT 环境变量）即可，两边永远一致。
    port: resolveDevServerPort(),
    // strictPort: 端口被占用时直接报错退出，而不是静默换到 5174。
    // 静默漂移正是之前"启动笔记应用却打开另一个项目界面"的成因：
    // Vite 悄悄换到 5174，主进程仍然去 5173 拿页面，而 5173 上跑的是别人的项目。
    strictPort: true,
    // 关闭 Vite 默认注入的 CSP（'default-src self data: blob:'）—— 网址笔记的 iframe
    // 需要主窗口允许加载任意外部 URL，但 Vite dev 默认 CSP 会通过 frame-src 拒绝。
    // 只影响 dev server；生产构建用 dist 时由主进程 webRequest 兜底。
    headers: {
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *;"
    }
  }
})
