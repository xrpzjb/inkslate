<p align="center">
  <img src="./resources/icon.png" alt="Inkslate" width="112" />
</p>

<h1 align="center">墨与石板</h1>

<p align="center">
  <strong>Inkslate</strong> — 本地优先的多格式桌面笔记应用
</p>

<p align="center">
  <a href="https://github.com/xrpzjb/inkslate/releases/latest"><img src="https://img.shields.io/github/v/release/xrpzjb/inkslate?style=flat-square" alt="Release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-3da639?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-4c8eda?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-33-47848f?style=flat-square" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square" alt="React" />
</p>

<p align="center">
  <a href="#下载安装">下载</a> ·
  <a href="#功能特性">功能</a> ·
  <a href="#从源码构建">构建</a> ·
  <a href="#使用指南">使用指南</a> ·
  <a href="#常见问题">常见问题</a>
</p>

---

## 简介

> 笔记不是写完即定型的文章，而是持续被打磨的思考。

**墨与石板**（Inkslate）是一款基于 Electron + React + TypeScript 的桌面笔记应用，面向希望**数据完全掌握在自己手里**的写作者与开发者。

它不依赖任何云端账号：笔记默认保存在本机，可通过你自己的 Git 仓库在多台设备之间同步；内置 AI 写作助手，能在当前笔记的上下文中调用本地文件与 SSH 远程文件工具。

「墨」代表文字与思想，「石板」代表可反复擦写的载体——这也是 Inkslate 的设计出发点：**轻、稳、可控，且真正属于你**。

### 核心亮点

| | |
|---|---|
| **本地优先** | SQLite + 本地文件，离线可用，数据不经第三方 |
| **七种格式** | Markdown、HTML、富文本、代码、网址、文件、智能表格 |
| **自由同步** | 使用自己的 Git 仓库同步，支持历史、差异与版本恢复 |
| **AI 协作** | 兼容 OpenAI / Anthropic 接口，支持本地文件与 SSH 工具 |

---

## 功能特性

### 七种笔记格式

| 格式 | 适合场景 | 能力 |
|---|---|---|
| **Markdown** | 写作、技术笔记、长文 | 实时预览、目录大纲、Mermaid、KaTeX、代码高亮与复制 |
| **HTML** | 自定义排版、嵌入页面 | 沙箱化 iframe 预览，样式完全可控 |
| **富文本** | 日常记录、排版 | 所见即所得，无需记忆语法 |
| **代码** | 代码片段、草稿 | 20+ 语言语法高亮 |
| **网址** | 收藏网页、内嵌工具 | 网页内嵌预览，加载状态与超时兜底 |
| **文件** | 资料归档 | 引用本地文件，内置 PDF / Word / Excel / 图片预览 |
| **智能表格** | 数据整理、清单 | 类 Excel 编辑，合并、样式、自动换行与行高 |

### 编辑与阅读

- **三栏布局**：笔记本树、编辑器、预览区，每栏可独立折叠
- **多标签页**：启动时恢复上次打开的标签与选中笔记
- **双向滚动同步**：以标题为锚点，编辑与预览左右对齐
- **标题大纲**：长文快速跳转
- **查找替换**：结果高亮，快速定位
- **字体独立配置**：全局、编辑区、树状图可分别设置字体与字号
- **编辑器选项**：独立暗色模式、自动换行

### 主题

内置 12 套主题，另支持跟随系统。

| 类型 | 主题 |
|---|---|
| 明亮 | 默认主题、莫奈、报纸风、落日、北欧、田园、护眼配色、沙丘 |
| 暗色 | 暗黑、德古拉、森林、赛博朋克 |
| 跟随系统 | 根据系统明暗自动切换 |

主题通过 CSS 变量驱动，切换时不重建编辑器，光标与撤销栈保持不变。

### 智能表格

- 单元格编辑、合并、背景色、对齐与换行
- 根据内容自动调整行高
- 支持多工作表
- 可导出为 `.xlsx`

### 闪念与回收站

| 功能 | 说明 |
|---|---|
| **闪念** | 随手记录灵感，支持完成勾选与沉底排序 |
| **回收站** | 删除的笔记与笔记本先进入回收站，可还原或彻底删除 |
| **自动清理** | 可设置保留天数，启动时清理过期项 |

### 安全与隐私

