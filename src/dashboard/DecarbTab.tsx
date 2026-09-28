/**
 * Decarbonisation & Value Engineering.
 *
 * The tab's substance is which levers are still OPEN at this design stage.
 * Proposing a structural-system swap at Tender is not advice, it is noise — so
 * locked levers are shown greyed with the reason, rather than hidden (a reader
 * should see that the option existed and when it closed) and never counted
 * toward the opportunity.
 *
 * Savings come from the engine re-running the real bill of quantities with each
 * modification — not from a multiplier applied to the total.
 */

import type { DashboardResponse } from '../api'
import { ChartCard, CostVsCarbon } from './charts/Charts'
import { AuditTrail } from './InsightPanels'

export default function DecarbTab({ data }: { data: DashboardResponse }) {
  const d = data.decarbonisation
  if (!d) return <div className="chart-card"><p className="chart-note">No scenarios.</p></div>

  const pending = data.sensitivity_status === 'pending'
  const failed = data.sensitivity_status === 'failed'
  const maxDelta = Math.max(...d.scenarios.map((s) => s.delta_ton), 0.001)
  const [lo, hi] = data.per_sqm_range?.length === 2
    ? data.per_sqm_range : [null, null]

  return (
    <div className="chart-grid">
      {/* ── Stage framing ───────────────────────────────────────────── */}
      <section className="chart-card wide stage-lead">
        <h3>{d.headline}</h3>
        <p className="chart-note">{d.lead}</p>

        {lo !== null && hi !== null && (
          <div className="range-band">
            <div className="range-head">
              Estimate range at <strong>{d.stage}</strong>:{' '}
              <strong className="range-nums">
                {Math.round(lo * data.total_ton / data.per_sqm).toLocaleString()} –{' '}
                {Math.round(hi * data.total_ton / data.per_sqm).toLocaleString()} tCO₂e
              </strong>{' '}
              <span className="range-mid">
                (central value {data.total_ton.toLocaleString()} tCO₂e ·{' '}
                {data.per_sqm} kgCO₂e/m²)
              </span>
            </div>
            {/* The band is drawn against itself, centred: the point is the WIDTH
                of the uncertainty at this stage, not a position on any scale. */}
            <div className="range-track">
              <span className="range-fill" />
              <span className="range-mark" />
            </div>
            <div className="range-foot">
              <span>{lo} kg/m²</span>
              <span className="range-pct">±{data.uncertainty_pct}% at {d.stage}</span>
              <span>{hi} kg/m²</span>
            </div>
          </div>
        )}
        {d.combined_ton > 0 && (
          <div className="opportunity">
            <div>
              <span className="opp-label">Opportunity still open at {d.stage}</span>
              <strong className="opp-value">
                {d.combined_ton.toLocaleString()}<em> tCO₂e</em>
              </strong>
              <span className="opp-sub">
                {d.combined_per_sqm} kgCO₂e/m² · {d.combined_pct}% of this result
              </span>
            </div>
            <p className="opp-note">
              The sum of the open actions below. Mutually exclusive options —
              50% and 70% GGBS, for instance — count once, at the better value,
              because the same concrete cannot be both.
            </p>
          </div>
        )}
      </section>

      {pending && (
        <div className="dash-alert info" style={{ gridColumn: '1 / -1' }}>
          <strong>Still computing the scenarios.</strong>
          <p>The headline figures above are final; refresh in a moment for the
             decarbonisation options.</p>
        </div>
      )}
      {failed && (
        <div className="dash-alert warn" style={{ gridColumn: '1 / -1' }}>
          <strong>The decarbonisation scenarios could not be computed.</strong>
          <p>Your result is unaffected — only these options are unavailable.</p>
        </div>
      )}

      {/* ── Value engineering: carbon against cost ──────────────────── */}
      <ChartCard title="Embodied carbon vs cost — like-for-like case study"
                 note={d.benchmarks.note} wide>
        <CostVsCarbon rows={d.benchmarks.rows} />
      </ChartCard>

      {/* ── Top actions ─────────────────────────────────────────────── */}
      {d.actions.length > 0 && (
        <ChartCard title="Where to act first"
                   note="Ranked by the carbon each would actually save on this project."
                   wide>
          <ol className="action-list">
            {d.actions.map((a, i) => (
              <li key={a.key}>
                <span className="action-rank">{i + 1}</span>
                <span className="action-body">
                  <strong>{a.label}</strong>
                  <em>{a.note}</em>
                  {a.engine_note && <em className="engine-note">{a.engine_note}</em>}
                </span>
                <span className="action-figure">
                  <strong>{a.delta_ton.toLocaleString()}<em> t</em></strong>
                  <span>{a.delta_per_sqm} kg/m² · {a.delta_pct}%</span>
                </span>
              </li>
            ))}
          </ol>
        </ChartCard>
      )}

      {/* ── Full matrix ─────────────────────────────────────────────── */}
      <ChartCard title="Decarbonisation matrix"
                 note="Every lever, whether or not it is still available at this stage."
                 wide>
        <div className="table-scroll">
          <table className="dash-table matrix">
            <thead>
              <tr>
                <th>Action</th>
                <th className="num">Saving (tCO₂e)</th>
                <th className="num">kgCO₂e/m²</th>
                <th className="num">Rows</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.scenarios.map((s) => (
                <tr key={s.key} className={s.open ? '' : 'locked'}>
                  <td className="cell-wide">
                    <strong>{s.label}</strong>
                    <em className="matrix-note">
                      {s.open ? s.note : s.locked_reason}
                    </em>
                  </td>
                  <td className="num">
                    {s.is_estimate ? <em className="na">see below</em>
                      : s.available && s.delta_ton > 0 ? (
                        <span className="bar-cell">
                          <span className="bar-fill"
                                style={{ width: `${(s.delta_ton / maxDelta) * 100}%` }} />
                          <b>{s.delta_ton.toLocaleString()}</b>
                        </span>
                      ) : <em className="na">—</em>}
                  </td>
                  <td className="num">
                    {s.delta_per_sqm > 0 ? s.delta_per_sqm : '—'}
                  </td>
                  <td className="num">{s.n_rows || '—'}</td>
                  <td>
                    <span className={`pill ${s.open ? 'pill-in' : 'pill-out'}`}>
                      {s.open ? 'Available now' : 'Closed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* ── EPD opportunity, tender only ────────────────────────────── */}
      {d.epd_opportunity && (
        <ChartCard title="Supplier EPDs" wide
                   note="The remaining lever once design is fixed.">
          <div className="opportunity">
            <div>
              <span className="opp-label">Indicative saving</span>
              <strong className="opp-value">
                {d.epd_opportunity.delta_ton.toLocaleString()}<em> tCO₂e</em>
              </strong>
              <span className="opp-sub">{d.epd_opportunity.delta_per_sqm} kgCO₂e/m²</span>
            </div>
            <p className="opp-note">{d.epd_opportunity.basis}</p>
          </div>
        </ChartCard>
      )}

      {/* ── Hotspots ────────────────────────────────────────────────── */}
      <ChartCard title="Where the carbon actually is"
                 note="The three element types carrying the most, and what moves them.">
        <ol className="hotspot-list">
          {d.hotspots.map((h) => (
            <li key={h.category}>
              <div className="hotspot-head">
                <strong>{h.category}</strong>
                <span>{h.total_ton.toLocaleString()} t · {h.pct}%</span>
              </div>
              <div className="hotspot-bar">
                <span style={{ width: `${h.pct}%` }} />
              </div>
              <em>{h.target}</em>
            </li>
          ))}
        </ol>
      </ChartCard>

      {/* ── System comparison ───────────────────────────────────────── */}
      <ChartCard title="System comparison"
                 note={d.benchmarks.note} wide>
        <div className="table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>System</th>
                <th className="num">kgCO₂e/m²</th>
                <th className="num">€/m²</th>
                <th className="num">vs best</th>
              </tr>
            </thead>
            <tbody>
              {d.benchmarks.rows.map((r) => (
                <tr key={r.system ?? '__current__'}
                    className={r.is_current ? 'total-row' : ''}>
                  <td>
                    {r.is_current && <span className="you">This run</span>}
                    {r.system}
                  </td>
                  <td className="num"><strong>{r.per_sqm}</strong></td>
                  <td className="num">
                    {r.cost !== null ? r.cost : <em className="na">—</em>}
                  </td>
                  <td className="num">
                    {r.vs_best_pct === 0 ? <span className="best">best</span>
                      : `+${r.vs_best_pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chart-note" style={{ marginTop: 10 }}>
          Benchmarks are a {d.benchmarks.gia.toLocaleString()} m² Ireland office
          case study. Costs are indicative and not available for your own run.
        </p>
      </ChartCard>

      {/* ── Audit trail ─────────────────────────────────────────────── */}
      <AuditTrail data={data} />
    </div>
  )
}
