import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Task, TaskStatus } from '../types'
import { TaskBoard } from './TaskBoard'
import { sampleTasks } from '../test/fixtures'

const sortCases = [
  ['優先度', '昇順', ['低A', '低B', '中', '高']],
  ['優先度', '降順', ['高', '中', '低A', '低B']],
  ['期限', '昇順', ['低A', '低B', '中', '高']],
  ['期限', '降順', ['中', '低A', '低B', '高']],
] as const
const columns = [['todo', '未着手'], ['doing', '作業中'], ['done', '完了']] as const

function rows(status: TaskStatus): Task[] {
  return [
    { ...sampleTasks[0], id: `${status}-high`, title: '高', status, priority: 'high', dueDate: null },
    { ...sampleTasks[0], id: `${status}-lowA`, title: '低A', status, priority: 'low', dueDate: '2026-11-10' },
    { ...sampleTasks[0], id: `${status}-medium`, title: '中', status, priority: 'medium', dueDate: '2026-11-20' },
    { ...sampleTasks[0], id: `${status}-lowB`, title: '低B', status, priority: 'low', dueDate: '2026-11-10' },
  ]
}

function titles(label: string) {
  return within(screen.getByRole('list', { name: `${label}のタスク` })).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
}

function board(tasks: Task[], loading = false, error = false) {
  return <TaskBoard tasks={tasks} loading={loading} error={error} filtered={false} today="2026-11-16" onOpen={vi.fn()} />
}

describe('各列の並べ替えボタン', () => {
  for (const [status, label] of columns) {
    it.each(sortCases)(`${label}の%s・%sを押すと順序と選択表示が変わり、他の列に影響しない`, async (field, direction, expected) => {
      const user = userEvent.setup()
      render(board(columns.flatMap(([key]) => rows(key))))
      const target = screen.getByRole('button', { name: `${label}を${field}の${direction}に並べ替える` })
      expect(target).toHaveAttribute('aria-pressed', 'false')
      await user.click(target)
      expect(titles(label)).toEqual(expected)
      expect(target).toHaveAttribute('aria-pressed', 'true')
      for (const [otherStatus, otherLabel] of columns) {
        if (otherStatus !== status) expect(titles(otherLabel)).toEqual(['高', '低A', '中', '低B'])
      }
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    })
  }

  it('別の並べ替えに切り替えても、同順位のカードは直前の表示順を維持する', async () => {
    const user = userEvent.setup()
    const tasks: Task[] = [
      { ...sampleTasks[0], id: 'a', title: '低い優先度', priority: 'low', dueDate: '2026-11-20' },
      { ...sampleTasks[0], id: 'b', title: '高い優先度', priority: 'high', dueDate: '2026-11-20' },
    ]
    render(board(tasks))
    await user.click(screen.getByRole('button', { name: '未着手を優先度の降順に並べ替える' }))
    expect(titles('未着手')).toEqual(['高い優先度', '低い優先度'])
    await user.click(screen.getByRole('button', { name: '未着手を期限の昇順に並べ替える' }))
    expect(titles('未着手')).toEqual(['高い優先度', '低い優先度'])
    expect(screen.getByRole('button', { name: '未着手を優先度の降順に並べ替える' })).toHaveAttribute('aria-pressed', 'false')
  })

  it.each([[true, false], [false, true]])('読み込み中=%s・エラー=%sでは12個のソートボタンを無効にする', (loading, error) => {
    render(board([], loading, error))
    const buttons = screen.getAllByRole('button', { name: /並べ替える/ })
    expect(buttons).toHaveLength(12)
    for (const button of buttons) expect(button).toBeDisabled()
  })

  it('空の列でも並べ替えボタンを残し、取得済みの列データを書き換えない', () => {
    const tasks = rows('todo')
    const before = structuredClone(tasks)
    render(board(tasks))
    fireEvent.click(screen.getByRole('button', { name: '完了を優先度の昇順に並べ替える' }))
    fireEvent.click(screen.getByRole('button', { name: '未着手を優先度の昇順に並べ替える' }))
    expect(tasks).toEqual(before)
    expect(screen.getAllByText('まだタスクはありません')).toHaveLength(2)
  })
})
