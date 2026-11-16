import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="*" element={<main className="mx-auto max-w-3xl p-12"><h1 className="text-2xl font-bold">ページが見つかりません</h1><a className="mt-4 inline-block underline" href="/">ボードに戻る</a></main>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
