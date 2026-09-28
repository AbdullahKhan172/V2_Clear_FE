/**
 * Step 1 - Project & Upload.
 *
 * Project metadata plus the file drop zone. One drop zone for every supported
 * type: the backend auto-detects IFC vs ready BOQ vs Revit takeoff vs unknown
 * spreadsheet, so the user never has to know which their file is.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  uploadFile,
  waitForExtraction,
  type ExtractionResponse,
  type RunStatus,
} from './api'

const ACCEPT = '.ifc,.csv,.xlsx,.xls'
const STAGES = ['Concept / Schematic Design', 'Detailed Design', 'Tender']
const SYSTEMS = [
  'RC Flat Slab', 'PT Flat Slab', 'PT Slab with Caps',
  'Steel + Hollowcore', 'In-Situ + Hollowcore',
  'RC Frame', 'Steel Frame', 'Hybrid', 'Other',
]

export interface ProjectDetails {
  name: string
  area: string
  stage: string
  system: string
  location: string
  client: string
  projectType: string
}

const EMPTY_PROJECT: ProjectDetails = {
  name: '', area: '', stage: STAGES[0], system: SYSTEMS[0],
  location: '', client: '', projectType: '',
}

interface Props {
  onExtracted: (result: ExtractionResponse, project: ProjectDetails) => void
  /** Details restored from a resumed run, so walking back to Step 1 shows what
   *  was entered rather than an empty form. Blank fields still fall back to
   *  the defaults - a resumed run that never set a stage should not show one. */
  initial?: ProjectDetails | null
  /** The file this run ALREADY processed, when Step 1 is being revisited.
   *
   *  A File cannot be restored into an <input type=file> - the browser will not
   *  allow it - so without this, coming back to Step 1 on an existing run shows
   *  an empty drop zone and a disabled button: a dead end with the work sitting
   *  right there on the server. */
  existing?: { filename: string; nElements: number } | null
  /** Continue without re-uploading. Absent for a new assessment. */
  onContinue?: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export default function UploadStep({ onExtracted, initial, existing,
                                    onContinue }: Props) {
  const [project, setProject] = useState<ProjectDetails>(() => ({
    ...EMPTY_PROJECT,
    // Only overwrite what the resumed run actually carries; an empty string
    // from the server must not blank out a sensible default.
    ...Object.fromEntries(
      Object.entries(initial ?? {}).filter(([, v]) => v !== '' && v != null)),
  }))
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<RunStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractionResponse | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [geminiKey, setGeminiKey] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const set = <K extends keyof ProjectDetails>(k: K, v: ProjectDetails[K]) =>
    setProject((p) => ({ ...p, [k]: v }))

  // GIA is required by the engine: without it the per-m2 intensity collapses to
  // zero and the SCORS rating would falsely read A++. Validate before upload so
  // the user is not told this only after a long parse.
  const areaNum = Number(project.area)
  const areaValid = project.area.trim() !== '' && areaNum > 0
  const canSubmit = useMemo(
    () => !!file && project.name.trim() !== '' && areaValid && !busy,
    [file, project.name, areaValid, busy],
  )

  const chooseFile = useCallback((f: File | null) => {
    if (!f) return
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPT.split(',').includes(ext)) {
      setError(`"${ext}" is not a supported file type. Use IFC, CSV or Excel.`)
      return
    }
    setError(null)
    setResult(null)
    setStatus(null)
    setFile(f)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || busy) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setBusy(true)
    setError(null)
    setResult(null)
    setStatus('parsing')

    try {
      const up = await uploadFile(file, {
        geminiApiKey: geminiKey.trim() || undefined,
        project: {
          project_name: project.name,
          area: project.area,
          stage: project.stage,
          structural_system: project.system,
          location: project.location,
          client: project.client,
        },
      })
      const extraction = await waitForExtraction(up.run_id, {
        onStatus: (s) => setStatus(s.status),
        signal: controller.signal,
      })
      setResult(extraction)
      setStatus('parsed')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof ApiError ? err.message : String(err))
      setStatus('failed')
    } finally {
      setBusy(false)
    }
  }

  const isIfc = file?.name.toLowerCase().endsWith('.ifc')

  return (
    <form className="step" onSubmit={handleSubmit}>
      <header className="step-head">
        <h1>Project &amp; Upload</h1>
        <p>
          Tell us about the project, then add your model or quantities file.
          IFC models, Bills of Quantities and Revit takeoffs are all accepted —
          the format is detected automatically.
        </p>
      </header>

      <section className="panel">
        <h2>Project details</h2>
        <div className="grid">
          <label className="field">
            <span>Project name <b aria-hidden="true">*</b></span>
            <input
              value={project.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Earlsfort Terrace"
              required
            />
          </label>

          <label className="field">
            <span>
              Gross Internal Area (m²) <b aria-hidden="true">*</b>
            </span>
            <input
              type="number" min="1" step="any" inputMode="decimal"
              value={project.area}
              onChange={(e) => set('area', e.target.value)}
              placeholder="2400"
              aria-invalid={project.area !== '' && !areaValid}
              required
            />
            {project.area !== '' && !areaValid && (
              <em className="hint hint-bad">
                GIA must be greater than 0 — the carbon rating is per m².
              </em>
            )}
          </label>

          <label className="field">
            <span>Design stage</span>
            <select value={project.stage} onChange={(e) => set('stage', e.target.value)}>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Structural system</span>
            <select value={project.system} onChange={(e) => set('system', e.target.value)}>
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Location</span>
            <input
              value={project.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Dublin, Ireland"
            />
          </label>

          <label className="field">
            <span>Client</span>
            <input
              value={project.client}
              onChange={(e) => set('client', e.target.value)}
              placeholder="Not specified"
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Model or quantities file</h2>

        <div
          className={`drop${dragging ? ' drop-over' : ''}${file ? ' drop-filled' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            chooseFile(e.dataTransfer.files?.[0] ?? null)
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <strong className="drop-name">{file.name}</strong>
              <span className="drop-meta">
                {formatBytes(file.size)} · click to replace
              </span>
            </>
          ) : (
            <>
              <strong className="drop-name">Drop your file here</strong>
              <span className="drop-meta">
                or click to browse — .ifc, .csv, .xlsx, .xls
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          className="linkish"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? '− Hide' : '+ Show'} advanced options
        </button>

        {showAdvanced && (
          <label className="field field-wide">
            <span>Google AI key <em>(optional)</em></span>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Only used for unrecognised spreadsheet columns"
              autoComplete="off"
            />
            <em className="hint">
              Helps map columns in an unfamiliar BOQ layout. When supplied, column
              names and a few sample cells are sent to Google. Not used for IFC
              files. Leave blank to use rule-based mapping only.
            </em>
          </label>
        )}
      </section>

      {error && <div className="alert alert-bad" role="alert">{error}</div>}

      {busy && (
        <div className="alert alert-busy" role="status">
          <span className="spinner" aria-hidden="true" />
          {status === 'parsing' && isIfc
            ? 'Reading the IFC model and measuring quantities — this can take a few minutes on a large model.'
            : 'Extracting quantities…'}
        </div>
      )}

      {existing && !result && (
        <div className="alert alert-ok" role="status">
          <strong>This assessment already has quantities.</strong>
          <p>
            <code>{existing.filename}</code> — {existing.nElements.toLocaleString()}{' '}
            element{existing.nElements === 1 ? '' : 's'} extracted. Continue
            below, or drop a new file above to replace it (which discards the
            choices made in later steps).
          </p>
        </div>
      )}

      {result && <ExtractionSummary result={result} />}

      <footer className="step-foot">
        {/* An existing run already has quantities. Offer the way forward
            first, and leave the upload available for replacing the file. */}
        {existing && !result && onContinue && (
          <button type="button" className="primary" onClick={onContinue}>
            Continue to Choose Elements →
          </button>
        )}
        <button type="submit"
                className={existing && !result ? 'ghost' : 'primary'}
                disabled={!canSubmit}>
          {busy ? 'Extracting…'
            : existing && !result ? 'Replace file and re-extract'
              : 'Extract quantities'}
        </button>
        {result && result.n_elements > 0 && (
          <button
            type="button"
            className="primary"
            onClick={() => onExtracted(result, project)}
          >
            Continue to Choose Elements →
          </button>
        )}
      </footer>
    </form>
  )
}

/**
 * Post-extraction summary.
 *
 * Zero elements is a SUCCESSFUL parse in the backend (the BOQ parser degrades
 * gracefully rather than throwing), so it must be called out explicitly here or
 * the user would see an apparently fine result with nothing in it.
 */
function ExtractionSummary({ result }: { result: ExtractionResponse }) {
  const empty = result.n_elements === 0
  const totalVolume = result.elements.reduce((s, e) => s + (e.vol || 0), 0)
  const steelCount = result.elements.filter((e) => e.is_steel).length

  if (empty) {
    return (
      <div className="alert alert-warn" role="alert">
        <strong>No structural quantities found in this file.</strong>
        <p>
          The file was read, but nothing in it looked like a structural element
          with a volume or mass. Check that you uploaded the right sheet, or that
          the quantity column is filled in.
        </p>
      </div>
    )
  }

  return (
    <section className="panel panel-ok">
      <h2>Extracted {result.n_elements} element{result.n_elements === 1 ? '' : 's'}</h2>

      <div className="stats">
        <Stat label="Source" value={result.source_type === 'ifc' ? 'IFC model' : 'Spreadsheet'} />
        <Stat label="Categories" value={String(result.categories.length)} />
        <Stat label="Total volume" value={`${totalVolume.toFixed(1)} m³`} />
        <Stat label="Steel rows" value={String(steelCount)} />
      </div>

      {result.has_real_eids && (
        <p className="hint hint-good">
          This file carries its own emission factors and quantities — they will be
          used directly rather than estimated.
        </p>
      )}

      <div className="chips">
        {result.categories.map((c) => (
          <span key={c} className="chip">{c}</span>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Element</th><th>Category</th><th>Level</th>
              <th className="num">Volume (m³)</th>
              <th className="num">Mass (kg)</th>
              <th className="num">Count</th>
              <th>Material</th>
            </tr>
          </thead>
          <tbody>
            {result.elements.slice(0, 50).map((e) => (
              <tr key={e.idx}>
                <td title={e.name}>{e.name || <em>unnamed</em>}</td>
                <td>{e.cat}</td>
                <td>{e.level || '—'}</td>
                <td className="num">{e.vol ? e.vol.toFixed(3) : '—'}</td>
                <td className="num">{e.mass ? e.mass.toLocaleString() : '—'}</td>
                <td className="num">{e.count}</td>
                <td>
                  <span className={e.is_steel ? 'tag tag-steel' : 'tag tag-conc'}>
                    {e.factor_type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.elements.length > 50 && (
          <p className="hint">
            Showing the first 50 of {result.elements.length} rows. All of them
            carry through to the next step.
          </p>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  )
}
