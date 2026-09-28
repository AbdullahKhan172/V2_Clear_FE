/**
 * Wizard shell, and the thing that decides what you are looking at.
 *
 * WHERE STATE LIVES — four layers, each with one job:
 *
 *   URL          `?run=X&step=3`   what you are looking at NOW. Refresh-safe,
 *                                  shareable, and browser back/forward work
 *                                  because every step pushes a history entry.
 *   server       run.config.wizard the furthest step reached. Survives a new
 *                                  device, which a URL cannot.
 *   server       run.config.*      the step data itself — selection, materials,
 *                                  transport. Each step already loads and saves
 *                                  its own; none of it lives up here.
 *   localStorage last run + client the answer to "what was I doing?" on a bare
 *                                  visit, and this browser's identity.
 *
 * The consequence worth stating: this component holds almost no data. It holds
 * a POINTER (which run, which step) and rehydrates everything else from the
 * server. That is why a refresh loses nothing — the data was never here.
 *
 * `step` and `maxStep` are deliberately separate. maxStep is what the rail
 * enables and only ever grows; when a single value did both jobs, walking back
 * to Step 2 re-locked Steps 3-6 and stranded the user.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import UploadStep, { type ProjectDetails } from './UploadStep'
import ChooseElementsStep from './ChooseElementsStep'
import MaterialsStep from './MaterialsStep'
import TransportStep from './TransportStep'
import DataCheckStep from './DataCheckStep'
import RunStep from './RunStep'
import DashboardShell from './dashboard/LazyDashboard'
import ProjectsScreen from './ProjectsScreen'
import {
  getElements, getProgress, getStatus, lastRun, listRuns, rememberRun,
  saveProgress, type ExtractionResponse, type RunListing,
} from './api'

const STEPS = [
  { n: 1, name: 'Project & Upload', hint: 'Project details and your file' },
  { n: 2, name: 'Choose Elements', hint: 'Keep or remove what counts' },
  { n: 3, name: 'Materials', hint: 'Grades and reinforcement' },
  { n: 4, name: 'Transport & Waste', hint: 'Distances and waste' },
  { n: 5, name: 'Data Check', hint: 'Review emission factors' },
  { n: 6, name: 'Run & Reports', hint: 'Calculate and export' },
]
const LAST_STEP = STEPS.length

/** hydrating → reading the URL and the server. Everything else is a view. */
type Phase = 'hydrating' | 'wizard' | 'dashboard' | 'projects' | 'parsing' | 'gone'

interface UrlState { run: string | null; step: number | null }

function readUrl(): UrlState {
  try {
    const q = new URLSearchParams(window.location.search)
    const run = q.get('run')
    const raw = q.get('step')
    const step = raw === null ? null : Number(raw)
    return { run, step: Number.isFinite(step) ? step : null }
  } catch {
    return { run: null, step: null }
  }
}

/** `?run=X&step=N` is the wizard; bare `?run=X` stays the dashboard, because
 *  links shared before this existed mean exactly that and must keep working. */
