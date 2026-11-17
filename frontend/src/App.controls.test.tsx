import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { jsonResponse, sampleTasks } from './test/fixtures'

function renderApp() {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(sampleTasks)))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  return fetchMock
}

describe('配置変更後のボタン操作', () => {
  it('検索欄は初期状態で折りたたまれ、開くとフォームを操作できる', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByText(sampleTasks[0].title)
    expect(screen.getByRole('searchbox')).not.toBeVisible()
    await user.click(screen.getByText('タスクを検索'))
    expect(screen.getByRole('searchbox', { name: 'タイトルを検索' })).toBeVisible()
    await user.click(screen.getByText('タスクを検索'))
    expect(screen.getByRole('searchbox')).not.toBeVisible()
  })

  it.each(['キャンセル', '閉じる', 'cancelイベント'])('追加ボタンでフォームを開き、%sで閉じて元のボタンに戻る', async (action) => {
    const user = userEvent.setup()
    const fetchMock = renderApp()
    await screen.findByText(sampleTasks[0].title)
    const add = screen.getByRole('button', { name: '＋ タスクを追加' })
    await user.click(add)
    const dialog = screen.getByRole('dialog', { name: 'タスクを追加' })
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('textbox', { name: 'タイトル必須' })).toHaveFocus()
    expect(within(dialog).getByRole('combobox', { name: '優先度' })).toHaveValue('medium')
    expect(within(dialog).getByRole('button', { name: 'タスクを追加' })).toBeEnabled()
    await user.type(within(dialog).getByRole('textbox', { name: 'タイトル必須' }), '架空の新規タスク')
    if (action === 'cancelイベント') fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
    else await user.click(within(dialog).getByRole('button', { name: action }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(add).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('カードで対象の詳細を開き、閉じた後に別のカードの内容へ切り替えられる', async () => {
    const user = userEvent.setup()
    const fetchMock = renderApp()
    await screen.findByText(sampleTasks[0].title)
    const first = screen.getByRole('button', { name: `${sampleTasks[0].title}の詳細` })
    await user.click(first)
    const dialog = screen.getByRole('dialog', { name: 'タスクの詳細' })
    expect(within(dialog).getByRole('heading', { name: sampleTasks[0].title })).toBeVisible()
    expect(within(dialog).getByText('説明文はありません。')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: '削除' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: '編集する' })).toBeEnabled()
    const closeButtons = within(dialog).getAllByRole('button', { name: '閉じる' })
    expect(closeButtons[0]).toHaveFocus()
    await user.click(closeButtons[1])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(first).toHaveFocus()
    await user.click(screen.getByRole('button', { name: `${sampleTasks[1].title}の詳細` }))
    const next = screen.getByRole('dialog')
    expect(within(next).getByRole('heading', { name: sampleTasks[1].title })).toBeVisible()
    expect(within(next).getByText(sampleTasks[1].description!)).toBeVisible()
    expect(within(next).getByText('期限なし')).toBeVisible()
    expect(within(next).queryByText(sampleTasks[0].title)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('条件表示のクリアは検索欄を閉じたまま全件へ戻せる', async () => {
    const user = userEvent.setup()
    const fetchMock = renderApp()
    await screen.findByText(sampleTasks[0].title)
    await user.click(screen.getByText('タスクを検索'))
    await user.type(screen.getByRole('searchbox'), 'API')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('検索結果'))
    await user.click(screen.getByText('タスクを検索（条件を適用中）'))
    await user.click(within(screen.getByText(/^検索条件：/)).getByRole('button', { name: 'クリア' }))
    await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent('検索結果'))
    expect(fetchMock.mock.lastCall?.[0]).toBe('/api/tasks')
    expect(screen.getByRole('searchbox')).not.toBeVisible()
  })

  it('再取得ボタンは取得中に無効化され、同じ適用条件で再実行できる', async () => {
    const user = userEvent.setup()
    const fetchMock = renderApp()
    await screen.findByText(sampleTasks[0].title)
    await user.click(screen.getByText('タスクを検索'))
    await user.type(screen.getByRole('searchbox'), 'API')
    await user.selectOptions(screen.getByRole('combobox'), 'doing')
    await user.click(screen.getByRole('button', { name: '検索' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const reload = screen.getByRole('button', { name: '再取得' })
    await waitFor(() => expect(reload).toBeEnabled())
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    fetchMock.mockReturnValueOnce(pending)
    await user.click(reload)
    expect(reload).toBeDisabled()
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0])
    resolve(jsonResponse(sampleTasks))
    await waitFor(() => expect(reload).toBeEnabled())
  })
})
