import { describe, expect, it, vi } from 'vitest'
import { deleteTask, fetchAppSettings } from './tasks'

describe('タスク削除API接続', () => {
  it('DELETEで送信し、204の空本文をJSONとして読まない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteTask('task-id')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-id', expect.objectContaining({ method: 'DELETE', signal: expect.any(AbortSignal) }))
  })
  it.each([404, 500, 200])('HTTP %iは成功扱いしない', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    await expect(deleteTask('task-id')).rejects.toThrow(status === 404 ? '見つかりません' : status === 500 ? '削除できません' : '結果を確認できません')
  })
  it.each([new TypeError('offline'), new DOMException('timeout', 'TimeoutError')])('通信結果不明時は再取得を案内する', async (error) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    await expect(deleteTask('task-id')).rejects.toThrow('再取得')
  })
})

describe('削除確認設定API接続', () => {
  it.each([true, false])('設定boolean=%sを取得する', async (confirmDelete) => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ confirmDelete })))
    vi.stubGlobal('fetch', mock)
    expect(await fetchAppSettings()).toEqual({ confirmDelete })
    expect(mock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })
  it.each([null, {}, { confirmDelete: 'false' }, [], { confirmDelete: null }])('不正な設定で削除を進めない', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))))
    await expect(fetchAppSettings()).rejects.toThrow('タスクは削除していません')
  })
  it.each([new Response('bad json'), new Response(null, { status: 500 })])('読めない設定では再試行を案内する', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(fetchAppSettings()).rejects.toThrow('再試行')
  })
  it('通信エラーを成功扱いしない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(fetchAppSettings()).rejects.toThrow('タスクは削除していません')
  })
  it('チェック時だけ削除と設定保存を一つのリクエストで送る', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mock)
    await deleteTask('task-id', true)
    expect(mock).toHaveBeenCalledWith('/api/tasks/task-id?skipConfirmation=true', expect.objectContaining({ method: 'DELETE' }))
  })
})
