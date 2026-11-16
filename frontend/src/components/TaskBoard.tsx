import { useState } from 'react'
import { columns } from '../types'
import type { Task, TaskStatus } from '../types'
import { TaskCard } from './TaskCard'

type Sort = { field: 'priority' | 'dueDate'; direction: 'asc' | 'desc'; previousOrder: string[] }
const priorityRank = { low: 0, medium: 1, high: 2 }

function compare(a: Task, b: Task, sort: Sort) {
  const sign = sort.direction === 'asc' ? 1 : -1
  if (sort.field === 'priority') return (priorityRank[a.priority] - priorityRank[b.priority]) * sign
  if (a.dueDate === b.dueDate) return 0
  if (a.dueDate === null) return 1
  if (b.dueDate === null) return -1
  return a.dueDate.localeCompare(b.dueDate) * sign
}

export function TaskBoard({ tasks, loading, error, filtered, today, onOpen }: {
  tasks: Task[]; loading: boolean; error: boolean; filtered: boolean; today: string; onOpen: (task: Task) => void
}) {
  const [sorts, setSorts] = useState<Partial<Record<TaskStatus, Sort>>>({})

  return (
    <section className="board" aria-label="タスクボード" aria-busy={loading}>
      {columns.map((column) => {
        const selected = sorts[column.status]
        const items = tasks.filter((task) => task.status === column.status)
        if (selected) {
          // 同順位では、APIの元順ではなく直前の画面上の順序を維持する。
          const positions = new Map(selected.previousOrder.map((id, index) => [id, index]))
          items.sort((a, b) => compare(a, b, selected)
            || (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER))
        }
        const note = !selected ? '保存された順序で表示しています。'
          : selected.field === 'priority' ? `優先度：${selected.direction === 'asc' ? '低 → 中 → 高' : '高 → 中 → 低'}`
          : `期限：${selected.direction === 'asc' ? '近い順' : '遠い順'}・期限なしは最後`
        return (
          <section className="column" data-status={column.status} key={column.status} aria-labelledby={`heading-${column.status}`}>
            <div className="column-header">
              <span className="dot" aria-hidden="true" /><h2 id={`heading-${column.status}`}>{column.label}</h2>
              <span className="count" aria-label={`${column.label}の表示件数`}>{loading || error ? '—' : items.length}</span>
              <span className="column-note">{{ todo: 'これから取り組む', doing: 'いま進めている', done: 'できたこと' }[column.status]}</span>
            </div>
            <div className="column-sorts" aria-label={`${column.label}の並べ替え`}>
              {([['priority', '優先度'], ['dueDate', '期限']] as const).map(([field, label]) => (
                <div className="sort-controls" role="group" aria-label={`${column.label}の${label}`} key={field}>
                  <span className="sort-label">{label}</span>
                  {([['asc', '昇順', '↑'], ['desc', '降順', '↓']] as const).map(([direction, text, arrow]) => (
                    <button type="button" key={direction} disabled={loading || error} aria-pressed={selected?.field === field && selected.direction === direction}
                      aria-label={`${column.label}を${label}の${text}に並べ替える`}
                      onClick={() => setSorts((current) => ({ ...current, [column.status]: { field, direction, previousOrder: items.map((task) => task.id) } }))}>
                      {text} <span aria-hidden="true">{arrow}</span>
                    </button>
                  ))}
                </div>
              ))}
              <p className="column-sort-note">{note}</p>
            </div>
            {loading ? <div className="card-list" aria-hidden="true"><div className="card-skeleton" /><div className="card-skeleton" /></div>
              : error ? <div className="card-list"><p className="empty">取得後にタスクを表示します</p></div>
              : items.length ? <ul className="card-list" aria-label={`${column.label}のタスク`}>{items.map((task) => <TaskCard key={task.id} task={task} today={today} onOpen={onOpen} />)}</ul>
              : <div className="card-list"><p className="empty"><span aria-hidden="true">▧</span>{filtered ? 'この条件に一致するタスクはありません' : 'まだタスクはありません'}</p></div>}
          </section>
        )
      })}
    </section>
  )
}
