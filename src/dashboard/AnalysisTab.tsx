/**
 * Carbon Analysis tab.
 *
 * Every figure is server-computed; nothing is recalculated here. The charts and
 * the tables read the same numbers, which is also the accessibility mitigation
 * the palette validation requires: three series sit below 3:1 on white, so a
 * table view exists alongside the marks rather than colour carrying the value.
 */

import { Suspense, lazy, useEffect, useState } from 'react'
import { getGeometry, type DashboardResponse, type GeometryResponse } from '../api'
import ViewerEmpty from './viewer/ViewerEmpty'

// three.js is ~600 kB and only ever draws an IFC model. Loading it on demand
// means a spreadsheet run — which has no geometry at all — never pays for it.
const ModelViewer = lazy(() => import('./viewer/ModelViewer'))
import {
  ChartCard, EmptyChart, HBar, MaterialStageBar, SplitBar, StageBar,
} from './charts/Charts'
import { MATERIAL_COLOR, fmtTon, materialColor } from './charts/theme'
import {
  MemberProxies, RealisedFactors, SlabSystemNote, StageFocus, ZoneIntensity,
} from './InsightPanels'

export default function AnalysisTab({ data }: { data: DashboardResponse }) {
  const [showTable, setShowTable] = useState(false)
  const [geom, setGeom] = useState<GeometryResponse | null>(null)

  // Geometry is fetched separately and AFTER the charts: on a real model it can
  // be tens of megabytes, and the numbers should not wait for the picture.
  useEffect(() => {
    let cancelled = false
    getGeometry(data.run_id)
      .then((g) => !cancelled && setGeom(g))
      .catch(() => !cancelled && setGeom({ run_id: data.run_id, elements: [],
                                           has_meshes: false }))
    return () => { cancelled = true }
  }, [data.run_id])

  const insights = data.insights ?? {}
  // Intensity per material, against GIA. Read off the project rather than
  // back-derived from per_sqm, which is already rounded for display.
  const area = Number((data.project as Record<string, unknown>)?.area) || 0
  const perSqm = (ton: number) =>
    area > 0 ? ((ton * 1000) / area).toFixed(1) : '—'
  const materials = data.breakdown.material
  const categories = data.breakdown.category
  const levels = data.breakdown.level.filter((l) => l.key !== '(unassigned)')

  return (
    <div className="chart-grid">
      {/* ── What this stage is for ──────────────────────────────────── */}
      <StageFocus data={data} />
      <RealisedFactors insights={insights} />

      {/* ── Where the carbon is ─────────────────────────────────────── */}
      <ChartCard
        title="Materials contribution"
        note="Upfront carbon (A1–A5) by material."
      >
        <HBar data={materials.map((m) => ({
          key: m.key, value: m.total_ton, color: materialColor(m.key, 0) }))} />
      </ChartCard>

      <ChartCard
        title="Lifecycle stage breakdown"
        note="A1–A3 manufacturing · A4 transport to site · A5 construction, including waste."
      >
        <StageBar stages={data.stage_emissions} total={data.total_ton} />
        <dl className="stage-figures">
          {Object.entries(data.stage_emissions).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v.toFixed(2)}<em> t</em></dd>
            </div>
          ))}
        </dl>
      </ChartCard>

      <ChartCard
        title="Emissions by element type"
        note="Which parts of the structure carry the carbon."
      >
        <HBar data={categories.map((c) => ({ key: c.key, value: c.total_ton }))} />
      </ChartCard>

      <ChartCard
        title="Material across the lifecycle"
        note="Grouped, not stacked — the useful comparison is stage against stage. Values in tCO₂e."
        wide
      >
        <MaterialStageBar rows={materials} />
      </ChartCard>

      {/* ── Where to look first ─────────────────────────────────────── */}
      <ChartCard
        title="Top carbon hotspots"
        note="The individual line items contributing most."
      >
        {data.hotspots.length ? (
          <HBar
            data={data.hotspots.map((h) => ({
              key: h.description.length > 34
                ? `${h.description.slice(0, 33)}…` : h.description,
              value: h.total_ton,
              color: materialColor(h.material, 0),
            }))}
          />
        ) : <EmptyChart message="No priced rows." />}
      </ChartCard>

      <ChartCard
        title="Substructure vs superstructure"
        note="Foundations and below-ground work, against everything above."
      >
        <SplitBar
          a={data.substructure.substructure}
          b={data.substructure.superstructure}
          labelA="Substructure" labelB="Superstructure"
        />
        <SlabSystemNote insights={insights} />
      </ChartCard>

      <ChartCard
        title="Intensity by element type"
        note="Carbon per m² of floor area — where the intensity actually sits."
      >
        {data.member_efficiency.length ? (
          <HBar
            data={data.member_efficiency.map((m) => ({
              key: m.key, value: m.per_sqm }))}
            unit="kgCO₂e/m²" decimals={1}
          />
        ) : (
          <EmptyChart message="Set the floor area in Step 1 to see intensity." />
        )}
      </ChartCard>

      <ChartCard
        title="Emissions by floor level"
        note="Per-storey carbon, for staged handovers and basement comparisons."
      >
        {levels.length ? (
          <HBar data={levels.map((l) => ({ key: l.key, value: l.total_ton }))} />
        ) : (
          <EmptyChart
            message={
              'Floor levels are not carried through to the priced rows yet, so ' +
              'this breakdown is unavailable. The totals above are unaffected.'
            }
          />
        )}
      </ChartCard>

      {/* ── Analysis the breakdowns cannot give you ─────────────────── */}
      <ZoneIntensity insights={insights} />
      <MemberProxies insights={insights} />

      {/* ── 3D model ────────────────────────────────────────────────── */}
      <section className="chart-card wide">
        <h3>3D model</h3>
        <p className="chart-note">
          Click an element for its carbon; hover for a summary. Double-click the
          view to re-frame.
        </p>
        {!geom ? <p className="chart-empty">Loading model…</p>
          : !geom.elements.length ? <ViewerEmpty />
            : (
              <Suspense fallback={<p className="chart-empty">Loading model…</p>}>
                <ModelViewer elements={geom.elements} hasMeshes={geom.has_meshes} />
              </Suspense>
            )}
      </section>

      {/* ── The table view ──────────────────────────────────────────── */}
      <section className="chart-card wide">
        <div className="chart-head-row">
          <h3>Material summary</h3>
          <button type="button" className="dash-btn"
                  onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide' : 'Show'} full numbers
          </button>
        </div>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Mass (kg)</th>
                <th className="num">A1–A3</th>
                <th className="num">A4</th>
                <th className="num">A5</th>
                <th className="num">Total (tCO₂e)</th>
                <th className="num">kg/m² GIA</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.key}>
                  <td>
                    <i className="key" style={{ background: materialColor(m.key, 0) }} />
                    {m.key}
                  </td>
                  <td className="num">{m.mass_kg.toLocaleString()}</td>
                  <td className="num">{m.a1_a3.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="num">{m.a4.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="num">{m.a5.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="num"><strong>{m.total_ton.toFixed(2)}</strong></td>
                  <td className="num">{perSqm(m.total_ton)}</td>
                  <td className="num">
                    {data.total_ton > 0
                      ? `${((m.total_ton / data.total_ton) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Total</td>
                <td className="num">
                  {materials.reduce((s, m) => s + m.mass_kg, 0).toLocaleString()}
                </td>
                <td className="num" colSpan={3} />
                <td className="num"><strong>{data.total_ton.toFixed(2)}</strong></td>
                <td className="num"><strong>{data.per_sqm}</strong></td>
                <td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {showTable && (
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Element type</th>
                  <th className="num">Rows</th>
                  <th className="num">Mass (kg)</th>
                  <th className="num">Total (tCO₂e)</th>
                  <th className="num">Per m²</th>
                  <th className="num">kgCO₂e per kg</th>
                </tr>
              </thead>
              <tbody>
                {data.member_efficiency.map((m) => {
                  const cat = categories.find((c) => c.key === m.key)
                  return (
                    <tr key={m.key}>
                      <td>{m.key}</td>
                      <td className="num">{cat?.rows ?? '—'}</td>
                      <td className="num">{m.mass_kg.toLocaleString()}</td>
                      <td className="num">{m.total_ton.toFixed(2)}</td>
                      <td className="num">{m.per_sqm.toFixed(1)}</td>
                      <td className="num">{m.intensity.toFixed(3)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Assumptions actually applied ────────────────────────────── */}
      <section className="chart-card wide">
        <h3>Emission factors applied</h3>
        <p className="chart-note">
          The values this result was built from — factor database{' '}
          {data.catalogue_version}.
        </p>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Material</th><th>Factor</th>
                <th className="num">A1–A3</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.emission_factors_used.map((f, i) => (
                <tr key={`${f.e_id}-${i}`}>
                  <td>{f.material}</td>
                  <td>{f.name}</td>
                  <td className="num">{Number(f.a1_a3).toFixed(3)}</td>
                  <td>
                    <span className={`src-tag ${f.is_custom ||
                      String(f.data_type).startsWith('EPD') ? 'epd' : 'generic'}`}>
                      {f.data_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.concrete_specs_used.length > 0 && (
          <p className="chart-note" style={{ marginTop: 10 }}>
            Concrete: {data.concrete_specs_used.map((c) =>
              `${c.grade} at ${c.ggbs_pct}% GGBS (${c.element})`).join(' · ')}
          </p>
        )}
      </section>
    </div>
  )
}

export { MATERIAL_COLOR, fmtTon }
