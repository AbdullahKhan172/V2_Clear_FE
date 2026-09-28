/**
 * Your projects — every run this browser owns.
 *
 * Ownership today is the browser's own client id, held in localStorage and sent
 * on every request. When sign-in lands the id becomes the user's, and the runs
 * listed here are exactly the ones their first login claims — so this screen
 * does not change shape, it just starts following the person instead of the
 * browser.
 *
 * A row shows where the run was left, so "Resume" is a promise about what you
 * will see rather than a guess.
 */

import { useCallback, useEffect, useState } from 'react'
import { ApiError, deleteRun, listRuns, type RunListing } from './api'

const LAST_STEP = 6

const STATUS_LABEL: Record<string, string> = {
  created: 'Uploading',
  parsing: 'Reading the file',
  parsed: 'Ready to configure',
  calculating: 'Calculating',
  complete: 'Calculated',
  failed: 'Failed',
}

function when(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
  return d.toLocaleDateString()
}

interface Props {
  onOpen: (runId: string, step: number) => void
  /** A calculated run opens its results, not the last wizard step. */
  onOpenDashboard: (runId: string) => void
  onNew: () => void
  onClose: () => void
}

export default function ProjectsScreen(
  { onOpen, onOpenDashboard, onNew, onClose }: Props,
) {
  const [runs, setRuns] = useState<RunListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Deleting is irreversible and takes the uploaded file with it, so it asks
  // once rather than relying on the row being small and hard to hit.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    listRuns()
      .then(setRuns)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)))
  }, [])

  useEffect(load, [load])

  async function remove(runId: string) {
    setBusy(runId)
    try {
      await deleteRun(runId)
      setRuns((rs) => (rs ?? []).filter((r) => r.run_id !== runId))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(null); setConfirming(null)
    }
  }

  return (
    <div className="projects">
      <header className="projects-head">
        <div>
          <h1>Your projects</h1>
          <p>
            Everything assessed in this browser. Assessments are kept on the
            server, so reopening one restores exactly where you left off.
          </p>
        </div>
        <div className="projects-actions">
          <button type="button" className="ghost" onClick={onClose}>← Back</button>
          <button type="button" className="primary" onClick={onNew}>
            New assessment
          </button>
        </div>
      </header>

      {error && <div className="alert alert-bad" role="alert">{error}</div>}

      {!runs && !error && <p className="chart-empty">Loading your projects…</p>}

      {runs && runs.length === 0 && (
        <div className="panel">
          <h2>Nothing here yet</h2>
          <p className="hint">
            Upload an IFC model or a bill of quantities and it will appear here,
            with its progress saved as you go.
          </p>
          <button type="button" className="primary" onClick={onNew}>
            Start your first assessment
          </button>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="table-scroll">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>File</th>
                <th>Status</th>
                <th className="num">kgCO₂e/m²</th>
                <th>Rating</th>
                <th>Last opened</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id}>
                  <td>
                    <strong>{r.name}</strong>
                    <span className="sub">
                      Reached step {r.max_step} of {LAST_STEP}
                      {r.area ? ` · ${Number(r.area).toLocaleString()} m²` : ''}
                    </span>
                  </td>
                  <td className="cell-wide">{r.filename}</td>
                  <td>
                    <span className={`pill ${r.status === 'failed' ? 'pill-out'
                      : r.status === 'complete' ? 'pill-in' : ''}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="num">{r.per_sqm ?? <em className="na">—</em>}</td>
                  <td>{r.rating ?? <em className="na">—</em>}</td>
                  <td>{when(r.updated_at ?? r.created_at)}</td>
                  <td className="row-actions">
                    {confirming === r.run_id ? (
                      <>
                        <button type="button" className="danger"
                                disabled={busy === r.run_id}
                                onClick={() => remove(r.run_id)}>
                          {busy === r.run_id ? 'Deleting…' : 'Delete for good'}
                        </button>
                        <button type="button" className="ghost"
                                onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="primary"
                                disabled={r.status === 'failed'}
                                onClick={() => (r.status === 'complete'
                                  ? onOpenDashboard(r.run_id)
                                  : onOpen(r.run_id, r.max_step))}>
                          {r.status === 'complete' ? 'Open results' : 'Resume'}
                        </button>
                        {/* A finished run can still be reopened for editing -
                            changing a grade and recalculating is the commonest
                            reason to come back to one. */}
                        {r.status === 'complete' && (
                          <button type="button" className="ghost"
                                  onClick={() => onOpen(r.run_id, r.max_step)}>
                            Edit
                          </button>
                        )}
                        <button type="button" className="ghost"
                                onClick={() => setConfirming(r.run_id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
