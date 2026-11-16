import { useEffect, useState } from 'react'
import { fetchTasks } from '../api/tasks'
import type { SearchConditions, Task } from '../types'

interface TasksState {
  tasks: Task[]
  loading: boolean
  error: string | null
}

export function useTasks(conditions: SearchConditions, reload: number) {
  const [state, setState] = useState<TasksState>({ tasks: [], loading: true, error: null })

  useEffect(() => {
    const controller = new AbortController()
    // 通信中断に応じない応答でも、前回の検索結果を画面へ反映しない。
    let active = true
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 10_000)
    // 検索条件の変更と外部APIの同期に伴う読み込み表示。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ tasks: [], loading: true, error: null })

    fetchTasks(conditions, controller.signal)
      .then((tasks) => {
        if (active) setState({ tasks, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = timedOut
          ? '応答に時間がかかっています。バックエンドの起動状態を確認して再取得してください。'
          : error instanceof TypeError
            ? '通信に失敗しました。バックエンドの起動状態を確認して再取得してください。'
            : error instanceof Error ? error.message : 'タスクを取得できませんでした。再取得してください。'
        setState({ tasks: [], loading: false, error: message })
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [conditions, reload])

  return state
}
