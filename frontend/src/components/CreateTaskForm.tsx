import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Task } from '../types'
import { normalizeTitle } from '../normalizeTitle'
import { createTask, updateTask } from '../api/tasks'

export function CreateTaskForm({ onSaved, onCancel, onBusy, task }: {
  task?: Task; onSaved: (task?: Task) => void; onCancel: () => void; onBusy: (busy: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const title = normalizeTitle(String(fields.get('title') ?? ''))
    if (!title || Array.from(title).length > 255) {
      setError('タイトルを1〜255文字で入力してください。空白のみでは登録できません。')
      form.querySelector<HTMLInputElement>('[name="title"]')?.focus()
      return
    }
    pending.current = true
    setSaving(true)
    onBusy(true)
    setError('')
    try {
      const input = { title, description: String(fields.get('description') ?? '') || null,
        priority: String(fields.get('priority')) as 'high' | 'medium' | 'low', dueDate: String(fields.get('dueDate') ?? '') || null }
      const result = task ? await updateTask(task.id, input) : await createTask(input)
      onBusy(false)
      onSaved(result || undefined)
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存に失敗しました。')
    } finally {
      pending.current = false
      setSaving(false)
      onBusy(false)
    }
  }

  return <form onSubmit={submit} aria-label={task ? "タスク編集" : "タスク追加"} aria-busy={saving}>
    {error && <p role="alert" className="form-error">{error}</p>}
    <fieldset disabled={saving} className="border-0 m-0 p-0 min-w-0">
      <label className="field">タイトル<span className="required">必須</span><input defaultValue={task?.title} name="title" placeholder="例：画面のデザインを確認する" aria-required="true" /></label>
      <label className="field">説明文<span className="optional">任意</span><textarea defaultValue={task?.description ?? ""} name="description" placeholder="詳しい内容やメモを入力" /></label>
      <div className="field-row"><label className="field">優先度<select name="priority" defaultValue={task?.priority ?? "medium"}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label className="field">期限<span className="optional">任意</span><input defaultValue={task?.dueDate ?? ""} name="dueDate" type="date" /></label></div>
      <div className="modal-actions"><button type="button" onClick={onCancel}>キャンセル</button><button type="submit" className="primary">{saving ? '保存中…' : task ? '変更を保存' : 'タスクを追加'}</button></div>
    </fieldset>
  </form>
}
