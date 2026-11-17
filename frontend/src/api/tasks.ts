import type { SearchConditions, Task } from '../types'

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false
  const task = value as Record<string, unknown>
  return typeof task.id === 'string'
    && typeof task.title === 'string'
    && (task.description === null || typeof task.description === 'string')
    && ['high', 'medium', 'low'].includes(String(task.priority))
    && ['todo', 'doing', 'done'].includes(String(task.status))
    && (task.dueDate === null || (typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)))
    && Number.isInteger(task.sortOrder) && Number(task.sortOrder) >= 0
}

export async function fetchTasks(conditions: SearchConditions, signal: AbortSignal): Promise<Task[]> {
  const params = new URLSearchParams()
  if (conditions.q.trim()) params.set('q', conditions.q.trim())
  if (conditions.status) params.set('status', conditions.status)
  const query = params.toString()
  const response = await fetch(`/api/tasks${query ? `?${query}` : ''}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    if (response.status === 400) throw new Error('検索条件を確認して、もう一度検索してください。')
    throw new Error('タスクを取得できませんでした。バックエンドの起動状態を確認して再取得してください。')
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('取得したデータを読み取れませんでした。再取得してください。')
  }
  if (!Array.isArray(data) || !data.every(isTask)) {
    throw new Error('取得したデータの形式が正しくありません。再取得してください。')
  }
  return data
}

export interface CreateTaskInput {
  title: string
  description: string | null
  priority: 'high' | 'medium' | 'low'
  dueDate: string | null
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('保存結果を確認できませんでした。一度閉じて再取得し、追加済みでないことを確認してから再試行してください。')
  }
  if (!response.ok) {
    throw new Error(response.status === 400 ? '入力内容を確認してください。タイトルは1〜255文字、優先度と期限は有効な値を指定してください。' : '保存に失敗しました。入力内容を保持しています。時間をおいて再試行してください。')
  }
}

export async function updateTask(id: string, input: CreateTaskInput): Promise<Task> {
  return writeTask(`/api/tasks/${id}`, 'PUT', input)
}
export async function moveTask(id: string, status: string, beforeId: string | null): Promise<Task> {
  return writeTask(`/api/tasks/${id}/position`, 'PATCH', { status, beforeId })
}
async function writeTask(url: string, method: string, input: unknown): Promise<Task> {
  let response: Response
  try {
    response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15_000) })
  } catch { throw new Error('保存結果を確認できません。再取得して状態を確認してください。') }
  if (!response.ok) throw new Error(response.status === 400 ? '入力内容を確認してください。' : response.status === 404 ? 'タスクが見つかりません。再取得してください。' : '保存できませんでした。再取得してから再試行してください。')
  const task: unknown = await response.json()
  if (!isTask(task)) throw new Error('保存結果を確認できません。再取得してください。')
  return task
}
