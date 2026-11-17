import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { CreateTaskForm } from './CreateTaskForm'
import { TaskBoard } from './TaskBoard'
import { jsonResponse, sampleTasks } from '../test/fixtures'
it('編集失敗後の再試行で入力を保持し保存中の二重送信を防ぐ', async () => {
  let finish!: (value: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 500)).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  const saved = vi.fn()
  render(<CreateTaskForm task={sampleTasks[0]} onSaved={saved} onCancel={vi.fn()} onBusy={vi.fn()} />)
  const user = userEvent.setup()
  const title = screen.getByRole('textbox', { name: 'タイトル必須' })
  await user.clear(title); await user.type(title, '再試行する変更')
  await user.click(screen.getByRole('button', { name: '変更を保存' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(title).toHaveValue('再試行する変更'); expect(saved).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '変更を保存' }))
  fireEvent.submit(title.closest('form')!)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).title).toBe('再試行する変更')
  expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
  finish(jsonResponse({ ...sampleTasks[0], title: '再試行する変更' }))
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
})
it.each([true, false])('カード上半分=%sで挿入位置を送り別列のソートを維持する', async above => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...sampleTasks[0], status: 'doing' }))
  vi.stubGlobal('fetch', fetchMock)
  const next = { ...sampleTasks[1], id: '00000000-0000-4000-8000-000000000004', title: '次のカード', sortOrder: 1 }
  const changed = vi.fn()
  render(<TaskBoard tasks={[...sampleTasks, next]} loading={false} error={false} filtered={false} today="2026-11-17" onOpen={vi.fn()} onChanged={changed} />)
  fireEvent.click(screen.getByRole('button', { name: '完了を優先度の降順に並べ替える' }))
  const source = screen.getByRole('button', { name: `${sampleTasks[0].title}の詳細` })
  const target = screen.getByRole('button', { name: `${sampleTasks[1].title}の詳細` })
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 100 } as DOMRect)
  fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn() } })
  const drop = new Event('drop', { bubbles: true })
  Object.defineProperty(drop, 'clientY', { value: above ? 20 : 80 })
  fireEvent(target, drop)
  await waitFor(() => expect(changed).toHaveBeenCalledOnce())
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'doing', beforeId: above ? sampleTasks[1].id : next.id })
  expect(screen.getByRole('button', { name: '完了を優先度の降順に並べ替える' })).toHaveAttribute('aria-pressed', 'true')
})
it('中断と自己ドロップでは保存せず保存中の追加ドロップを無視する', async () => {
  let finish!: (value: Response) => void
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  const changed = vi.fn()
  render(<TaskBoard tasks={sampleTasks} loading={false} error={false} filtered={false} today="2026-11-17" onOpen={vi.fn()} onChanged={changed} />)
  const source = screen.getByRole('button', { name: `${sampleTasks[0].title}の詳細` })
  const destination = screen.getByRole('region', { name: '作業中' })
  const start = () => fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn() } })
  start(); fireEvent.dragEnd(source); fireEvent.drop(destination)
  expect(fetchMock).not.toHaveBeenCalled()
  start(); fireEvent.drop(source)
  expect(fetchMock).not.toHaveBeenCalled()
  start(); fireEvent.drop(destination); fireEvent.drop(destination)
  expect(fetchMock).toHaveBeenCalledOnce()
  finish(jsonResponse({ ...sampleTasks[0], status: 'doing' }))
  await waitFor(() => expect(changed).toHaveBeenCalledOnce())
})
