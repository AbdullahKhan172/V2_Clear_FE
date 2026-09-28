/**
 * Step 6 - Run & Reports.
 *
 * Kicks off the calculation, waits for it, then hands over to the dashboard.
 * Report formats are chosen here but generated AFTER the calculation, so the
 * results appear as soon as they exist rather than waiting on file generation
 * (Word alone takes ~1.6 s at 400 BOQ lines, and grows).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  getReports,
  getStatus,
  requestReports,
  startCalculation,
} from './api'
import DashboardShell from './dashboard/LazyDashboard'

interface Props {
  runId: string
  onBack: () => void
}

const REPORT_OPTIONS = [
  { kind: 'excel', label: 'Excel workbook (.xlsx)',
    hint: 'Full bill of quantities with the emission factors applied.' },
  { kind: 'word', label: 'Word report (.docx)',
    hint: 'A3 landscape summary report, ready to issue.' },
  { kind: 'boq', label: 'Quantities export (.xlsx)',
    hint: 'Extracted quantities — including anything you excluded.' },
]

export default function RunStep({ runId, onBack }: Props) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wanted, setWanted] = useState<Set<string>>(new Set())
  const [reportState, setReportState] = useState<string>('idle')
  const [showDashboard, setShowDashboard] = useState(false)
  const abort = useRef(false)

  // Reset on mount, not only set on unmount. StrictMode mounts every effect,
  // unmounts it and mounts it again, so a cleanup-only version leaves the flag
  // stuck true from the very first render — and then both polling loops below
  // skip their body and fall straight through to "Timed out".
  useEffect(() => {
    abort.current = false
    return () => { abort.current = true }
  }, [])

  const poll = useCallback(async (until: 'complete') => {
    const deadline = Date.now() + 20 * 60_000
    while (Date.now() < deadline && !abort.current) {
      const s = await getStatus(runId)
      if (s.status === 'failed') throw new ApiError(422, s.error ?? 'Failed.')
      if (s.status === until) return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new ApiError(504, 'Timed out waiting for the calculation.')
  }, [runId])

  async function run() {
    setPhase('running')
    setError(null)
    setMessage('Building the bill of quantities…')
    try {
      await startCalculation(runId, true)
      setMessage('Calculating emissions and decarbonisation scenarios…')
      await poll('complete')
      setPhase('done')

      // Reports come after the result exists, so the dashboard is reachable
      // immediately rather than gated on Word rendering its charts.
      if (wanted.size) {
        setReportState('generating')
        setMessage('Generating your reports…')
        await requestReports(runId, [...wanted])
        const deadline = Date.now() + 10 * 60_000
        while (Date.now() < deadline && !abort.current) {
          const r = await getReports(runId)
          if (r.status === 'ready' || r.status === 'failed') {
            setReportState(r.status)
            break
          }
          await new Promise((x) => setTimeout(x, 600))
        }
      }
      setMessage('')
      setShowDashboard(true)
    } catch (e) {
      setPhase('failed')
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (showDashboard) {
    return <DashboardShell runId={runId} onBack={() => setShowDashboard(false)} />
  }

  return (
    <div className="step">
      <header className="step-head">
        <h1>Run &amp; Reports</h1>
        <p>
          The interactive dashboard is always produced. Tick any extra formats
          you want, then run.
        </p>
      </header>

      <section className="panel panel-ok">
        <h2>Interactive dashboard</h2>
        <p className="hint">
          Charts, 3D model and the full methodology — opens as soon as the
          calculation finishes.
        </p>
      </section>

      <section className="panel">
        <h2>Also export</h2>
        <div className="export-list">
          {REPORT_OPTIONS.map((o) => (
            <label key={o.kind} className="export-opt">
              <input
                type="checkbox"
                checked={wanted.has(o.kind)}
                disabled={phase === 'running'}
                onChange={(e) => setWanted((s) => {
                  const n = new Set(s)
                  e.target.checked ? n.add(o.kind) : n.delete(o.kind)
                  return n
                })}
              />
              <span>
                <strong>{o.label}</strong>
                <em>{o.hint}</em>
              </span>
            </label>
          ))}
        </div>
      </section>

      {error && <div className="alert alert-bad" role="alert">{error}</div>}

      {phase === 'running' && (
        <div className="alert alert-busy" role="status">
          <span className="spinner" aria-hidden="true" />
          {message}
        </div>
      )}

      {phase === 'done' && reportState === 'failed' && (
        <div className="alert alert-warn" role="alert">
          <strong>The results are ready, but a report failed to generate.</strong>
          <p>You can still open the dashboard and try the exports again from there.</p>
        </div>
      )}

      <footer className="step-foot">
        <button type="button" className="ghost" onClick={onBack}
                disabled={phase === 'running'}>← Back</button>
        {phase === 'done' ? (
          <button type="button" className="primary"
                  onClick={() => setShowDashboard(true)}>
            Open dashboard →
          </button>
        ) : (
          <button type="button" className="primary" onClick={run}
                  disabled={phase === 'running'}>
            {phase === 'running' ? 'Running…' : 'Run calculation ▶'}
          </button>
        )}
      </footer>
    </div>
  )
}
