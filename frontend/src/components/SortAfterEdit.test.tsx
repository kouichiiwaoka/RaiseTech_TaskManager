import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TaskBoard } from './TaskBoard'
import { sampleTasks } from '../test/fixtures'
it.each(['priority', 'dueDate'] as const)('%sの編集後に同順位なら直前表示順を保持する', (field) => {
  const a = { ...sampleTasks[0], id: 'a', title: 'A', status: 'todo' as const, priority: 'high' as const, dueDate: '2026-12-02' }
  const b = { ...a, id: 'b', title: 'B', priority: 'low' as const, dueDate: '2026-12-01' }
  const props = { loading: false, error: false, filtered: false, today: '2026-11-18', onOpen: vi.fn() }
  const view = render(<TaskBoard {...props} tasks={[a, b]} />)
  fireEvent.click(screen.getByRole('button', { name: `未着手を${field === 'priority' ? '優先度' : '期限'}の昇順に並べ替える` }))
  const order = () => Array.from(screen.getByRole('list', { name: '未着手のタスク' }).querySelectorAll('[data-task-id]')).map((el) => el.getAttribute('data-task-id'))
  expect(order()).toEqual(['b', 'a'])
  view.rerender(<TaskBoard {...props} error tasks={[]} />)
  expect(screen.queryByRole('list', { name: '未着手のタスク' })).not.toBeInTheDocument()
  view.rerender(<TaskBoard {...props} loading tasks={[]} />)
  view.rerender(<TaskBoard {...props} tasks={[{ ...a, [field]: b[field] }, b]} />)
  expect(order()).toEqual(['b', 'a'])
  view.rerender(<TaskBoard {...props} tasks={[{ ...a, [field]: b[field] }, b, { ...b, id: 'c', title: 'C' }]} />)
  expect(order()).toEqual(['b', 'a', 'c'])
  view.rerender(<TaskBoard {...props} tasks={[{ ...a, [field]: b[field] }, { ...b, id: 'c', title: 'C' }]} />)
  expect(order()).toEqual(['a', 'c'])
  view.rerender(<TaskBoard {...props} tasks={[]} />)
  expect(screen.queryByRole('list', { name: '未着手のタスク' })).not.toBeInTheDocument()
  view.rerender(<TaskBoard {...props} tasks={[a, b]} />)
  expect(order()).toEqual(['b', 'a'])
  view.rerender(<TaskBoard {...props} tasks={[{ ...a, [field]: b[field] }, b]} />)
  expect(order()).toEqual(['b', 'a'])
  view.rerender(<TaskBoard {...props} tasks={[{ ...a, [field]: b[field] }, b]} />)
  expect(order()).toEqual(['b', 'a'])
})
