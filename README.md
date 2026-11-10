# 墨与石板 (Inkslate)

> 一款支持 HTML 显示的 Markdown 桌面笔记应用

![Inkslate](./resources/icon.png)

## 简介

**墨与石板**（Inkslate）是一款基于 Electron + React + TypeScript 的桌面笔记应用，专为追求**本地优先、可控、风格化**的写作者设计。

- **三栏布局**：侧栏（笔记本树） + 编辑器 + 预览区，每栏可独立折叠
- **三种笔记格式**：Markdown / HTML / 富文本
- **12 套主题**：默认主题、暗夜、赛博朋克、莫奈卡、报纸风、森林、落日、德古拉、北欧、田园、沙丘、护眼米黄
- **HTML 自定义渲染**：HTML 笔记用沙箱化 iframe 预览
- **CodeMirror 6 编辑器**：语法高亮、行号、当前行高亮、26 种 token 配色
- **编辑 / 预览双向同步滚动**：以标题为锚点，标题附近保持 1:1 对齐（左右不跑偏），两栏高度差压到段内中段均摊
- **代码块一键复制**：Markdown 预览每个代码块右上角一个复制按钮，复制成功有对勾反馈
- **本地优先存储**：SQLite + 本地 Markdown/HTML 文件，**你的笔记真的属于你**
- **可选 OSS 同步**：阿里云 OSS 备份（也支持任何 S3 兼容协议）
- **HTML 自绘菜单栏**：主题完全可控，跟随 12 套主题实时切换

## 名字由来

墨（Ink）—— 文字、思想、表达
石板（Slate）—— 简洁、可擦写、可重写

**墨与石板**，意思是"把思想刻在可重写的石头上"——笔记的本质不是写完就定型的文章，而是持续被打磨的思考。

## 技术栈

- **运行时**：Electron 33
- **前端**：React 18 + TypeScript 5 + Vite 5
- **编辑器**：CodeMirror 6
- **状态管理**：Zustand 5
- **存储**：better-sqlite3（笔记元数据） + 本地 .md / .html 文件
- **同步**：ali-oss（阿里云 OSS）
- **样式**：原生 CSS + CSS 变量主题

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（同时启动 vite + tsc watch + electron）
npm run dev

# 构建
npm run build

# 直接运行（需要先 build）
npx cross-env MDTEXT_LOAD=file npx electron .

# 打包安装包
npm run pack         # 当前平台
npm run pack:win     # Windows NSIS
npm run pack:mac     # macOS DMG
npm run pack:linux   # Linux AppImage
```

## 项目结构

```
inkslate/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── index.ts    # 入口（窗口创建、IPC 注册）
│   │   ├── menu.ts     # HTML 菜单数据结构 + click 分发
│   │   ├── ipc.ts      # IPC handler
│   │   ├── db.ts       # SQLite 数据库
│   │   └── oss/        # OSS 同步
│   ├── preload/        # preload 脚本（contextBridge）
│   │   └── index.ts    # 暴露 window.inkslateApi
│   ├── renderer/       # 渲染进程（React）
│   │   ├── App.tsx     # 根组件
│   │   ├── themes.ts   # 12 套主题色板
│   │   ├── components/ # UI 组件
│   │   │   ├── TitleBar.tsx     # HTML 菜单栏
│   │   │   ├── Sidebar.tsx      # 笔记本树
│   │   │   ├── Editor.tsx       # 编辑器（textarea）
│   │   │   ├── CodeEditor.tsx   # CodeMirror 编辑器
│   │   │   ├── Preview.tsx      # 预览区
│   │   │   └── ...
│   │   └── store/      # Zustand 状态
│   └── shared/         # 跨进程共享类型
│       └── types.ts    # Note / Notebook / AppSettings
├── resources/          # 应用图标
├── dist/               # 构建产物
└── release/            # electron-builder 打包产物
```

## 主题系统

主题分为两层：

1. **应用主题**（`src/renderer/themes.ts`）：22 个 CSS 变量（`--bg-primary` / `--text-primary` / `--accent-color` 等），通过 `<style>` 标签动态注入
2. **编辑器主题**（`CodeEditor.tsx` 里的 12 套）：和 appTheme id 一一对应，共享同一份主题

切换主题时，`App.tsx` 注入 CSS 变量 + CodeMirror 用 `Compartment.reconfigure()` 替换扩展，**不重建 EditorView**（保留光标/撤销栈）。

## IPC 协议

应用通过 `window.inkslateApi` 访问主进程能力（contextBridge 暴露）：

```typescript
window.inkslateApi.notebooks.list()
window.inkslateApi.notes.create('新笔记', notebookId, null, undefined, 'markdown')
window.inkslateApi.oss.push()
window.inkslateApi.settings.update({ theme: 'cyberpunk' })
```

## 已知问题

- macOS / Linux 打包未做完整测试
- 同步冲突处理是"后写覆盖"语义，没有 merge

## Roadmap

- [ ] 全文搜索
- [ ] 笔记标签（独立于笔记本树）
- [ ] WebDAV 同步（替代/补充 OSS）
- [ ] 笔记导出 PDF（带主题样式）
- [ ] 移动端伴侣应用

## 致谢

本项目全程使用 **minimax m3** 开发。

## License

MIT

## 作者

heimin
