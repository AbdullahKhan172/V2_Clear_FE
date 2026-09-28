/**
 * The four headline tiles, matching the legacy dashboard:
 * Total Emissions · Carbon Intensity · Carbon Budget vs SCORS B · Social Cost.
 *
 * Each figure is server-computed. The budget bar's fill and colour come from
 * the API too, rather than the thresholds being restated here - the legacy
 * dashboard's own drift (hardcoded factor tables that fell out of step with the
 * catalogue) is exactly what restating constants in the view causes.
 */

import type { DashboardResponse } from '../api'

export default function KpiRow({ data }: { data: DashboardResponse }) {
  const [lo, hi] = data.per_sqm_range.length === 2
    ? data.per_sqm_range : [null, null]

  return (
    <div className="kpi-row">
      <div className="kpi">
        <span className="kpi-label">Total Emissions</span>
        <strong className="kpi-value">
          {data.total_ton.toLocaleString(undefined, {
            minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <em> tCO₂e</em>
        </strong>
        <span className="kpi-sub">
          A1–A5 upfront carbon
          {data.sequestration_ton < 0 && (
            <> · {Math.abs(data.sequestration_ton).toFixed(1)} t stored separately</>
          )}
        </span>
      </div>

      <div className="kpi">
        <span className="kpi-label">Carbon Intensity</span>
        <strong className="kpi-value">
          {data.per_sqm.toFixed(1)}<em> kgCO₂e/m²</em>
        </strong>
        <span className="kpi-sub">
          {lo !== null
            /* The band is a DISPLAY qualifier from the design stage - it never
               alters the calculated figure, and stating it beside the number is
               how the report avoids implying false precision. */
            ? <>±{data.uncertainty_pct}% → {lo}–{hi} at {data.stage_label}</>
            : <>rating {data.rating}</>}
        </span>
      </div>

      <div className="kpi">
        <span className="kpi-label">Carbon Budget vs SCORS B</span>
        {/* No +/- sign: "−59.6" reads as a shortfall when the project is
            actually 59.6 UNDER target. The direction is a word, not a sign. */}
        <strong className="kpi-value" style={{ color: data.budget.color }}>
          {Math.abs(data.budget.headroom).toFixed(1)}
          <em> kgCO₂e/m² {data.budget.within ? 'under' : 'over'}</em>
        </strong>
        <div className="kpi-bar" aria-hidden="true">
          <span style={{ width: `${data.budget.bar_pct}%`,
                         background: data.budget.color }} />
        </div>
        <span className="kpi-sub">
          {data.budget.actual} of the {data.budget.target} target
          {data.budget.delta_ton !== null && (
            <> · {Math.abs(data.budget.delta_ton).toLocaleString()} tCO₂e{' '}
              {data.budget.within ? 'of headroom' : 'over budget'}</>
          )}
        </span>
      </div>

      <div className="kpi">
        <span className="kpi-label">Social Cost of Carbon</span>
        <strong className="kpi-value">
          €{data.social_cost.cost.toLocaleString()}
        </strong>
        <span className="kpi-sub">
          at €{data.social_cost.price_per_ton}/tCO₂e — a policy assumption,
          not a price paid
        </span>
      </div>
    </div>
  )
}
