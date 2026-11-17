import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateTaskForm } from './CreateTaskForm'
import { App } from '../App'
import { jsonResponse, sampleTasks } from '../test/fixtures'

function setup() {
  const onSaved = vi.fn(), onCancel = vi.fn(), onBusy = vi.fn()
  render(<CreateTaskForm onSaved={onSaved} onCancel={onCancel} onBusy={onBusy} />)
  return { onSaved, onCancel, onBusy }
}

describe('タスク登録', () => {
  it('空白タイトルと256文字ではPOSTせず、入力エラーを表示する', async () => {
    const user = userEvent.setup(), fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setup()
    const input = screen.getByRole('textbox', { name: 'タイトル必須' })
    await user.type(input, '   ')
    fireEvent.submit(screen.getByRole('form'))
    expect(screen.getByRole('alert')).toHaveTextContent('1〜255文字')
    await user.clear(input)
    fireEvent.change(input, { target: { value: 'a'.repeat(256) } })
    fireEvent.submit(screen.getByRole('form'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('JSONをPOSTし、待機中は入力・キャンセル・送信を無効化して二重送信を防ぐ', async () => {
    const user = userEvent.setup()
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetchMock)
    const { onSaved } = setup()
    await user.type(screen.getByRole('textbox', { name: 'タイトル必須' }), ' 架空のタスク ')
    await user.type(screen.getByRole('textbox', { name: '説明文任意' }), '架空の説明')
    await user.selectOptions(screen.getByRole('combobox'), 'high')
    fireEvent.change(screen.getByLabelText('期限任意'), { target: { value: '2026-12-01' } })
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }))
    fireEvent.submit(screen.getByRole('form'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/tasks')
    expect(request.method).toBe('POST')
    expect(JSON.parse(String(request.body))).toEqual({ title: '架空のタスク', description: '架空の説明', priority: 'high', dueDate: '2026-12-01' })
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    expect(onSaved).not.toHaveBeenCalled()
    resolve(new Response(null, { status: 201 }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  })

  it('失敗時に入力を保持し、そのまま再試行できる', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { onSaved } = setup()
    await user.type(screen.getByRole('textbox', { name: 'タイトル必須' }), '架空のタスク')
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗')
    expect(screen.getByRole('textbox', { name: 'タイトル必須' })).toHaveValue('架空のタスク')
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ title: '架空のタスク', priority: 'medium', dueDate: null, description: null })
  })

  it('通信結果不明時は重複登録を避ける確認方法を案内する', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    setup()
    await user.type(screen.getByRole('textbox', { name: 'タイトル必須' }), '架空のタスク')
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('追加済みでないことを確認')
  })

  it('保存成功後はダイアログを閉じ一覧を再取得し、再マウント後も取得する', async () => {
    const user = userEvent.setup()
    const added = { ...sampleTasks[0], id: 'added', title: '登録した架空のタスク', sortOrder: 100 }
    let persisted = false
    const fetchMock = vi.fn((_url: string, request?: RequestInit) => {
      if (request?.method === 'POST') { persisted = true; return Promise.resolve(jsonResponse(added, 201)) }
      return Promise.resolve(jsonResponse(persisted ? [...sampleTasks, added] : sampleTasks))
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<App />)
    await screen.findByText(sampleTasks[0].title)
    await user.click(screen.getByRole('button', { name: '＋ タスクを追加' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'タイトル必須' }), added.title)
    await user.click(within(dialog).getByRole('button', { name: 'タスクを追加' }))
    expect(await screen.findByText(added.title)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()
    render(<App />)
    expect(await screen.findByText(added.title)).toBeVisible()
    expect(within(screen.getByRole('list', { name: '未着手のタスク' })).getAllByRole('heading').map((element) => element.textContent)).toEqual([sampleTasks[0].title, added.title])
  })
})
