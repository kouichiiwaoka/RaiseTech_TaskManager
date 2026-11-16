import type { Task } from '../types'

export const sampleTasks: Task[] = [
  { id: '00000000-0000-4000-8000-000000000001', title: '画面の構成を考える', description: null, priority: 'high', dueDate: '2026-01-01', status: 'todo', sortOrder: 0 },
  { id: '00000000-0000-4000-8000-000000000002', title: 'APIの接続を確認する', description: '架空の検証用タスク', priority: 'medium', dueDate: null, status: 'doing', sortOrder: 0 },
  { id: '00000000-0000-4000-8000-000000000003', title: '環境構築を終える', description: null, priority: 'low', dueDate: '2026-01-01', status: 'done', sortOrder: 0 },
]

export const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})
