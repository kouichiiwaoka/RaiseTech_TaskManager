import { describe, expect, it, vi } from 'vitest'
import { fetchTasks } from './tasks'
import { jsonResponse, sampleTasks } from '../test/fixtures'

const signal = () => new AbortController().signal

describe('タスクAPI接続', () => {
  it('全件取得では空のパラメーターを付けない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleTasks))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchTasks({ q: '   ', status: '' }, signal())).toEqual(sampleTasks)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks')
  })

  it.each(['日本語の検索', 'API 100%_&+?#'])('検索語「%s」を壊さずエンコードし、条件を組み合わせる', async (q) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const abortSignal = signal()
    await fetchTasks({ q: ` ${q} `, status: 'doing' }, abortSignal)
    const url = new URL(fetchMock.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('q')).toBe(q)
    expect(url.searchParams.get('status')).toBe('doing')
    expect(fetchMock.mock.calls[0][1].signal).toBe(abortSignal)
  })

  it.each([400, 500, 503])('HTTP %iを成功扱いしない', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, status)))
    await expect(fetchTasks({ q: '', status: '' }, signal())).rejects.toThrow(status === 400 ? '検索条件' : '取得できません')
  })

  it('JSON以外の応答を日本語のエラーとして扱う', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>')))
    await expect(fetchTasks({ q: '', status: '' }, signal())).rejects.toThrow('データを読み取れません')
  })

  it.each([{}, [{ ...sampleTasks[0], status: 'unknown' }], [{ ...sampleTasks[0], dueDate: 123 }]])('不正なレスポンスを画面に渡さない', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(data)))
    await expect(fetchTasks({ q: '', status: '' }, signal())).rejects.toThrow('データの形式')
  })
})