function writeUrl(run: string | null, step: number | null, replace = false) {
  const q = new URLSearchParams()
  if (run) q.set('run', run)
  if (run && step !== null) q.set('step', String(step))
  const url = q.toString()
    ? `${window.location.pathname}?${q}` : window.location.pathname
  if (replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
}

const clampStep = (n: number) => Math.max(1, Math.min(LAST_STEP, Math.round(n)))

/** The run's stored project details, back in the shape the Step-1 form uses. */
function toProjectDetails(p: ExtractionResponse['project']): ProjectDetails {
  return {
    name: String(p?.name ?? ''),
    area: p?.area === null || p?.area === undefined ? '' : String(p.area),
    stage: String(p?.stage ?? ''),
    system: String(p?.structural_system ?? ''),
    location: String(p?.location ?? ''),
    client: String(p?.client ?? ''),
    projectType: '',
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('hydrating')
  const [runId, setRunId] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)
  const [project, setProject] = useState<ProjectDetails | null>(null)
  // What a resumed run already has on the server. Step 1 needs it because a
  // File cannot be put back into a file input, so without it revisiting Step 1
  // shows an empty drop zone for a run that is already parsed.
  const [existing, setExisting] =
    useState<{ filename: string; nElements: number } | null>(null)
  const [resumeOffer, setResumeOffer] = useState<RunListing | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hydration is async and can be re-entered by a popstate before the previous
  // one finishes. Only the newest attempt is allowed to apply its result.
  const generation = useRef(0)
  // Mirrors maxStep so navigate() can compare without a stale closure.
  const maxStepRef = useRef(1)

  const hydrate = useCallback(async () => {
    const mine = ++generation.current
    const fresh = () => mine === generation.current
    const { run, step: urlStep } = readUrl()

    // ── No run in the URL: a clean start, with an offer to resume ──────
    if (!run) {
      setRunId(null); setProject(null); setExisting(null)
      setStep(1); setMaxStep(1); maxStepRef.current = 1
      setError(null)
      setPhase('wizard')
      const last = lastRun()
      if (!last) { setResumeOffer(null); return }
      try {
        const runs = await listRuns()
        if (!fresh()) return
        const hit = runs.find((r) => r.run_id === last)
        // Only offer a run there is something to go back TO. A finished run is
        // reachable from "your projects" instead.
        setResumeOffer(hit && hit.status !== 'failed' ? hit : null)
        if (!hit) rememberRun(null)
      } catch { /* offline or empty - the upload step still works */ }
      return
    }

    // ── Bare ?run=X keeps its old meaning: open the dashboard ──────────
    if (urlStep === null) {
      setRunId(run); setPhase('dashboard'); rememberRun(run)
      return
    }

    // ── Resume the wizard ─────────────────────────────────────────────
    setPhase('hydrating'); setError(null); setRunId(run); rememberRun(run)
    try {
      // Progress first, and separately: it resolves in EVERY lifecycle state,
      // including while the file is still parsing, so the rail is right even
      // when the elements are not available yet.
      const progress = await getProgress(run)
      if (!fresh()) return
      setMaxStep(progress.max_step)
      maxStepRef.current = progress.max_step

      const status = await getStatus(run)
      if (!fresh()) return

      if (status.status === 'failed') {
        setError(status.error ?? 'This file could not be processed.')
        setPhase('gone')
        return
      }
      if (status.status === 'created' || status.status === 'parsing') {
        // Refreshed mid-parse. Wait it out here rather than in the upload step,
        // which is not on screen — an IFC takes minutes, and that is exactly
        // when someone reloads.
        setPhase('parsing')
        return
      }

      const result = await getElements(run)
      if (!fresh()) return
      setProject(toProjectDetails(result.project))
      setExisting({ filename: result.filename,
                    nElements: result.n_elements ?? 0 })
      setStep(clampStep(Math.min(urlStep, progress.max_step)))
      setPhase('wizard')
    } catch (e) {
      if (!fresh()) return
      // 404: the run was evicted, deleted, or belongs to another browser.
      setError(e instanceof Error ? e.message : String(e))
      setPhase('gone')
      rememberRun(null)
    }
  }, [])

  useEffect(() => {
    void hydrate()
    // The browser's own back and forward buttons drive the wizard, which is
    // what "going back a step" means to everyone who is not a developer.
    const onPop = () => { void hydrate() }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [hydrate])

  // While a resumed run is still parsing, poll until it is ready, then
  // re-hydrate through the normal path.
  useEffect(() => {
    if (phase !== 'parsing' || !runId) return
    let stop = false
    const tick = async () => {
      while (!stop) {
        try {
          const s = await getStatus(runId)
          if (stop) return
          if (s.status === 'failed') {
            setError(s.error ?? 'This file could not be processed.')
            setPhase('gone'); return
          }
          if (s.status !== 'created' && s.status !== 'parsing') {
            void hydrate(); return
          }
        } catch {
          if (!stop) { setPhase('gone'); setError('Lost contact with the server.') }
          return
        }
        await new Promise((r) => setTimeout(r, 700))
      }
    }
    void tick()
    return () => { stop = true }
  }, [phase, runId, hydrate])

  /** Move to a step: update the view, push history, and — only when this is
   *  new ground — tell the server.
   *
   *  The current step is NOT sent. It is already in the URL, which survives a
   *  refresh and drives browser back/forward, and the only other way back into
   *  a run resumes to the furthest step anyway. Sending it meant a request on
   *  every Back and every click in the rail, to store a number nothing read.
   *
   *  So the write happens at most five times in a run's life: once per step
   *  opened for the first time. */
  const navigate = useCallback((n: number, replace = false) => {
    const target = clampStep(n)
    setStep(target)
    if (!runId) return
    writeUrl(runId, target, replace)

    // Compared against a ref, not the state value: several navigations can be
    // queued before React re-renders, and a stale closure here would re-send a
    // step already recorded.
    if (target <= maxStepRef.current) return
    maxStepRef.current = target
    setMaxStep(target)
    // Fire and forget: the mark is a convenience, and a failed save must not
    // block navigation the user has already made.
    saveProgress(runId, target)
      .then((p) => { maxStepRef.current = p.max_step; setMaxStep(p.max_step) })
      .catch(() => { /* offline - the URL still holds the step */ })
  }, [runId])

  function handleExtracted(result: ExtractionResponse, details: ProjectDetails) {
    setProject(details)
    setExisting({ filename: result.filename, nElements: result.n_elements ?? 0 })
    setRunId(result.run_id)
    setResumeOffer(null)
    rememberRun(result.run_id)
    setStep(2); setMaxStep(2); maxStepRef.current = 2
    writeUrl(result.run_id, 2)
    saveProgress(result.run_id, 2).catch(() => {})
  }

  function openRun(id: string, atStep: number) {
    rememberRun(id)
    writeUrl(id, clampStep(atStep))
    void hydrate()
  }

  /** A finished run opens its dashboard: bare ?run=X, the same URL that has
   *  always meant "the results". */
  function openDashboard(id: string) {
    rememberRun(id)
    writeUrl(id, null)
    void hydrate()
  }

  function startFresh() {
    rememberRun(null)
    setExisting(null)
    writeUrl(null, null)
    void hydrate()
  }

  // GIA is captured as text in the form; Step 4 needs it as a number for the
  // A5a preview (factor x floor area).
  const area = project?.area ? Number(project.area) : null

  /* ── Whole-screen phases ─────────────────────────────────────────── */

  if (phase === 'hydrating') {
    return (
      <div className="boot" role="status">
        <span className="spinner" aria-hidden="true" />
        Restoring your session…
      </div>
    )
  }

  if (phase === 'dashboard' && runId) {
    return <DashboardShell runId={runId} onBack={startFresh} />
  }

  if (phase === 'projects') {
    return (
      <ProjectsScreen
        onOpen={openRun}
        onOpenDashboard={openDashboard}
        onNew={startFresh}
        onClose={() => setPhase(runId ? 'wizard' : 'wizard')}
      />
    )
  }

  if (phase === 'parsing') {
    return (
      <div className="boot" role="status">
        <span className="spinner" aria-hidden="true" />
        <div>
          <strong>Still reading your file…</strong>
          <p>
            A large IFC model takes a few minutes. This page is safe to leave
            open, and safe to reload — the work carries on either way.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'gone') {
    return (
      <div className="boot boot-bad" role="alert">
        <div>
          <strong>That project is no longer available.</strong>
          <p>{error ?? 'It may have been deleted, or it belongs to another browser.'}</p>
          <button type="button" className="primary" onClick={startFresh}>
            Start a new assessment
          </button>
        </div>
      </div>
    )
  }

  /* ── The wizard ──────────────────────────────────────────────────── */

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>C.L.E.A.R.</strong>
            <small>Embodied carbon</small>
          </div>
        </div>

        <nav className="steps">
          {STEPS.map((s) => (
            <button
              key={s.n}
              type="button"
              className={
                'side-step' +
                (s.n === step ? ' active' : '') +
                (s.n < step ? ' done' : '')
              }
              // Enabled up to the FURTHEST step reached, not the current one.
              // Anything further ahead cannot be skipped into, since each step
              // depends on the one before it.
              disabled={!runId ? s.n > 1 : s.n > maxStep}
              onClick={() => navigate(s.n)}
            >
              <span className="step-num">{s.n < step ? '✓' : s.n}</span>
              <span className="step-txt">
                <strong>{s.name}</strong>
                <small>{s.hint}</small>
              </span>
            </button>
          ))}
        </nav>

        <button type="button" className="side-link"
                onClick={() => setPhase('projects')}>
          ☰ Your projects
        </button>
      </aside>

      <main className="main">
        {/* Offered, never automatic: someone who came to start a new
            assessment should not be dropped back into an old one. */}
        {resumeOffer && step === 1 && !runId && (
          <div className="resume-bar" role="status">
            <div>
              <strong>Continue “{resumeOffer.name}”?</strong>
              <span>
                {resumeOffer.filename} · reached step {resumeOffer.max_step}{' '}
                of {LAST_STEP}
                {resumeOffer.status === 'complete' && ' · calculated'}
              </span>
            </div>
            <div className="resume-actions">
              <button type="button" className="ghost"
                      onClick={() => { setResumeOffer(null); rememberRun(null) }}>
                Dismiss
              </button>
              <button type="button" className="primary"
                      onClick={() => openRun(resumeOffer.run_id,
                                             resumeOffer.max_step)}>
                Resume →
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <UploadStep onExtracted={handleExtracted} initial={project}
                      existing={runId ? existing : null}
                      onContinue={() => navigate(2)} />
        )}

        {step === 2 && runId && (
          <ChooseElementsStep
            runId={runId}
            onBack={() => navigate(1)}
            onContinue={() => navigate(3)}
          />
        )}

        {step === 3 && runId && (
          <MaterialsStep
            runId={runId}
            onBack={() => navigate(2)}
            onContinue={() => navigate(4)}
          />
        )}

        {step === 4 && runId && (
          <TransportStep
            runId={runId}
            area={area}
            onBack={() => navigate(3)}
            onContinue={() => navigate(5)}
          />
        )}

        {step === 5 && runId && (
          <DataCheckStep
            runId={runId}
            onBack={() => navigate(4)}
            onContinue={() => navigate(6)}
          />
        )}

        {step === 6 && runId && (
          <RunStep runId={runId} onBack={() => navigate(5)} />
        )}
      </main>
    </div>
  )
}

export { LAST_STEP }
