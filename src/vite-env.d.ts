/// <reference types="vite/client" />

/**
 * Build-time configuration.
 *
 * Vite INLINES these at build time — they are not read at runtime. Changing one
 * means rebuilding and redeploying the frontend; restarting it does nothing.
 * That surprises people, so it is worth knowing before the first deploy.
 */
interface ImportMetaEnv {
  /**
   * Where the API lives, e.g. `https://clear-api.up.railway.app`.
   *
   * Left unset in development, where every request is a relative `/api/…` path
   * and the Vite dev server proxies it to the backend — one origin, no CORS.
   * Set it when the frontend and backend are deployed to different domains,
   * which is exactly what Vercel + Railway is.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
