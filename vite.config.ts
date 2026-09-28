import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Proxy /api to the FastAPI backend so the browser sees one origin. Keeps CORS
 * out of the picture locally and mirrors how a reverse proxy will front both
 * services in deployment.
 *
 * The target comes from CLEAR_API, resolved in this order:
 *
 *   1. a real environment variable   — one-off, this terminal only
 *   2. .env.local / .env in this folder — set once, survives every restart
 *   3. http://127.0.0.1:8000         — the default
 *
 * (2) exists because (1) is easy to get wrong: the variable has to be set in
 * the SAME shell, BEFORE `npm run dev`, and a proxy pointed at a stale backend
 * fails as a confusing 404 rather than a connection error. Put the line in
 * `.env.local` once and the question never comes up again:
 *
 *     CLEAR_API=http://127.0.0.1:8001
 */
export default defineConfig(({ mode }) => {
  // '' as the prefix loads every key, not just VITE_* - this one is read here
  // in the config and never shipped to the browser.
  const fromFile = loadEnv(mode, process.cwd(), '')
  const API = process.env.CLEAR_API || fromFile.CLEAR_API || 'http://127.0.0.1:8000'

  // Printed on startup so a mismatched port is obvious immediately, instead of
  // being discovered later as a 404 in the network tab.
  console.log(`  ➜  API proxy:   ${API}`)

  const proxy = { '/api': { target: API, changeOrigin: true } }

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    // `vite preview` serves the production build; the browser tests drive it,
    // so it needs the same proxy rather than only the dev server having one.
    preview: { port: 4173, proxy },
  }
})
