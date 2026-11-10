# 墨与石板 (Inkslate)

<img src="./resources/icon.png" alt="Inkslate" width="96" />

> 本地优先的多格式桌面笔记应用：Markdown、HTML、富文本、代码、网址、文件与智能表格。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)

## 简介

**墨与石板**（Inkslate）是一款基于 Electron + React + TypeScript 的桌面笔记应用，面向希望**数据完全掌握在自己手里**的写作者与开发者。

笔记默认保存在本机，可通过 Git 仓库在多台设备之间同步；内置 AI 写作助手，支持在笔记上下文中调用本地文件与 SSH 远程文件工具。

## 功能特性

### 多种笔记格式

- **Markdown**：实时预览、目录大纲、代码块高亮与一键复制
- **HTML**：沙箱化 iframe 预览，适合自定义排版
- **富文本**：所见即所得
- **代码笔记**：20+ 语言语法高亮
- **网址笔记**：内嵌网页预览，支持加载状态与超时提示
- **文件笔记**：直接引用本地文件，内置 PDF / Word / Excel / 图片预览
- **智能表格**：类 Excel 编辑体验，支持单元格合并、样式、自动换行与行高自适应

### 编辑与阅读

- 三栏布局：笔记本树 + 编辑器 + 预览，每栏可独立折叠
- 多标签页，启动恢复上次打开的笔记
- 编辑 / 预览双向滚动同步，以标题为锚点保持对齐
- 笔记回收站：支持按天保留、还原与彻底删除
- 闪念：快速记录灵感，支持完成勾选
- 笔记本密码保护：基于系统 `safeStorage` 加密，解锁状态自动过期

### 主题

内置 12 套主题，另支持跟随系统：

默认主题、暗黑、德古拉、沙丘、莫奈、报纸风、森林、落日、北欧、田园、赛博朋克、护眼配色。

主题通过 CSS 变量驱动，切换时不重建编辑器，光标与撤销栈保持不变。

### Git 同步

- 使用 `isomorphic-git`，不依赖本机 Git
- 支持初始化新仓库、克隆已有仓库、提交 / 推送 / 拉取
- 同步前自动 fetch + rebase，尽量保持线性历史
- 浏览提交历史、查看差异、恢复历史版本
- Token 通过系统 `safeStorage` 加密保存
- 内置网络重试、请求超时与断流检测

### AI 写作

- 兼容 OpenAI 风格接口与 Anthropic Messages 接口
- 内置 DeepSeek、通义千问、智谱 GLM、Kimi、MiMo、OpenAI、OpenCode Go 等预设，也支持自定义端点
- 支持 HTTP 代理
- 对话按笔记保存，可与当前笔记内容联动
- Function Calling 工具：扫描目录、读取文件、搜索内容
- SSH 远程工具：列出 / 读取 / 写入远程文件；写操作必须经用户确认

### 导出

- **PDF**：A4 / A3 / A5 / Letter / 宽屏尺寸，支持大纲与自定义水印
- **Word**：`.docx`
- **Excel**：`.xlsx`

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Electron 33 |
| 前端 | React 18、TypeScript 5、Vite 5 |
| 编辑器 | CodeMirror 6 |
| 状态管理 | Zustand 5 |
| 本地存储 | better-sqlite3 + 本地文件 |
| Git 同步 | isomorphic-git |
| SSH | ssh2 |
| 表格 | x-data-spreadsheet |
| 渲染 | markdown-it、Mermaid、KaTeX、highlight.js |
| 导出 | docx、exceljs、pdf-lib、pdfjs-dist |

## 数据与隐私

- **本地优先**：笔记元数据存于 SQLite（`mdtext.db`），正文与附件位于 Electron 的 `userData/notes` 目录
  - Windows：`%APPDATA%\inkslate`
  - macOS：`~/Library/Application Support/inkslate`
  - Linux：`~/.config/inkslate`
- **无遥测**：应用不包含统计或上报逻辑
- **凭据加密**：Git Token 与笔记本密码均通过系统安全存储加密，不以明文落盘
- **同步自选**：Git 仓库由你自行提供，数据只推送到你配置的远端

## 快速开始

环境要求：Node.js 18+、npm。

```bash
# 安装依赖
npm install

# 开发模式（Vite + TypeScript watch + Electron）
npm run dev

# 构建
npm run build

# 运行已构建版本
npx electron .

# 打包当前平台
npm run pack

# 分别打包
npm run pack:win    # Windows NSIS
npm run pack:mac    # macOS DMG
npm run pack:linux  # Linux deb / AppImage
```

打包产物输出到 `release/`。

## 常用快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+N` | 新建 Markdown 笔记 |
| `Ctrl+Shift+H` | 新建 HTML 笔记 |
| `Ctrl+Shift+R` | 新建富文本笔记 |
| `Ctrl+S` | 保存 |
| `Ctrl+B` | 切换侧栏 |
| `Ctrl+P` | 切换预览 |
| `Ctrl+Shift+E` | 切换编辑器 |
| `Ctrl+F` | 查找 |
| `Ctrl+Shift+Y` | Git 同步（先拉后推） |
| `Ctrl+Shift+S` | 推送 |
| `Ctrl+Shift+D` | 拉取 |
| `Ctrl+Shift+Backspace` | 打开回收站 |

## 项目结构

```
inkslate/
├── src/
│   ├── main/            # Electron 主进程
│   │   ├── index.ts     # 入口、窗口与 IPC 注册
│   │   ├── db.ts        # SQLite 与本地文件存储
│   │   ├── ipc.ts       # IPC handler（含 AI 工具循环）
│   │   ├── menu.ts      # 自绘菜单数据与事件分发
│   │   ├── git/         # Git 同步
│   │   ├── oss/         # 对象存储（可选）
│   │   ├── ssh/         # SSH 远程文件
│   │   └── export/      # PDF / Word / Excel 导出
│   ├── preload/         # contextBridge（window.inkslateApi）
│   ├── renderer/        # React 界面
│   │   ├── components/  # 编辑器、预览、侧栏、弹窗等
│   │   ├── themes.ts    # 主题色板
│   │   ├── store/       # Zustand 状态
│   │   └── styles/      # 全局样式
│   └── shared/          # 主进程与渲染进程共享类型
├── resources/           # 应用图标
├── dist/                # 构建产物
└── release/             # 安装包
```

## 已知限制

- macOS / Linux 打包尚未完整测试
- Git 冲突采用“后写覆盖 + 保留双版本”策略，暂未提供可视化合并
- 安装包未配置代码签名，Windows SmartScreen 可能提示未知发布者

## Roadmap

- [ ] 笔记标签（独立于笔记本树）
- [ ] WebDAV 同步
- [ ] 冲突可视化合并
- [ ] 移动端伴侣应用

## 致谢

感谢 Electron、React、CodeMirror、better-sqlite3、isomorphic-git、x-data-spreadsheet、Mermaid、KaTeX 等开源项目。

## License

[MIT](./LICENSE)

## 作者

heimin ([@xrpzjb](https://github.com/xrpzjb))
