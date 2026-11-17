import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { jsonResponse, sampleTasks } from '../test/fixtures'

async function openDetail() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: `${sampleTasks[0].title}の詳細` }))
  return user
}

describe('削除確認の省略設定', () => {
  it('チェックして保存した後、次回と再マウント後は確認せず削除する', async () => {
    let confirmDelete = true
    const mock = vi.fn((url: string, request?: RequestInit) => {
      if (url === '/api/settings') return Promise.resolve(jsonResponse({ confirmDelete }))
      if (request?.method === 'DELETE') {
        if (url.endsWith('?skipConfirmation=true')) confirmDelete = false
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      return Promise.resolve(jsonResponse(sampleTasks))
    })
    vi.stubGlobal('fetch', mock)
    const view = render(<App />)
    let user = await openDetail()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: '今後この確認を表示しない' }))
    await user.click(screen.getByRole('button', { name: '削除する' }))
    await screen.findByText('タスクを削除しました。')
    expect(confirmDelete).toBe(false)
    for (const remount of [false, true]) {
      if (remount) { view.unmount(); render(<App />) }
      user = await openDetail()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
      await screen.findByText('タスクを削除しました。')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    }
    expect(mock.mock.calls.filter((call) => call[1]?.method === 'DELETE').map((call) => call[0])).toEqual([
      `/api/tasks/${sampleTasks[0].id}?skipConfirmation=true`, `/api/tasks/${sampleTasks[0].id}`, `/api/tasks/${sampleTasks[0].id}`,
    ])
  })

  it('チェックなし削除では次回も確認する', async () => {
    const mock = vi.fn((url: string, request?: RequestInit) => Promise.resolve(
      url === '/api/settings' ? jsonResponse({ confirmDelete: true }) : request?.method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(sampleTasks)))
    vi.stubGlobal('fetch', mock)
    render(<App />)
    for (let i = 0; i < 2; i++) {
      const user = await openDetail()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
      expect(screen.getByRole('dialog', { name: 'タスクを削除しますか？' })).toBeVisible()
      await user.click(screen.getByRole('button', { name: '削除する' }))
      await screen.findByText('タスクを削除しました。')
    }
    expect(mock.mock.calls.filter((call) => call[1]?.method === 'DELETE').every((call) => !call[0].includes('?'))).toBe(true)
  })

  it('設定取得待機中の操作を抑止し、取得失敗では削除せず再試行する', async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    let reads = 0
    const mock = vi.fn((url: string) => url === '/api/settings'
      ? ++reads === 1 ? pending : Promise.resolve(jsonResponse({ confirmDelete: true }))
      : Promise.resolve(jsonResponse(sampleTasks)))
    vi.stubGlobal('fetch', mock)
    render(<App />)
    const user = await openDetail()
    const dialog = screen.getByRole('dialog')
    await user.dblClick(within(dialog).getByRole('button', { name: '削除' }))
    expect(within(dialog).getByRole('button', { name: '削除' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '編集する' })).toBeDisabled()
    expect(within(dialog).getAllByRole('button', { name: '閉じる' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { name: 'タスクの詳細' })).toBeVisible()
    expect(reads).toBe(1)
    resolve(jsonResponse({}, 500))
    expect(await screen.findByRole('alert')).toHaveTextContent('タスクは削除していません')
    expect(mock).toHaveBeenCalledTimes(2)
    await user.click(within(dialog).getByRole('button', { name: '削除' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it.each([500, 404, 'offline'] as const)('確認省略中の削除失敗 %s では詳細を保持し二重送信しない', async (failure) => {
    let resolve!: (response: Response) => void
    let reject!: (error: Error) => void
    const pending = new Promise<Response>((done, failed) => { resolve = done; reject = failed })
    const mock = vi.fn((url: string, request?: RequestInit) => {
      if (url === '/api/settings') return Promise.resolve(jsonResponse({ confirmDelete: false }))
      if (request?.method === 'DELETE') return pending
      return Promise.resolve(jsonResponse(sampleTasks))
    })
    vi.stubGlobal('fetch', mock)
    render(<App />)
    const user = await openDetail()
    await user.dblClick(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(mock.mock.calls.filter((call) => call[1]?.method === 'DELETE')).toHaveLength(1))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    if (failure === 'offline') reject(new TypeError('offline'))
    else resolve(jsonResponse({}, failure))
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 500 ? '削除できません' : failure === 404 ? '見つかりません' : '再取得')
    expect(screen.getByRole('dialog', { name: 'タスクの詳細' })).toBeVisible()
    expect(screen.getByRole('button', { name: `${sampleTasks[0].title}の詳細` })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' })).toBeEnabled()
  })
})
