import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { TaskBoard } from './TaskBoard'
import { jsonResponse, sampleTasks } from '../test/fixtures'

describe('編集とドラッグ', () => {
  it('詳細から編集し、キャンセルでは内容を変えず保存後に詳細を更新する', async () => {
    const user=userEvent.setup()
    const updated={...sampleTasks[0],title:'変更後',priority:'low',dueDate:null}
    const fetchMock=vi.fn((_url:string, request?:RequestInit) => Promise.resolve(jsonResponse(request?.method==='PUT'?updated:sampleTasks)))
    vi.stubGlobal('fetch',fetchMock)
    render(<App />)
    await screen.findByText(sampleTasks[0].title)
    await user.click(screen.getByRole('button',{name:`${sampleTasks[0].title}の詳細`}))
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'編集する'}))
    let dialog=screen.getByRole('dialog',{name:'タスクを編集'})
    const title=within(dialog).getByRole('textbox',{name:'タイトル必須'})
    expect(title).toHaveFocus()
    await user.clear(title); await user.type(title,'破棄する変更')
    await user.click(within(dialog).getByRole('button',{name:'キャンセル'}))
    expect(within(screen.getByRole('dialog')).getByRole('heading',{name:sampleTasks[0].title})).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'編集する'}))
    dialog=screen.getByRole('dialog')
    const field=within(dialog).getByRole('textbox',{name:'タイトル必須'})
    await user.clear(field); await user.type(field,'変更後')
    await user.selectOptions(within(dialog).getByRole('combobox'),'low')
    await user.click(within(dialog).getByRole('button',{name:'変更を保存'}))
    await waitFor(()=>expect(screen.getByRole('dialog')).toHaveAccessibleName('タスクの詳細'))
    expect(within(screen.getByRole('dialog')).getByRole('heading',{name:'変更後'})).toBeVisible()
    expect(fetchMock.mock.calls.find((call)=>call[1]?.method==='PUT')?.[0]).toContain(sampleTasks[0].id)
  })

  it.each([true,false])('列へのドロップ成功=%sで、保存成功時だけ更新とソート解除を行う', async (success) => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(jsonResponse(success?{...sampleTasks[0],status:'doing'}:{},success?200:500)))
    const changed=vi.fn()
    render(<TaskBoard tasks={sampleTasks} loading={false} error={false} filtered={false} today="2026-11-17" onOpen={vi.fn()} onChanged={changed} />)
    fireEvent.click(screen.getByRole('button',{name:'未着手を優先度の降順に並べ替える'}))
    const card=screen.getByRole('button',{name:`${sampleTasks[0].title}の詳細`})
    const dataTransfer={setData:vi.fn(),effectAllowed:'',dropEffect:''}
    fireEvent.dragStart(card,{dataTransfer})
    fireEvent.dragOver(screen.getByRole('region',{name:'作業中'}),{dataTransfer})
    fireEvent.drop(screen.getByRole('region',{name:'作業中'}),{dataTransfer})
    if(success) {
      await waitFor(()=>expect(changed).toHaveBeenCalledOnce())
      expect(screen.getByRole('button',{name:'未着手を優先度の降順に並べ替える'})).toHaveAttribute('aria-pressed','false')
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent('保存できません')
      expect(changed).not.toHaveBeenCalled()
      expect(screen.getByRole('button',{name:'未着手を優先度の降順に並べ替える'})).toHaveAttribute('aria-pressed','true')
    }
    expect(screen.getByRole('list',{name:'未着手のタスク'})).toContainElement(card)
  })

  it('検索中はドラッグを無効にする',()=>{
    render(<TaskBoard tasks={sampleTasks} loading={false} error={false} filtered today="2026-11-17" onOpen={vi.fn()} />)
    expect(screen.getByRole('button',{name:`${sampleTasks[0].title}の詳細`})).toHaveAttribute('draggable','false')
    expect(screen.getByText('ドラッグで移動するには検索条件をクリアしてください。')).toBeVisible()
  })
})
