import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { jsonResponse, sampleTasks } from './test/fixtures'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function renderBoard() {
  const view = render(<App />)
  fireEvent.click(screen.getByText('タスクを検索'))
  return view
}

afterEach(() => vi.useRealTimers())

describe('検索ボード', () => {
  it('初回の全件取得を3列に分け、APIの列内順序とnull・期限を表示する', async () => {
    const second = { ...sampleTasks[0], id: 'another', title: '後ろのタスク', sortOrder: 2 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([...sampleTasks, second])))
    renderBoard()
    expect(screen.getByRole('status')).toHaveTextContent('読み込み中')
    expect(await screen.findByText(sampleTasks[1].title)).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('4件のタスク · 1件完了')
    expect(within(screen.getByRole('list', { name: '未着手のタスク' })).getAllByRole('heading', { level: 3 }).map((item) => item.textContent)).toEqual([sampleTasks[0].title, second.title])
    expect(within(screen.getByRole('list', { name: '作業中のタスク' })).getByText('期限なし')).toBeVisible()
    expect(within(screen.getByRole('list', { name: '完了のタスク' })).queryByText('期限超過')).not.toBeInTheDocument()
    expect(screen.getAllByText('期限超過')).toHaveLength(2)
    expect(screen.getAllByText('2026/01/01')).toHaveLength(3)
    expect(screen.getAllByText('高')).toHaveLength(2)
  })

  it('入力だけでは通信せず、Enterで複合検索し、クリアで全件へ戻る', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(sampleTasks)))
    vi.stubGlobal('fetch', fetchMock)
    renderBoard()
    await screen.findByText(sampleTasks[0].title)
    const input = screen.getByRole('searchbox', { name: 'タイトルを検索' })
    await user.type(input, 'API')
    await user.selectOptions(screen.getByRole('combobox'), 'doing')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([sampleTasks[1]])))
    await user.type(input, '{Enter}')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('検索結果：1件のタスク'))
    expect(new URL(fetchMock.mock.calls[1][0], 'http://localhost').searchParams.get('status')).toBe('doing')
    expect(screen.queryByText(sampleTasks[0].title)).not.toBeInTheDocument()
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(sampleTasks)))
    await user.click(within(screen.getByRole('form', { name: 'タスク検索' })).getByRole('button', { name: 'クリア' }))
    await screen.findByText(sampleTasks[0].title)
    expect(input).toHaveValue('')
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(fetchMock.mock.lastCall?.[0]).toBe('/api/tasks')
  })

  it('全件0件と検索0件を区別し、3列を維持する', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([]))))
    renderBoard()
    await waitFor(() => expect(screen.getAllByText('まだタスクはありません')).toHaveLength(3))
    await user.type(screen.getByRole('searchbox'), '該当なし')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('検索結果：0件のタスク'))
    expect(screen.getAllByText('この条件に一致するタスクはありません')).toHaveLength(3)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3)
  })

  it('検索時の通信失敗で入力と条件を維持し、同じ条件で再取得できる', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(sampleTasks)).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(jsonResponse([sampleTasks[1]]))
    vi.stubGlobal('fetch', fetchMock)
    renderBoard()
    await screen.findByText(sampleTasks[0].title)
    await user.type(screen.getByRole('searchbox'), 'API')
    await user.selectOptions(screen.getByRole('combobox'), 'doing')
    await user.click(screen.getByRole('button', { name: '検索' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('通信に失敗')
    expect(screen.getByRole('searchbox')).toHaveValue('API')
    expect(screen.queryByText(sampleTasks[0].title)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'もう一度取得' }))
    expect(await screen.findByText(sampleTasks[1].title)).toBeVisible()
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('中断に応じない古い検索応答が後から届いても新しい結果を維持する', async () => {
    const user = userEvent.setup()
    const old = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(jsonResponse([sampleTasks[1]]))
    vi.stubGlobal('fetch', fetchMock)
    renderBoard()
    await user.type(screen.getByRole('searchbox'), 'API')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await screen.findByText(sampleTasks[1].title)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    await act(async () => { old.resolve(jsonResponse([sampleTasks[0]])) })
    expect(screen.queryByText(sampleTasks[0].title)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('検索結果：1件のタスク')
  })

  it('10秒応答がない場合は再取得を案内する', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    renderBoard()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(screen.getByRole('alert')).toHaveTextContent('応答に時間がかかっています')
    expect(screen.getByRole('button', { name: 'もう一度取得' })).toBeEnabled()
  })

  it('StrictModeによる再実行でも中断した通信のエラーを表示しない', async () => {
    const old = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(jsonResponse(sampleTasks))
    vi.stubGlobal('fetch', fetchMock)
    render(<StrictMode><App /></StrictMode>)
    await screen.findByText(sampleTasks[0].title)
    await act(async () => { old.resolve(jsonResponse([])) })
    expect(screen.getByRole('status')).toHaveTextContent('3件のタスク')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('検索フォームの送信によってページ遷移しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([]))))
    renderBoard()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0件のタスク'))
    expect(fireEvent.submit(screen.getByRole('form', { name: 'タスク検索' }))).toBe(false)
  })
})
