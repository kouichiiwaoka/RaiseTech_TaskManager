import { useRef, useState } from 'react'
import { deleteTask } from '../api/tasks'
import type { Task } from '../types'

export function DeleteTaskConfirm({ task, onBusy, onCancel, onDeleted }: {
  task: Task; onBusy: (busy: boolean) => void; onCancel: () => void; onDeleted: () => void
}) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [skipConfirmation, setSkipConfirmation] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      await deleteTask(task.id, skipConfirmation)
      onDeleted()
    } catch (error) {
      setError(error instanceof Error ? error.message : '削除できませんでした。')
    } finally {
      pending.current = false
      setBusy(false)
      onBusy(false)
    }
  }

  return <div aria-busy={busy}>
    <p>以下のタスクを削除します。</p>
    <p className="delete-target">{task.title}</p>
    <p className="delete-note">削除したタスクは元に戻せません。</p>
    <label className="check-row"><input type="checkbox" checked={skipConfirmation} disabled={busy} onChange={(event) => setSkipConfirmation(event.target.checked)} />今後この確認を表示しない</label>
    {error && <p role="alert" className="notice">{error}</p>}
    {busy && <p role="status">削除中…</p>}
    <div className="modal-actions">
      <button type="button" data-delete-cancel disabled={busy} onClick={onCancel}>キャンセル</button>
      <button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>削除する</button>
    </div>
  </div>
}
