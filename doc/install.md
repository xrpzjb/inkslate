# 安装与环境配置

## npm 国内镜像安装命令

使用淘宝 npm 镜像加速依赖安装：

```bash
npm install --registry=https://registry.npmmirror.com
```

### 一次性使用（推荐）

只在当前这次安装时使用国内镜像，项目代码不会被影响：

```bash
npm install --registry=https://registry.npmmirror.com
```

### 永久切换镜像

如果后续所有项目都想走国内镜像，可以全局设置一次：

```bash
npm config set registry https://registry.npmmirror.com
```

恢复官方源：

```bash
npm config set registry https://registry.npmjs.org
```

### 验证当前镜像

```bash
npm config get registry
```

## 常用镜像地址

- 淘宝（推荐）：`https://registry.npmmirror.com`
- 阿里云：`https://registry.npm.alibaba-inc.com`（需内网）
- 腾讯云：`https://mirrors.cloud.tencent.com/npm/`
- 华为云：`https://repo.huaweicloud.com/repository/npm/`
