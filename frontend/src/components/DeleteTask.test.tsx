import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { jsonResponse, sampleTasks } from '../test/fixtures'

async function openConfirm() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: `${sampleTasks[0].title}の詳細` }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
  return user
}

describe('タスクの物理削除', () => {
  it.each(['キャンセル', '閉じる', 'Escape'])('%sで詳細へ戻り、削除を送らず次回も確認する', async (action) => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(jsonResponse(url === '/api/settings' ? { confirmDelete: true } : sampleTasks)))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    const user = await openConfirm()
    const dialog = screen.getByRole('dialog', { name: 'タスクを削除しますか？' })
    expect(within(dialog).getByText(sampleTasks[0].title)).toBeVisible()
    expect(within(dialog).getByText(/元に戻せません/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked()
    await user.click(within(dialog).getByRole('checkbox'))
    if (action === 'Escape') fireEvent(dialog, new Event('cancel', { cancelable: true }))
    else await user.click(within(dialog).getByRole('button', { name: action }))
    expect(screen.getByRole('dialog', { name: 'タスクの詳細' })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
    expect(screen.getByRole('dialog', { name: 'タスクを削除しますか？' })).toBeVisible()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('送信待機中は閉じる・キャンセル・再送を防ぎ、成功後に一覧と件数を更新する', async () => {
    let resolve!: (value: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    let deleted = false
    const fetchMock = vi.fn((_url: string, request?: RequestInit) => {
      if (_url === '/api/settings') return Promise.resolve(jsonResponse({ confirmDelete: true }))
      if (request?.method === 'DELETE') return pending.then((response) => { deleted = true; return response })
      return Promise.resolve(jsonResponse(deleted ? sampleTasks.slice(1) : sampleTasks))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    const user = await openConfirm()
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: '削除する' })
    await user.dblClick(confirm)
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '閉じる' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { name: 'タスクを削除しますか？' })).toBeVisible()
    expect(screen.getByRole('button', { name: `${sampleTasks[0].title}の詳細` })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'DELETE')).toHaveLength(1)
    resolve(new Response(null, { status: 204 }))
    await screen.findByText('タスクを削除しました。')
    await waitFor(() => expect(screen.queryByRole('button', { name: `${sampleTasks[0].title}の詳細` })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '＋ タスクを追加' })).toHaveFocus()
    expect(screen.getByText(new RegExp(`^${sampleTasks.length - 1}件のタスク`))).toBeVisible()
    await user.click(screen.getByRole('button', { name: '再取得' }))
    await screen.findByRole('button', { name: `${sampleTasks[1].title}の詳細` })
    expect(screen.queryByRole('button', { name: `${sampleTasks[0].title}の詳細` })).not.toBeInTheDocument()
  })

  it.each([404, 500, 'offline'] as const)('削除失敗 %s では詳細データを保持し、再試行できる', async (failure) => {
    let tries = 0
    const fetchMock = vi.fn((_url: string, request?: RequestInit) => {
      if (_url === '/api/settings') return Promise.resolve(jsonResponse({ confirmDelete: true }))
      if (request?.method !== 'DELETE') return Promise.resolve(jsonResponse(sampleTasks))
      if (++tries > 1) return Promise.resolve(new Response(null, { status: 204 }))
      return failure === 'offline' ? Promise.reject(new TypeError('offline')) : Promise.resolve(jsonResponse({}, failure))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    const user = await openConfirm()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '削除する' }))
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 404 ? '見つかりません' : failure === 500 ? '削除できません' : '再取得')
    expect(screen.getByRole('dialog', { name: 'タスクを削除しますか？' })).toBeVisible()
    expect(screen.getByRole('button', { name: `${sampleTasks[0].title}の詳細` })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    if (failure === 500) {
      await user.click(screen.getByRole('button', { name: '削除する' }))
      await screen.findByText('タスクを削除しました。')
      expect(tries).toBe(2)
    }
  })

  it('検索とソートを保持し、削除後の取得失敗から再取得して空結果に戻れる', async () => {
    let deleted = false
    let failReload = true
    const fetchMock = vi.fn((_url: string, request?: RequestInit) => {
      if (_url === '/api/settings') return Promise.resolve(jsonResponse({ confirmDelete: true }))
      if (request?.method === 'DELETE') { deleted = true; return Promise.resolve(new Response(null, { status: 204 })) }
      if (deleted && failReload) { failReload = false; return Promise.resolve(jsonResponse({}, 500)) }
      return Promise.resolve(jsonResponse(deleted ? [] : sampleTasks))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    const user = userEvent.setup()
    await screen.findByText(sampleTasks[0].title)
    await user.click(screen.getByRole('button', { name: '未着手を優先度の降順に並べ替える' }))
    await user.click(screen.getByText('タスクを検索'))
    await user.type(screen.getByRole('searchbox'), 'API')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await screen.findByRole('button', { name: `${sampleTasks[0].title}の詳細` })
    await openConfirm()
    await user.click(screen.getByRole('button', { name: '削除する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('取得できません')
    expect(screen.getByText('タスクを削除しました。')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'もう一度取得' }))
    await screen.findByText(/^検索結果：0件/)
    expect(fetchMock.mock.lastCall?.[0]).toBe('/api/tasks?q=API')
    expect(screen.getByRole('button', { name: '未着手を優先度の降順に並べ替える' })).toHaveAttribute('aria-pressed', 'true')
  })
})