| 机制 | 说明 |
|---|---|
| **本地优先** | 正文与附件存放在本机，不经过任何第三方服务 |
| **笔记本密码** | 基于系统 `safeStorage` 加密，解锁状态默认 10 分钟后失效 |
| **凭据加密** | Git Token 通过系统安全存储加密，不以明文落盘 |
| **无遥测** | 应用不包含统计或上报逻辑 |
| **同步自选** | Git 仓库由你提供，数据只推送到你配置的远端 |

### Git 同步

- 使用 `isomorphic-git`，不依赖本机安装 Git
- 支持初始化新仓库、克隆已有仓库、提交 / 推送 / 拉取
- 同步前自动 fetch + rebase，尽量保持线性历史
- 可浏览提交历史、查看文件差异、恢复历史版本
- 文本冲突自动保留双版本，生成「冲突副本」笔记
- 内置网络重试、请求超时与断流检测
- 可选每 5 分钟自动同步

```
本地保存 ──► 自动提交 ──► 推送
启动 / 手动 ──► fetch ──► rebase ──► 拉取
```

### AI 写作

| 能力 | 说明 |
|---|---|
| **多提供商** | DeepSeek、通义千问、智谱 GLM、Kimi、MiMo、OpenAI、OpenCode Go、自定义 |
| **接口兼容** | OpenAI 风格与 Anthropic Messages 接口 |
| **代理支持** | 支持自定义 HTTP 代理 |
| **按笔记对话** | 对话随笔记保存，可结合当前内容继续追问 |
| **本地工具** | 扫描目录、读取文件、搜索内容 |
| **SSH 工具** | 列出、读取、写入远程文件；写操作必须确认 |

OpenCode Go 请求会自动携带所需的会话头与 User-Agent，无需手动配置。

### 导出

| 格式 | 选项 |
|---|---|
| **PDF** | A4 / A3 / A5 / Letter / 宽屏尺寸，支持大纲与自定义水印 |
| **Word** | `.docx` |
| **Excel** | `.xlsx`（智能表格） |

---

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
| 渲染 | markdown-it、Mermaid、KaTeX、highlight.js、DOMPurify |
| 导出 | docx、exceljs、pdf-lib、pdfjs-dist |

---

## 数据存储

笔记元数据存于 SQLite（`mdtext.db`），正文与附件位于 Electron 的 `userData/notes` 目录：

| 平台 | 默认目录 |
|---|---|
| Windows | `%APPDATA%\inkslate` |
| macOS | `~/Library/Application Support/inkslate` |
| Linux | `~/.config/inkslate` |

Git 同步工作区采用目录式结构，便于在仓库中直接阅读与 diff：

```
.inkslate/notebooks.json      # 笔记本树
.inkslate/notes.json          # 笔记元数据
.inkslate/flash_thoughts.json # 闪念
notes/{id}/meta.json          # 单篇笔记元数据
notes/{id}/content.{ext}      # 笔记正文
files/{id}/meta.json          # 附件元数据
files/{id}/file.{ext}         # 附件本体
```

---

## 下载安装

