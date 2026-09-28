/**
 * The analytical panels the raw breakdowns cannot produce.
 *
 * Each one divides by something the priced rows are not grouped by — concrete
 * volume, slab footprint area, a zone tagged from element names — so none of
 * them is a re-slice of `breakdown`. The arithmetic is all server-side (the
 * same function the legacy HTML dashboard calls); these components only lay it
 * out.
 *
 * Every panel returns null when its data is absent rather than rendering an
 * empty shell of zeros: a run calculated before insights existed, or a
 * spreadsheet upload with no geometry, should simply not show the panel.
 */

import type { DashboardResponse, Insights, IntensityRow } from '../api'

function IntensityTable({ rows, head, empty }: {
  rows: IntensityRow[]; head: string; empty: string
}) {
  return (
    <div className="table-scroll">
     <table className="dash-table compact">
      <thead>
        <tr>
          <th>{head}</th>
          <th className="num">tCO₂e</th>
          <th className="num">kg/m²</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">{r.ton.toFixed(2)}</td>
            <td className="num">{r.kg_per_m2_gia}</td>
            <td className="num">{r.share_pct}%</td>
          </tr>
        )) : (
          <tr><td colSpan={4} className="empty-cell">{empty}</td></tr>
        )}
      </tbody>
     </table>
    </div>
  )
}

/** Per-floor and per-zone intensity — the legacy "Per-floor and Zone Intensity"
 *  card. Zones are tagged from element names: anything reading core / lift /
 *  stair / shear wall is Core, anything basement / foundation / pile is
 *  substructure, and the rest is floorplate. */
export function ZoneIntensity({ insights }: { insights: Insights }) {
  const zones = insights.zone_intensity ?? []
  const floors = insights.floor_intensity ?? []
  if (!zones.length && !floors.length) return null

  return (
    <section className="chart-card">
      <h3>Per-floor and zone intensity</h3>
      <p className="chart-note">
        Floorplate against core against basement, and the level ranking.
      </p>
      <IntensityTable
        rows={floors}
        head="Level"
        empty={'This model carries no storey data, so per-floor intensity is '
               + 'unavailable. The zone split below is unaffected.'}
      />
      <div style={{ height: 10 }} />
      <IntensityTable rows={zones} head="Zone" empty="No zone data." />
    </section>
  )
}

/** Steel per m³ of concrete, and carbon per m³ of concrete.
 *
 *  Both divide by CONCRETE volume only — which is the point. A category with a
 *  high kgCO₂e/m³ is working hard per unit of concrete, and that is a different
 *  statement from "it has a big total", which the breakdown already tells you. */
