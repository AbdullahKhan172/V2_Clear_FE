/**
 * Detailed emissions — the slide-over, ported from the legacy dashboard.
 *
 * This is NOT a duplicate of the inline detail table. The two answer different
 * questions and the legacy report carried both:
 *
 *   inline table   "show me the biggest lines, filtered" — sorted by size,
 *                  with material/category/level/band filters
 *   this drawer    "show me this member's full cost" — every row grouped under
 *                  the member it belongs to, concrete then its reinforcement
 *                  then its PT, so a slab and the steel inside it read together
 *
 * The grouping is the substance. `Floor:150mm slab - Concrete` and
 * `Floor:150mm slab - Rebar (150 kg/m³)` are one member in two rows; splitting
 * them across a size-sorted list hides what a member actually costs.
 */

import { useEffect, useMemo, useState } from 'react'
import { getResultRows, type ResultRow } from '../api'
import { resolveCategory } from './categories'

/** Rows sharing a member, in the order the legacy drawer used.
 *
 *  Ported from populateDetailedPanel()'s sortedByMemberFlow():
 *   - member = the description up to the first " - " separator
 *   - groups ranked by their CONCRETE row's total (a member's headline cost),
 *     falling back to the largest row when there is no concrete
 *   - within a group: Concrete → Rebar → Steel Section → Post Tensioning,
 *     then by size
 */
const MATERIAL_RANK: Record<string, number> = {
  'concrete': 0, 'rebar': 1, 'steel section': 2, 'post tensioning': 3,
}

function memberName(r: ResultRow): string {
  const desc = String(r.description ?? '').trim()
  if (desc.includes(' - ')) return desc.split(' - ')[0].trim()
  return desc || String(r.category || r.material || 'Unknown')
}

function byMemberFlow(rows: ResultRow[]): ResultRow[] {
  // Group from BOQ order, not the order the API returned. /results/rows is
  // sorted biggest-first, and the group ranking below takes a member's FIRST
  // concrete row as its headline cost - so feeding it size-sorted rows picks a
  // different row and reshuffles the whole drawer. `idx` is the position in the
  // priced BOQ, which is exactly what the legacy drawer iterated.
  const src = [...rows].sort((a, b) => a.idx - b.idx)

  const groups = new Map<string, ResultRow[]>()
  for (const r of src) {
    const k = memberName(r)
    const g = groups.get(k)
    if (g) g.push(r); else groups.set(k, [r])
  }

  const ranked = [...groups.entries()].map(([key, rs]) => {
    const concrete = rs.find((r) => r.material === 'Concrete')
    const keyTotal = concrete
      ? concrete.total_kg
      : Math.max(...rs.map((r) => r.total_kg), 0)
    return { key, rows: rs, keyTotal }
  })

  ranked.sort((a, b) =>
    b.keyTotal !== a.keyTotal ? b.keyTotal - a.keyTotal
      : a.key.localeCompare(b.key))

  const rank = (r: ResultRow) =>
    MATERIAL_RANK[String(r.material ?? '').toLowerCase()] ?? 4

  return ranked.flatMap((g) => {
    g.rows.sort((a, b) =>
      rank(a) !== rank(b) ? rank(a) - rank(b) : b.total_kg - a.total_kg)
    return g.rows
  })
}

function familyType(r: ResultRow): string {
  const fam = String(r.family ?? '').trim()
  const typ = String(r.ifc_type ?? '').trim()
  if (!fam && !typ) return '—'
  return `${fam || '—'} / ${typ || '—'}`
}

const kg = (v: number) =>
  v.toLocaleString(undefined, { maximumFractionDigits: 0 })

export default function EmissionsPanel({ runId, open, onClose }: {
  runId: string; open: boolean; onClose: () => void
}) {
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetched on first OPEN, not on mount: the drawer is optional, and the rows
  // are the largest payload on the page after the geometry.
  useEffect(() => {
    if (!open || rows || error) return
    let cancelled = false
    getResultRows(runId)
      .then((d) => !cancelled && setRows(d.rows))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
    return () => { cancelled = true }
  }, [open, runId, rows, error])

  const ordered = useMemo(() => (rows ? byMemberFlow(rows) : []), [rows])
  const totalTon = useMemo(
    () => ordered.reduce((s, r) => s + r.total_kg, 0) / 1000, [ordered])

  return (
    <>
      <div className={`panel-scrim${open ? ' show' : ''}`} onClick={onClose} />
      <aside className={`slide-panel wide${open ? ' open' : ''}`}
             role="dialog" aria-modal={open} aria-label="Detailed emissions data">
        <header className="slide-head">
          <h2>Detailed emissions data</h2>
          <button type="button" className="dash-btn" onClick={onClose}>Close</button>
        </header>

        <div className="slide-body">
          {error && <p className="chart-empty">Could not load rows: {error}</p>}
          {!rows && !error && <p className="chart-empty">Loading rows…</p>}

          {rows && (
            <>
              <p className="slide-note" style={{ margin: '10px 0 8px' }}>
                <strong>{ordered.length.toLocaleString()}</strong> priced lines ·{' '}
                <strong>{totalTon.toFixed(2)} tCO₂e</strong> · grouped by member
                (Concrete → Rebar → PT), biggest member first.
              </p>

              <div className="table-scroll">
                <table className="slide-table drawer-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Material</th>
                      <th>Category</th>
                      <th>Family / Type</th>
                      <th className="num">Mass (kg)</th>
                      <th className="num">A1–A3</th>
                      <th className="num">A4</th>
                      <th className="num">A5</th>
                      <th className="num">Total (t)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((r) => (
                      <tr key={r.idx} className={r.total_kg ? '' : 'row-zero'}>
                        <td className="mono">{r.e_id || '—'}</td>
                        <td>
                          {r.material}
                          {r.description && (
                            <span className="sub">{r.description}</span>
                          )}
                        </td>
                        <td>{resolveCategory(r.category, r.description)}</td>
                        <td className="cell-wide">{familyType(r)}</td>
                        <td className="num">{kg(r.mass)}</td>
                        <td className="num">{kg(r.a1_a3)}</td>
                        <td className="num">{kg(r.a4)}</td>
                        <td className="num">{kg(r.a5)}</td>
                        <td className="num">
                          {/* A row with no factor reads "No EC" rather than
                              0.000 — a missing factor and a genuine zero are
                              different facts. */}
                          {r.total_kg
                            ? <strong>{(r.total_kg / 1000).toFixed(3)}</strong>
                            : <em className="na">No EC</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
