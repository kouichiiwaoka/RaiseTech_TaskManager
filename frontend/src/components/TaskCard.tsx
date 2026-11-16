import type { Task } from '../types'

const priorityLabels = { high: '高', medium: '中', low: '低' }

export function TaskCard({ task, today, onOpen }: { task: Task; today: string; onOpen: (task: Task) => void }) {
  const overdue = task.status !== 'done' && task.dueDate !== null && task.dueDate < today
  const dueLabel = task.dueDate ? task.dueDate.replaceAll('-', '/') : '期限なし'

  return (
    <li>
      <button type="button" className="card" aria-label={`${task.title}の詳細`} onClick={() => onOpen(task)}>
        <span className="card-top"><span className={`priority ${task.priority}`}>{priorityLabels[task.priority]}</span><span className="grip" aria-hidden="true">⠿</span></span>
        <h3>{task.title}</h3>
        <span className={`card-bottom ${overdue ? 'overdue' : ''}`}>
          <span aria-hidden="true">{task.dueDate ? '◷' : '—'} </span>
          {task.dueDate ? <time dateTime={task.dueDate}>{dueLabel}</time> : dueLabel}
          {overdue && <span className="sr-only">期限超過</span>}
        </span>
      </button>
    </li>
  )
}