export function MemberProxies({ insights }: { insights: Insights }) {
  const eff = insights.member_efficiency ?? []
  const intensity = insights.member_intensity ?? []
  if (!eff.length && !intensity.length) return null

  return (
    <>
      {eff.length > 0 && (
        <section className="chart-card">
          <h3>Member efficiency proxy</h3>
          <p className="chart-note">
            Steel kg per m³ of concrete, by member type. An outlier here is
            usually a modelling artefact or genuine over-design.
          </p>
          <div className="table-scroll">
           <table className="dash-table compact">
            <thead>
              <tr>
                <th>Member type</th>
                <th className="num">kg/m³ conc.</th>
                <th className="num">Steel (t)</th>
              </tr>
            </thead>
            <tbody>
              {eff.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="num">{m.steel_kg_per_m3.toLocaleString()}</td>
                  <td className="num">{m.steel_mass_t.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
           </table>
          </div>
        </section>
      )}

      {intensity.length > 0 && (
        <section className="chart-card">
          <h3>Member EC intensity</h3>
          <p className="chart-note">
            kgCO₂e per m³ of concrete — how hard each member type is working,
            independent of how much of it there is.
          </p>
          <div className="table-scroll">
           <table className="dash-table compact">
            <thead>
              <tr>
                <th>Member type</th>
                <th className="num">kgCO₂e/m³</th>
                <th className="num">Conc. m³</th>
              </tr>
            </thead>
            <tbody>
              {intensity.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="num">{m.kgco2e_per_m3.toLocaleString()}</td>
                  <td className="num">{m.conc_vol.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
           </table>
          </div>
        </section>
      )}
    </>
  )
}

/** The slab system on its own, against estimated slab area as well as GIA.
 *  Rendered as a footnote to the substructure split, exactly as the legacy
 *  dashboard does — it is a qualifier on that card, not a card of its own. */
export function SlabSystemNote({ insights }: { insights: Insights }) {
  const s = insights.slab_metrics
  if (!s || !s.ton) return null
  return (
    <p className="slab-note">
      Slab-system EC: <strong>{s.kg_per_m2_slab} kgCO₂e/m² slab</strong>
      {s.area_m2_est > 0 && (
        <>
          {' '}({s.kg_per_m2_gia} kgCO₂e/m² GIA; slab area estimate{' '}
          {s.area_m2_est.toLocaleString()} m²)
        </>
      )}
    </p>
  )
}

/** What this stage should foreground, and what it should stop showing.
 *  The lists come from the server's stage contract, not from the view. */
export function StageFocus({ data }: { data: DashboardResponse }) {
  const f = data.stage_focus
  if (!f || (!f.show.length && !f.hide.length)) return null
  return (
    <section className="chart-card stage-focus">
      <h3>Stage focus: {f.stage || data.stage_label}</h3>
      <p className="chart-note">
        Reporting uncertainty currently ±{data.uncertainty_pct}%
      </p>
      {f.show.length > 0 && (
        <ul className="findings">
          {f.show.map((t) => <li key={t}><i className="dot dot-go" />{t}</li>)}
        </ul>
      )}
      {f.hide.length > 0 && (
        <>
          <p className="findings-head">Collapse or lock at this stage</p>
          <ul className="findings">
            {f.hide.map((t) => <li key={t}><i className="dot dot-hold" />{t}</li>)}
          </ul>
        </>
      )}
    </section>
  )
}

/** The audit trail — what was computed, at what confidence, on what data.
 *  Legacy "Data Intelligence & Audit Trail". */
export function AuditTrail({ data }: { data: DashboardResponse }) {
  const ins = data.insights ?? {}
  const nScenarios = Object.keys(data.sensitivity ?? {}).length
  const coverage = ins.epd_coverage_pct
  const hasEpd = data.emission_factors_used.some((f) => f.is_custom)
  const system = String(
    (data.project as Record<string, unknown>)?.structural_system || '')

  return (
    <section className="chart-card wide audit">
      <h3>Data intelligence &amp; audit trail</h3>
      <div className="audit-cols">
        <div>
          <h4>Core results</h4>
          <ul>
            <li>Total: <strong>{data.total_ton.toLocaleString()} tCO₂e</strong></li>
            <li>Intensity: <strong>{data.per_sqm} kgCO₂e/m²</strong></li>
            <li>{data.breakdown.category.length} member types computed</li>
            <li>{nScenarios} sensitivity run{nScenarios === 1 ? '' : 's'} completed</li>
          </ul>
        </div>
        <div>
          <h4>Accuracy &amp; stage</h4>
          <ul>
            <li>Stage: <strong>{data.stage_label}</strong></li>
            <li>Accuracy band: <strong>±{data.uncertainty_pct}%</strong></li>
            <li>System: {system || 'not specified'}</li>
            <li>Factor database: {data.catalogue_version}</li>
          </ul>
        </div>
        <div>
          <h4>EPD readiness</h4>
          <ul>
            {coverage !== undefined && (
              // Share of MASS, not of factor count: one concrete EPD covers far
              // more of a frame than one PT strand EPD does.
              <li>EPD coverage: <strong>{coverage}% of mass</strong></li>
            )}
            <li>{hasEpd ? 'Supplier EPDs applied'
                        : 'Currently generic IGBC catalogue'}</li>
            <li>At Tender: replace generic factors with supplier EPDs</li>
            {data.stage_label === 'Tender' && !hasEpd && (
              <li className="warn-item">EPDs are expected at Tender stage</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** Blended realised factors, and where GGBS would take them.
 *  Derived from the BOQ as calculated, not from the Step-3 dropdown. */
export function RealisedFactors({ insights }: { insights: Insights }) {
  const f = insights.factors
  if (!f || !f.concrete_baseline) return null
  return (
    <section className="chart-card">
      <h3>Realised factors</h3>
      <p className="chart-note">
        The blended rate this result actually worked out at, across every mix in
        the model — not the catalogue value of any single grade.
      </p>
      <div className="table-scroll">
       <table className="dash-table compact">
        <thead>
          <tr>
            <th>Material</th>
            <th className="num">kgCO₂e/kg</th>
            <th className="num">vs base</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Concrete (as run)</td>
            <td className="num">{f.concrete_baseline.toFixed(4)}</td>
            <td className="num"><em className="na">—</em></td>
          </tr>
          {f.ggbs_50_reduction_pct > 0 && (
            <tr>
              <td>Concrete at 50% GGBS</td>
              <td className="num">{f.ggbs_50_opt.toFixed(4)}</td>
              <td className="num good">−{f.ggbs_50_reduction_pct}%</td>
            </tr>
          )}
          {f.ggbs_70_reduction_pct > 0 && (
            <tr>
              <td>Concrete at 70% GGBS</td>
              <td className="num">{f.ggbs_70_opt.toFixed(4)}</td>
              <td className="num good">−{f.ggbs_70_reduction_pct}%</td>
            </tr>
          )}
          {f.steel_baseline > 0 && (
            <tr>
              <td>Steel (blended)</td>
              <td className="num">{f.steel_baseline.toFixed(4)}</td>
              <td className="num"><em className="na">—</em></td>
            </tr>
          )}
        </tbody>
       </table>
      </div>
    </section>
  )
}
