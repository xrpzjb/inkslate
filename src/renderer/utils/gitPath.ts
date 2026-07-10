/** 将笔记的绝对路径转换为 git 工作区相对路径（posix 风格） */

let workdirPromise: Promise<string> | null = null

export async function getWorkDir(): Promise<string> {
  if (!workdirPromise) {
    workdirPromise = window.inkslateApi.getWorkDir()
  }
  return workdirPromise
}

export async function absoluteToGitPath(absolutePath: string): Promise<string> {
  const workdir = await getWorkDir()
  if (!absolutePath.startsWith(workdir)) {
    // 不在工作区内 — 不应该发生，兜底
    return absolutePath.replace(/\\/g, '/')
  }
  const relative = absolutePath.slice(workdir.length).replace(/^[/\\]/, '')
  return relative.replace(/\\/g, '/')
}
