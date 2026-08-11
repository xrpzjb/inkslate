/**
 * 笔记本图标自动匹配：根据名称关键词返回建议图标（存储格式 mat:xxx / io:xxx）。
 * 规则按「具体 → 通用」排序，越靠前优先级越高，匹配到即返回。
 */

export interface NotebookIconRule {
  keywords: string[]
  icon: string
}

export const NOTEBOOK_ICON_RULES: NotebookIconRule[] = [
  { keywords: ['git'], icon: 'io:logo-github' },
  { keywords: ['运维', 'ops', 'deploy', 'devops', '服务器', 'server', '上线'], icon: 'io:server' },
  { keywords: ['数据库', 'database', 'db', 'sql'], icon: 'mat:dataset' },
  { keywords: ['前端', 'frontend', 'fe', '网页'], icon: 'mat:web' },
  { keywords: ['后端', 'backend', 'api'], icon: 'mat:dns' },
  { keywords: ['测试', 'test', 'qa', '验收'], icon: 'mat:bug_report' },
  { keywords: ['开发', '编程', '代码', 'coding', 'developer', 'dev', 'program'], icon: 'mat:code' },
  { keywords: ['数据', 'data', '分析', 'analytics'], icon: 'mat:analytics' },
  { keywords: ['算法', 'algorithm', 'leetcode'], icon: 'mat:account_tree' },
  { keywords: ['文档', '资料', '知识', 'doc', 'docs'], icon: 'mat:description' },
  { keywords: ['笔记', 'note', '随手记'], icon: 'mat:note' },
  { keywords: ['学习', '课程', '教程', 'study', 'learn'], icon: 'mat:school' },
  { keywords: ['读书', '书', 'book', '阅读'], icon: 'mat:book' },
  { keywords: ['写作', 'write', '稿', '文章'], icon: 'mat:edit_note' },
  { keywords: ['灵感', 'idea', '创意'], icon: 'mat:lightbulb' },
  { keywords: ['计划', '规划', '任务', 'plan', 'task', 'todo'], icon: 'mat:task_alt' },
  { keywords: ['工作', 'work', 'job', '职场'], icon: 'mat:work' },
  { keywords: ['项目', 'project'], icon: 'mat:folder_shared' },
  { keywords: ['生活', '日常', 'life'], icon: 'mat:home' },
  { keywords: ['健康', 'health'], icon: 'mat:monitor_heart' },
  { keywords: ['健身', '运动', 'fitness'], icon: 'mat:fitness_center' },
  { keywords: ['音乐', 'music', '歌曲'], icon: 'mat:music_note' },
  { keywords: ['旅行', '旅游', 'travel', '出行'], icon: 'mat:flight' },
  { keywords: ['美食', 'food', '菜谱'], icon: 'mat:restaurant' },
  { keywords: ['财务', '记账', 'money', 'finance', '账'], icon: 'mat:payments' },
  { keywords: ['会议', 'meeting', '周会'], icon: 'mat:groups' },
  { keywords: ['邮件', '邮箱', 'mail', 'email'], icon: 'mat:email' },
  { keywords: ['设计', 'design'], icon: 'mat:palette' },
  { keywords: ['语言', '英语', 'english', '外语'], icon: 'mat:translate' },
  { keywords: ['考试', '考研', 'exam', '备考'], icon: 'mat:quiz' },
  { keywords: ['研究', '调研', 'research'], icon: 'mat:science' },
  { keywords: ['论文', 'paper'], icon: 'mat:article' },
  { keywords: ['ai', '人工智能', '智能'], icon: 'mat:psychology' },
  { keywords: ['网络', 'network'], icon: 'mat:router' },
  { keywords: ['安全', 'security', '渗透'], icon: 'mat:security' },
  { keywords: ['硬件', 'hardware'], icon: 'mat:hardware' },
  { keywords: ['工具', 'utils', '脚本'], icon: 'mat:handyman' },
]

/** 根据名称匹配建议图标；无命中返回 null（保持默认文件夹图标） */
export function matchNotebookIcon(name: string): string | null {
  const lower = (name ?? '').toLowerCase()
  if (!lower.trim()) return null
  for (const rule of NOTEBOOK_ICON_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return rule.icon
    }
  }
  return null
}
