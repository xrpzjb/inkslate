# 打包指南

## 前置条件

- Node.js 20+，npm
- 已执行 `npm install`
- better-sqlite3 已针对当前 Electron 版本重建（`node_modules\better-sqlite3\build\Release\better_sqlite3.node`）

## 打包命令

### 1. 构建产物（dist）

```bash
npm run build
```

### 2. 打包 Windows（安装版 exe + 绿色版 zip）

```bash
npx electron-builder --win nsis zip
```

输出到 `release/`：

- `release\Inkslate Setup 0.1.0.exe` — NSIS 安装版
- `release\Inkslate-0.1.0-win.zip` — 绿色版压缩包
- `release\win-unpacked\` — 免安装解压目录

## 常见问题

### better-sqlite3 原生模块需针对 Electron 重建

```powershell
powershell -ExecutionPolicy Bypass -File .\rebuild_electron.ps1
```

### cpu-features 编译失败（无 Visual Studio）

`ssh2` 的 `cpu-features` 是可选依赖（代码中 try/catch 加载），无需编译。
`package.json` 已配置 `"npmRebuild": false`，打包时跳过原生依赖重建，
只需保证 better-sqlite3 已按上一步重建即可。

### winCodeSign 缓存解压失败（Cannot create symbolic link）

非管理员权限下，官方 winCodeSign 工具解压 macOS 符号链接会失败导致打包中断。
首次打包前手动补全缓存：

```powershell
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$src = Get-ChildItem $cacheDir -Directory | Where-Object { $_.Name -match "^\d+$" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$final = "$cacheDir\winCodeSign-2.6.0"
New-Item -ItemType Directory -Path $final -Force | Out-Null
Copy-Item "$($src.FullName)\*" -Destination $final -Recurse -Force
```

此后 electron-builder 会复用缓存，无需重复操作。

## 输出整理（可选）

按发布习惯，将产物移动到对应目录：

```powershell
# 安装版
Copy-Item "release\Inkslate Setup 0.1.0.exe" release_installer\ -Force
Copy-Item "release\Inkslate Setup 0.1.0.exe.blockmap" release_installer\ -Force

# 绿色版 zip（带顶层文件夹 Inkslate-win32-x64）
& "C:\Users\nmwork\AppData\Local\Temp\opencode\7zip\out\7za.exe" a -tzip `
  "release_manual\Inkslate-0.1.0-win-绿色版.zip" `
  "release_manual\Inkslate-win32-x64" -r
```