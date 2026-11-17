import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { columns } from '../types'
import type { Task, TaskStatus } from '../types'
import { TaskCard } from './TaskCard'
import { moveTask } from '../api/tasks'

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

export function TaskBoard({ tasks, loading, error, filtered, today, onOpen, onChanged }: {
  tasks: Task[]; loading: boolean; error: boolean; filtered: boolean; today: string; onChanged?: () => void; onOpen: (task: Task) => void
}) {
  const [previousTasks, setPreviousTasks] = useState(tasks)
  const [sorts, setSorts] = useState<Partial<Record<TaskStatus, Sort>>>({})

  const [dragging, setDragging] = useState<string | null>(null)
  const [destination, setDestination] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState('')
  const pending = useRef(false)
  const disabled = loading || error || filtered || moving

  // 成功した取得結果が変わるときだけ、変更直前に表示していた順序を記録する。
  if (!loading && !error && tasks !== previousTasks) {
    setPreviousTasks(tasks)
    setSorts((current) => Object.fromEntries(Object.entries(current).map(([status, sort]) => {
      const positions = new Map(sort.previousOrder.map((id, index) => [id, index]))
      const prior = previousTasks.filter((task) => task.status === status)
        .sort((a, b) => compare(a, b, sort)
          || (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER))
      return [status, { ...sort, previousOrder: prior.map((task) => task.id) }]
    })))
  }

  function locate(event: DragEvent<HTMLElement>, status: TaskStatus) {
    if (!dragging || disabled || pending.current) return null
    const target = event.target as HTMLElement
    if (target.closest('[data-task-id]')?.getAttribute('data-task-id') === dragging) return null
    const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]'))
      .filter((card) => card.dataset.taskId !== dragging)
    if (!cards.length && tasks.find((task) => task.id === dragging)?.status === status) return null
    const hovered = target.closest<HTMLElement>('[data-task-id]')
    if (hovered && cards.includes(hovered)) {
      const rect = hovered.getBoundingClientRect()
      const before = event.clientY <= rect.top + rect.height / 2
        ? hovered : cards[cards.indexOf(hovered) + 1]
      return { status, beforeId: before?.dataset.taskId ?? null }
    }
    const before = cards.find((card) => {
      const rect = card.getBoundingClientRect()
      return event.clientY <= rect.top + rect.height / 2
    })
    return { status, beforeId: before?.dataset.taskId ?? null }
  }

  async function drop(id: string, status: TaskStatus, beforeId: string | null) {
    setDestination(null)
    setDragging(null)
    if (disabled || pending.current || id === beforeId) return
    const task = tasks.find((task) => task.id === id)
    if (!task) return
    pending.current = true
    setMoving(true)
    setMoveError('')
    try {
      await moveTask(id, status, beforeId)
      setSorts((previous) => {
        const next = { ...previous }
        delete next[task.status]
        delete next[status]
        return next
      })
      onChanged?.()
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : '移動できませんでした。')
    } finally {
      pending.current = false
      setMoving(false)
      setDragging(null)
    }
  }

  return (
    <>
    {moveError && <p className="notice" role="alert">{moveError}</p>}
    {moving && <p role="status">移動を保存中…</p>}
    {filtered && <p className="board-tip">ドラッグで移動するには検索条件をクリアしてください。</p>}
    <section className="board" aria-label="タスクボード" aria-busy={loading}>
      {columns.map((column) => {
        const selected = sorts[column.status]
        const items = tasks.filter((task) => task.status === column.status)
        if (selected) {
          // 同順位では、APIの元順ではなく直前の成功表示の順序を使う。
          const positions = new Map(selected.previousOrder.map((id, index) => [id, index]))
          items.sort((a, b) => compare(a, b, selected)
            || (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER))
        }
        const note = !selected ? '保存された順序で表示しています。'
          : selected.field === 'priority' ? `優先度：${selected.direction === 'asc' ? '低 → 中 → 高' : '高 → 中 → 低'}`
          : `期限：${selected.direction === 'asc' ? '近い順' : '遠い順'}・期限なしは最後`
        return (
          <section onDragOver={(event) => {
              const next = locate(event, column.status)
              setDestination(next)
              if (next) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }
            }}
            onDragLeave={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDestination(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              const next = locate(event, column.status)
              setDestination(null)
              if (next && dragging) void drop(dragging, next.status, next.beforeId)
              else setDragging(null)
            }}
            className={`column ${dragging && !disabled ? 'drop-enabled' : ''} ${destination?.status === column.status && !disabled && !items.length ? 'drop-empty' : ''}`} data-status={column.status} key={column.status} aria-labelledby={`heading-${column.status}`}>
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
                    <button type="button" key={direction} disabled={loading || error || moving} aria-pressed={selected?.field === field && selected.direction === direction}
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
              : items.length ? <ul className="card-list" aria-label={`${column.label}のタスク`}>{items.map((task) => <TaskCard key={task.id} task={task} today={today} onOpen={onOpen} draggable={!disabled}
                  insertion={destination?.status === column.status && !disabled
                    ? destination.beforeId === task.id ? 'before'
                      : destination.beforeId === null && task.id === items.filter((item) => item.id !== dragging).at(-1)?.id ? 'after' : undefined
                    : undefined}
                  onDragStart={(event) => { if (disabled) { event.preventDefault(); return }; event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move'; setDestination(null); setDragging(task.id) }}
                  onDragEnd={() => { setDragging(null); setDestination(null) }} />)}</ul>
              : <div className="card-list"><p className="empty"><span aria-hidden="true">▧</span>{filtered ? 'この条件に一致するタスクはありません' : 'まだタスクはありません'}</p></div>}
          </section>
        )
      })}
    </section>
    </>
  )
}