前往 [Releases](https://github.com/xrpzjb/inkslate/releases/latest) 下载最新版本。

| 文件 | 说明 |
|---|---|
| `Inkslate Setup <version>.exe` | Windows 安装包（NSIS，可选择安装目录） |
| `Inkslate-<version>-win-x64.zip` | Windows 免安装版，解压后运行 `Inkslate.exe` |

> 安装包未配置代码签名，Windows SmartScreen 可能提示「未知发布者」，选择「仍要运行」即可。

---

## 从源码构建

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

# 打包
npm run pack        # 当前平台
npm run pack:win    # Windows NSIS
npm run pack:mac    # macOS DMG
npm run pack:linux  # Linux deb / AppImage
```

打包产物输出到 `release/`。免安装版可自行压缩 `release/win-unpacked`：

```powershell
Compress-Archive -Path "release\win-unpacked\*" -DestinationPath "release\Inkslate-<version>-win-x64.zip" -Force
```

---

## 使用指南

### 创建笔记

通过「文件 → 新建」选择格式，或在侧栏右键新建。代码笔记可选择具体语言；网址笔记可自定义名称与地址；文件笔记会直接引用所选本地文件。

### 配置 Git 同步

1. 准备一个 Git 仓库，推荐使用**私有仓库**（GitHub / Gitea / GitLab 均可）
2. 打开「笔记本 → Git 同步设置」
3. 填写仓库 HTTPS 地址、分支、提交作者名称与邮箱，以及账号与 Token
4. 选择「初始化本地仓库」或「克隆远端仓库」
5. 使用菜单或快捷键执行同步、推送、拉取

> GitHub 已不支持使用账号密码进行 Git 操作，请使用 Personal Access Token（需要仓库 Contents 读写权限）。

### 配置 AI 写作

1. 打开「设置 → AI 写作」
2. 选择提供商预设，或选择「自定义」并填写完整的 API 地址
3. 填写模型名、API Key；如网络需要，可填写 HTTP 代理
4. 点击「测试连接」确认可用
5. 在编辑器中打开「AI 写作」，即可基于当前笔记对话

启用 SSH 远程工具后，AI 可以读写远程文件；所有写操作都会弹出确认框，超时未确认视为拒绝。

### 保护笔记本

在笔记本上右键设置密码。受保护的笔记本默认处于锁定状态，解锁后 10 分钟内有效；超时后界面会自动回到锁定状态。

### 导出

在笔记或右键菜单中可导出 PDF / Word；智能表格可导出 Excel。PDF 支持选择纸张尺寸、宽屏尺寸与自定义水印。

---

## 快捷键

| 快捷键 | 功能 |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>N</kbd> | 新建 Markdown 笔记 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd> | 新建 HTML 笔记 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> | 新建富文本笔记 |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd> | 新建笔记本 |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | 保存 |
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | 切换侧栏 |
| <kbd>Ctrl</kbd> + <kbd>P</kbd> | 切换预览 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> | 切换编辑器 |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | 查找 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> | Git 同步（先拉后推） |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | 推送 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | 拉取 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Backspace</kbd> | 打开回收站 |

---

## 项目结构

```
inkslate/
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── index.ts         # 入口、窗口与 IPC 注册
│   │   ├── menu.ts          # 自绘菜单数据与事件分发
│   │   ├── ipc.ts           # IPC handler（含 AI 工具循环）
│   │   ├── db.ts            # SQLite 与本地文件存储
│   │   ├── crypto.ts        # 凭据与内容加密
│   │   ├── git/             # Git 同步、网络重试、reconcile
│   │   ├── ssh/             # SSH 远程文件
│   │   ├── oss/             # 对象存储（可选）
│   │   ├── export/          # PDF / Word / Excel 导出
│   │   └── gpuCacheSelfHeal.ts
│   ├── preload/             # contextBridge（window.inkslateApi）
│   ├── renderer/            # React 渲染进程
│   │   ├── App.tsx          # 根组件与全局事件
│   │   ├── themes.ts        # 主题色板
│   │   ├── components/      # 编辑器、预览、侧栏、弹窗等
│   │   ├── store/           # Zustand 状态
│   │   ├── styles/          # 全局与模块样式
│   │   └── utils/           # 滚动同步、剪贴板、Markdown 等
│   └── shared/              # 跨进程共享类型与常量
├── resources/               # 应用图标
├── scripts/                 # 构建与补丁脚本
├── dist/                    # 构建产物
└── release/                 # 安装包
```

---

## 常见问题

<details>
<summary><strong>安装时报 “Error writing temporary file”？</strong></summary>

这是 NSIS 解压临时文件失败，通常是 `%TEMP%` 权限或空间问题。可直接使用免安装版 zip。

</details>

<details>
<summary><strong>启动提示原生模块错误？</strong></summary>

`better-sqlite3` 是原生模块，请使用与项目匹配的 Node / Electron 版本，并重新执行 `npm install`。

</details>

<details>
<summary><strong>Git 推送提示认证失败？</strong></summary>

GitHub / GitLab 等平台已不支持账号密码认证，请改用 Personal Access Token，并确认 Token 具备仓库 Contents 读写权限。

</details>

<details>
<summary><strong>打开 AI 提示 400 / MissingSessionID？</strong></summary>

使用 OpenCode Go 时，应用会自动发送 `x-opencode-session` 与自定义 User-Agent；如果仍报错，请确认 API 地址与模型名正确。

</details>

<details>
<summary><strong>macOS / Linux 能用吗？</strong></summary>

代码层面兼容，但打包与运行尚未完整测试；Windows 是当前主要支持平台。

</details>

---

## 已知限制

- macOS / Linux 打包与运行尚未完整测试
- Git 冲突采用「保留双版本 + 冲突副本」策略，暂未提供可视化合并
- 安装包未配置代码签名，Windows SmartScreen 可能提示未知发布者
- 单个 Git 附件建议不超过 200MB

---

## License

[MIT](./LICENSE)

## 作者

heimin ([@xrpzjb](https://github.com/xrpzjb))
