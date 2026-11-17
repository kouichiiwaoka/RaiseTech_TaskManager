import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskBoard } from './TaskBoard'
import { jsonResponse, sampleTasks } from '../test/fixtures'

const tasks = [sampleTasks[0], { ...sampleTasks[1], status: 'todo' as const }, sampleTasks[2]]
function setup(options = {}) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleTasks[0]))
  vi.stubGlobal('fetch', fetchMock)
  render(<TaskBoard tasks={tasks} loading={false} error={false} filtered={false} today="2026-11-17" onOpen={vi.fn()} {...options} />)
  const cards = tasks.map((task) => screen.queryByRole('button', { name: `${task.title}の詳細` })!)
  cards.forEach((card, index) => card && vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ top: index === 1 ? 220 : 100, height: 100 } as DOMRect))
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  const drag = (target: Element, y = 100) => {
    // jsdom has no DragEvent; provide the browser's pointer coordinate explicitly.
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    Object.assign(event, { clientY: y, dataTransfer })
    fireEvent(target, event)
  }
  const drop = (target: Element, y: number) => {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.assign(event, { clientY: y, dataTransfer })
    fireEvent(target, event)
  }
  return { cards, dataTransfer, drag, drop, fetchMock }
}
const markers = () => document.querySelectorAll('.insertion-before,.insertion-after,.drop-empty')

describe('ドラッグの挿入位置', () => {
  it.each([
    ['列内先頭', 1, 0, 110, 'before', tasks[0].id, 'todo'],
    ['列内末尾', 0, 1, 300, 'after', null, 'todo'],
    ['列間先頭', 2, 0, 110, 'before', tasks[0].id, 'todo'],
    ['列間途中', 2, 1, 230, 'before', tasks[1].id, 'todo'],
    ['カード下半分', 2, 0, 190, 'before', tasks[1].id, 'todo'],
    ['列間末尾', 0, 2, 190, 'after', null, 'done'],
  ] as const)('%sのラインと保存先が一致する', async (_name, from, to, y, position, beforeId, status) => {
    const { cards, dataTransfer, drag, drop, fetchMock } = setup()
    fireEvent.dragStart(cards[from], { dataTransfer })
    drag(cards[to], y)
    expect(markers()).toHaveLength(1)
    expect(document.querySelector(`.insertion-${position}`)).toBeTruthy()
    if (beforeId) expect(document.querySelector('.insertion-before')).toHaveAttribute('data-task-id', beforeId)
    drop(cards[to], y)
    expect(markers()).toHaveLength(0)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status, beforeId })
    await screen.findByRole('region', { name: '未着手' })
  })

  it('カード間の余白でも途中に表示する', () => {
    const { cards, dataTransfer, drag } = setup()
    fireEvent.dragStart(cards[2], { dataTransfer })
    drag(screen.getByRole('list', { name: '未着手のタスク' }), 210)
    expect(cards[1]).toHaveClass('insertion-before')
  })

  it('空列にラインを表示して末尾指定で保存する', async () => {
    const { cards, dataTransfer, drag, drop, fetchMock } = setup()
    const column = screen.getByRole('region', { name: '作業中' })
    fireEvent.dragStart(cards[0], { dataTransfer })
    drag(column)
    expect(column).toHaveClass('drop-empty')
    drop(column, 100)
    expect(markers()).toHaveLength(0)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'doing', beforeId: null })
  })

  it('外部ドラッグ・自己ドロップは表示と通信を行わず、中断と列外移動で消去する', () => {
    const { cards, dataTransfer, drag, drop, fetchMock } = setup()
    drag(cards[1]); expect(markers()).toHaveLength(0)
    fireEvent.dragStart(cards[0], { dataTransfer })
    drag(cards[1], 230); expect(markers()).toHaveLength(1)
    fireEvent.dragLeave(screen.getByRole('region', { name: '未着手' }), { relatedTarget: document.body })
    expect(markers()).toHaveLength(0)
    drag(cards[1], 230)
    fireEvent.dragEnd(cards[0]); expect(markers()).toHaveLength(0)
    fireEvent.dragStart(cards[0], { dataTransfer })
    drag(cards[0]); drop(cards[0], 100)
    expect(markers()).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('保存中はラインを消し、再ドラッグでも二重送信しない', async () => {
    const { cards, dataTransfer, drag, drop, fetchMock } = setup()
    let finish!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve }))
    fireEvent.dragStart(cards[0], { dataTransfer })
    drag(cards[1], 230)
    drop(cards[1], 230)
    expect(markers()).toHaveLength(0)
    expect(cards[0]).toHaveAttribute('draggable', 'false')
    fireEvent.dragStart(cards[0], { dataTransfer })
    drag(cards[2], 110); drop(cards[2], 110)
    expect(markers()).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    finish(jsonResponse(sampleTasks[0], 500))
    await screen.findByRole('alert')
    expect(markers()).toHaveLength(0)
    expect(cards[0]).toHaveAttribute('draggable', 'true')
  })

  it('単独カードの元列余白は移動しない', () => {
    const { cards, dataTransfer, drag, drop, fetchMock } = setup()
    const column = screen.getByRole('region', { name: '完了' })
    fireEvent.dragStart(cards[2], { dataTransfer })
    drag(column, 300); drop(column, 300)
    expect(markers()).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([{ filtered: true }, { loading: true }, { error: true }])('無効状態%sでラインや移動を発生させない', (options) => {
    const { dataTransfer, drag, fetchMock } = setup(options)
    const column = screen.getByRole('region', { name: '作業中' })
    drag(column)
    fireEvent.drop(column, { dataTransfer })
    expect(markers()).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
