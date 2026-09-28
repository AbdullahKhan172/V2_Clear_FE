/**
 * Detailed element data - every priced BOQ line, filterable.
 *
 * Filters apply in the browser: the rows are already loaded, and a round trip
 * per dropdown would make the commonest interaction feel slow for no benefit.
 * Rows are fetched once, paged only if the model is very large.
 *
 * The emission bands (High / Medium / Low) are TERCILES of this run's own rows,
 * matching the legacy dashboard. They are relative on purpose - "high" only
 * means anything against the rest of the same building.
 */

import { useEffect, useMemo, useState } from 'react'
import { getResultRows, type ResultRow } from '../api'

type Band = 'all' | 'high' | 'medium' | 'low' | 'zero'

export default function DetailTable({ runId, totalTon }: {
  runId: string; totalTon: number
}) {
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [material, setMaterial] = useState('all')
  const [category, setCategory] = useState('all')
  const [level, setLevel] = useState('all')
  const [band, setBand] = useState<Band>('all')
  const [limit, setLimit] = useState(200)

  useEffect(() => {
    let cancelled = false
    getResultRows(runId)
      .then((r) => !cancelled && setRows(r.rows))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
    return () => { cancelled = true }
  }, [runId])

  const options = useMemo(() => ({
    materials: [...new Set((rows ?? []).map((r) => r.material).filter(Boolean))].sort(),
    categories: [...new Set((rows ?? []).map((r) => r.category).filter(Boolean))].sort(),
    levels: [...new Set((rows ?? []).map((r) => r.level).filter(Boolean))].sort(),
  }), [rows])

  // Terciles of the non-zero rows, as the legacy dashboard computes them.
  const cuts = useMemo(() => {
    const vals = (rows ?? []).map((r) => r.total_kg).filter((v) => v > 0)
      .sort((a, b) => a - b)
    const at = (p: number) =>
      vals.length ? vals[Math.max(0, Math.floor((vals.length * p) / 100) - 1)] : 0
    return { low: at(33), high: at(67) }
  }, [rows])

  const filtered = useMemo(() => {
    let out = rows ?? []
    if (material !== 'all') out = out.filter((r) => r.material === material)
    if (category !== 'all') out = out.filter((r) => r.category === category)
    if (level !== 'all') out = out.filter((r) => (r.level || '') === level)
    if (band === 'high') out = out.filter((r) => r.total_kg > cuts.high)
    else if (band === 'medium') {
      out = out.filter((r) => r.total_kg >= cuts.low && r.total_kg <= cuts.high)
    } else if (band === 'low') {
      out = out.filter((r) => r.total_kg > 0 && r.total_kg < cuts.low)
    } else if (band === 'zero') out = out.filter((r) => !r.total_kg)
    return out
  }, [rows, material, category, level, band, cuts])

  const shownTon = filtered.reduce((s, r) => s + r.total_kg, 0) / 1000
  const reset = () => {
    setMaterial('all'); setCategory('all'); setLevel('all'); setBand('all')
    setLimit(200)
  }

  if (error) return <p className="chart-empty">Could not load rows: {error}</p>
  if (!rows) return <p className="chart-empty">Loading elements…</p>

  return (
    <>
      <div className="filter-row">
        <select value={material} onChange={(e) => setMaterial(e.target.value)}
                aria-label="Filter by material">
          <option value="all">All materials</option>
          {options.materials.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by category">
          <option value="all">All categories</option>
          {options.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        {options.levels.length > 0 && (
          <select value={level} onChange={(e) => setLevel(e.target.value)}
                  aria-label="Filter by level">
            <option value="all">All levels</option>
            {options.levels.map((l) => <option key={l}>{l}</option>)}
          </select>
        )}
        <select value={band} onChange={(e) => setBand(e.target.value as Band)}
                aria-label="Filter by emission band">
          <option value="all">All emission levels</option>
          <option value="high">High (top third)</option>
          <option value="medium">Medium (middle third)</option>
          <option value="low">Low (bottom third)</option>
          <option value="zero">No emission data</option>
        </select>
        <button type="button" className="dash-btn" onClick={reset}>Reset</button>
        <span className="filter-summary">
          <strong>{filtered.length.toLocaleString()}</strong> of {rows.length.toLocaleString()} rows ·{' '}
          <strong>{shownTon.toFixed(2)}</strong> tCO₂e
          {totalTon > 0 && <> ({((shownTon / totalTon) * 100).toFixed(1)}%)</>}
        </span>
      </div>

      <div className="table-scroll detail-scroll">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Material</th><th>Category</th><th>Element</th><th>Level</th>
              <th className="num">Mass (kg)</th>
              <th className="num">A1–A3</th><th className="num">A4</th>
              <th className="num">A5</th>
              <th className="num">Total (kgCO₂e)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.idx} className={r.total_kg ? '' : 'row-zero'}>
                <td>{r.material}</td>
                <td>{r.category}</td>
                <td title={r.description} className="cell-wide">{r.description}</td>
                <td>{r.level || '—'}</td>
                <td className="num">{r.mass.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="num">{r.a1_a3.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="num">{r.a4.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="num">{r.a5.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="num"><strong>
                  {r.total_kg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </strong></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty-cell">
                Nothing matches these filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button type="button" className="dash-btn show-more"
                onClick={() => setLimit((l) => l + 400)}>
          Show more ({(filtered.length - limit).toLocaleString()} remaining)
        </button>
      )}
    </>
  )
}
