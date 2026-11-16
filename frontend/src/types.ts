export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  description: string | null
  priority: TaskPriority
  dueDate: string | null
  status: TaskStatus
  sortOrder: number
}

export interface SearchConditions {
  q: string
  status: TaskStatus | ''
}

export const columns: { status: TaskStatus; label: string; note: string; dot: string }[] = [
  { status: 'todo', label: '未着手', note: 'これから取り組むこと', dot: 'bg-slate-400' },
  { status: 'doing', label: '作業中', note: 'いま進めていること', dot: 'bg-amber-500' },
  { status: 'done', label: '完了', note: 'やり遂げたこと', dot: 'bg-emerald-600' },
]
