import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { TaskBoard } from './components/TaskBoard'
import { DeleteTaskConfirm } from './components/DeleteTaskConfirm'
import { CreateTaskForm } from './components/CreateTaskForm'
import { deleteTask, fetchAppSettings } from './api/tasks'
import { useTasks } from './hooks/useTasks'
import { columns } from './types'
import type { SearchConditions, Task, TaskStatus } from './types'

const emptyConditions: SearchConditions = { q: '', status: '' }
const priorityLabels = { high: '高', medium: '中', low: '低' }

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function App() {
  const [draft, setDraft] = useState<SearchConditions>(emptyConditions)
  const [conditions, setConditions] = useState<SearchConditions>(emptyConditions)
  const [reload, setReload] = useState(0)
  const [modal, setModal] = useState<'add' | Task | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deletePending = useRef(false)
  const [deleted, setDeleted] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const reloadButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const { tasks, loading, error } = useTasks(conditions, reload)
  const filtered = Boolean(conditions.q || conditions.status)
  const statusLabel = columns.find((column) => column.status === conditions.status)?.label ?? 'すべて'
  const selectedTask = modal && modal !== 'add' ? modal : null

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaved(false)
    setConditions({ ...draft, q: draft.q.trim() })
  }

  function clear() {
    setDraft({ ...emptyConditions })
    setConditions({ ...emptyConditions })
  }

  useEffect(() => {
    if (modal === null) return
    const element = dialog.current
    if (!element) return
    if (!element.open) element.showModal()
    // 内容の描画後に開き、追加時はタイトル、詳細時は閉じるボタンへフォーカス。
    element.querySelector<HTMLElement>(deleting ? '[data-delete-cancel]' : modal === 'add' || editing ? '[name="title"]' : '.icon-button')?.focus()
  }, [modal, editing, deleting])

  function openModal(view: 'add' | Task) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditing(false)
    setDeleting(false)
    setDeleteError('')
    setDeleted(false)
    setModal(view)
  }

  function closeModal() {
    setEditing(false)
    setDeleting(false)
    setModal(null)
    if (opener.current?.isConnected) opener.current.focus()
    else reloadButton.current?.focus()
  }

  function deletedSuccessfully() {
    setSaved(false)
    setDeleted(true)
    opener.current = addButton.current
    dialog.current?.close()
    setReload((value) => value + 1)
  }

  async function requestDeletion(task: Task) {
    if (deletePending.current) return
    deletePending.current = true
    setSaving(true)
    setDeleteError('')
    try {
      const settings = await fetchAppSettings()
      if (settings.confirmDelete) setDeleting(true)
      else {
        await deleteTask(task.id)
        deletedSuccessfully()
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '削除できませんでした。')
    } finally {
      deletePending.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <a className="brand" href="/"><span className="brand-icon" aria-hidden="true">▥</span> Task Board</a>
        <span className="header-note">自分のペースで、一つずつ。</span>
      </header>
      <main>
        <section className="board-heading">
          <div><p className="eyebrow">MY WORKSPACE</p><h1>マイタスク</h1><p className="intro">やることを整理して、今日の一歩を進めよう。</p></div>
          <button type="button" ref={addButton} className="primary" onClick={() => openModal('add')}>＋ タスクを追加</button>
        </section>
        <div className="board-meta">
          <p role="status" aria-live="polite" aria-atomic="true">
            {loading ? 'タスクを読み込み中…' : error ? 'タスクを取得できませんでした' : `${filtered ? '検索結果：' : ''}${tasks.length}件のタスク · ${tasks.filter((task) => task.status === 'done').length}件完了`}
          </p>
          <p className={`fetch-status ${error ? 'fetch-failed' : ''}`}><span>{loading ? '取得中' : error ? '取得失敗' : '取得済み'}</span><button type="button" ref={reloadButton} className="reload-button" disabled={loading} onClick={() => setReload((value) => value + 1)}>再取得</button></p>
        </div>
        {filtered && <p className="active-search">検索条件：{conditions.q ? `「${conditions.q}」` : 'タイトル指定なし'} · {statusLabel}<button type="button" onClick={clear}>クリア</button></p>}
        {error && <div role="alert" className="notice">{error}<button type="button" onClick={() => setReload((value) => value + 1)}>もう一度取得</button></div>}
        {saved && <p role="status">タスクを追加しました。検索条件を解除して全件を表示しています。</p>}
        {deleted && <p role="status">タスクを削除しました。</p>}
        <TaskBoard tasks={tasks} loading={loading} error={Boolean(error)} filtered={filtered} today={localToday()} onOpen={openModal} onChanged={() => setReload((value) => value + 1)} />
        <p className="board-tip">カードをクリックして詳細を確認。各列で優先度・期限の並べ替えができます。</p>
        <details className="search-panel">
          <summary>タスクを検索{filtered ? '（条件を適用中）' : ''}</summary>
          <form onSubmit={search} aria-label="タスク検索" className="search-form">
            <label className="field search-title">タイトルを検索<input type="search" name="q" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="例：API、買い物" /></label>
            <label className="field">ステータス<select name="status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus | '' })}><option value="">すべて</option>{columns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}</select></label>
            <button type="submit" className="primary">検索</button><button type="button" onClick={clear}>クリア</button>
            <p className="search-help">タイトルの一部で検索できます。検索ボタンまたはEnterで結果を更新します。</p>
          </form>
        </details>
      </main>
      <dialog ref={dialog} aria-labelledby="dialog-title" onClose={closeModal} onCancel={(event) => { event.preventDefault(); if (!saving) { if (deleting) setDeleting(false); else if (editing) setEditing(false); else dialog.current?.close() } }}>
        <div className="modal-header"><div><p className="eyebrow">{modal === 'add' ? 'NEW TASK' : deleting ? 'DELETE TASK' : editing ? 'EDIT TASK' : 'TASK DETAILS'}</p><h2 id="dialog-title">{modal === 'add' ? 'タスクを追加' : deleting ? 'タスクを削除しますか？' : editing ? 'タスクを編集' : 'タスクの詳細'}</h2></div><button type="button" className="icon-button" aria-label="閉じる" disabled={saving} onClick={() => { if (deleting) setDeleting(false); else if (editing) setEditing(false); else dialog.current?.close() }}>×</button></div>
        <div id="dialog-content">
          {modal === 'add' && <CreateTaskForm onBusy={setSaving} onCancel={() => dialog.current?.close()} onSaved={() => {
            setSaved(true)
            setDraft({ ...emptyConditions })
            setConditions({ ...emptyConditions })
            dialog.current?.close()
          }} />}
          {selectedTask && editing && <CreateTaskForm task={selectedTask} onBusy={setSaving} onCancel={() => setEditing(false)} onSaved={(task) => {
            if (task) setModal(task)
            setEditing(false)
            setReload((value) => value + 1)
          }} />}
          {selectedTask && deleting && <DeleteTaskConfirm task={selectedTask} onBusy={setSaving} onCancel={() => setDeleting(false)} onDeleted={deletedSuccessfully} />}
          {selectedTask && !editing && !deleting && <>
            <h3 className="task-title">{selectedTask.title}</h3>
            <dl className="detail-meta"><div><dt>ステータス</dt><dd>{columns.find((column) => column.status === selectedTask.status)?.label}</dd></div><div><dt>優先度</dt><dd><span className={`priority ${selectedTask.priority}`}>{priorityLabels[selectedTask.priority]}</span></dd></div><div><dt>期限</dt><dd>{selectedTask.dueDate?.replaceAll('-', '/') ?? '期限なし'}</dd></div></dl>
            <p className="description-label">説明文</p><p className="description">{selectedTask.description || '説明文はありません。'}</p>
            {deleteError && <p className="notice" role="alert">{deleteError}</p>}
            {saving && <p role="status">削除を処理中…</p>}
            <div className="modal-actions"><button type="button" className="danger-text push-left" disabled={saving} onClick={() => void requestDeletion(selectedTask)}>削除</button><button type="button" disabled={saving} onClick={() => dialog.current?.close()}>閉じる</button><button type="button" className="primary" disabled={saving} onClick={() => setEditing(true)}>編集する</button></div>
          </>}
        </div>
      </dialog>
      <footer>Task Board</footer>
    </>
  )
}
