import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 接続先の設定は開発サーバーだけが読む。DBの認証情報は扱わない。
const apiTarget = process.env.TASK_API_TARGET ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiTarget } },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  // 既存ファイルを消さずに出力する。このリポジトリの削除禁止方針に合わせる。
  build: { emptyOutDir: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
