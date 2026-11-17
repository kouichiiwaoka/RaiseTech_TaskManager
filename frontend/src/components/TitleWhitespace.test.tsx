import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CreateTaskForm } from './CreateTaskForm'
import { sampleTasks, jsonResponse } from '../test/fixtures'
it.each([false, true])('登録/編集=%sで空白除去後の上限を検証する', async (editing) => {
  const mock = vi.fn().mockResolvedValue(jsonResponse(sampleTasks[0], editing ? 200 : 201))
  vi.stubGlobal('fetch', mock)
  render(<CreateTaskForm task={editing ? sampleTasks[0] : undefined} onSaved={vi.fn()} onBusy={vi.fn()} onCancel={vi.fn()} />)
  const title = screen.getByRole('textbox', { name: 'タイトル必須' })
  const submit = () => fireEvent.submit(screen.getByRole('form'))
  fireEvent.change(title, { target: { value: '\u00a0\u0085\ufeff\u001c' } }); submit()
  expect(mock).not.toHaveBeenCalled()
  fireEvent.change(title, { target: { value: '\u00a0' + '😀'.repeat(256) + '\ufeff' } }); submit()
  expect(mock).not.toHaveBeenCalled()
  fireEvent.change(title, { target: { value: '\u00a0' + '😀'.repeat(255) + '\ufeff' } }); submit()
  await waitFor(() => expect(mock).toHaveBeenCalledOnce())
  expect(JSON.parse(mock.mock.calls[0][1].body).title).toBe('😀'.repeat(255))
})
