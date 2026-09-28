/**
 * SCORS rating scale — the A++ to G strip with a marker at this project.
 *
 * Bands and colours come from the API, which reads compliance.py. They are not
 * restated here on purpose: the legacy dashboard hardcoded its factor tables in
 * HTML and two of them had already drifted from the catalogue, which is the same
 * mistake one level down.
 *
 * The final band (G) is open-ended, so the scale is drawn against the last
 * finite bound and anything beyond it pins to the end rather than running off.
 */

import type { DashboardResponse, ScorsBand } from '../api'

interface Props {
  bands: ScorsBand[]
  perSqm: number
  rating: string
  /** The industry-average comparator. Shown beside the rating, as the legacy
   *  dashboard does — a letter grade means more next to the number it is being
   *  judged against. */
  benchmark?: DashboardResponse['benchmark']
}

export default function ScorsScale({ bands, perSqm, rating, benchmark }: Props) {
  if (!bands.length) return null

  // Scale to the top of the last band that has one. G is unbounded, so it is
  // drawn as one more band-width rather than as infinity.
  const finite = bands.filter((b) => b.high !== null)
  const lastHigh = finite.length ? finite[finite.length - 1].high! : 400
  const bandWidth = finite.length ? lastHigh / finite.length : 50
  const scaleMax = lastHigh + bandWidth

  const pct = (v: number) => Math.min(100, Math.max(0, (v / scaleMax) * 100))
  const markerPct = pct(perSqm)

  return (
    <section className="scors">
      <div className="scors-head">
        <h2>Structural carbon rating (SCORS)</h2>
        <div className="scors-head-side">
          <span className="scors-current">
            This project: <strong>{rating}</strong> at {perSqm.toFixed(1)} kgCO₂e/m²
          </span>
          {benchmark && (
            <div className="benchmark-box">
              <span className="bm-label">Benchmark</span>
              <strong className="bm-value">{benchmark.benchmark}</strong>
              <span className={`bm-diff ${benchmark.better ? 'good' : 'over'}`}>
                {benchmark.better ? '−' : '+'}{Math.abs(benchmark.diff_pct)}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="scors-track">
        {bands.map((b) => {
          const high = b.high ?? scaleMax
          const width = ((high - b.low) / scaleMax) * 100
          const isCurrent = b.rating === rating
          return (
            <div
              key={b.rating}
              className={`scors-band${isCurrent ? ' current' : ''}`}
              style={{
                width: `${width}%`,
                background: `linear-gradient(90deg, ${b.color}, ${b.color_end})`,
              }}
              title={b.high === null
                ? `${b.rating}: above ${b.low} kgCO₂e/m²`
                : `${b.rating}: ${b.low}–${b.high} kgCO₂e/m²`}
            >
              <span className="scors-letter">{b.rating}</span>
            </div>
          )
        })}

        <div className="scors-marker" style={{ left: `${markerPct}%` }}>
          <span className="scors-marker-flag">{perSqm.toFixed(0)}</span>
        </div>
      </div>

      <div className="scors-axis" aria-hidden="true">
        {bands.filter((b) => b.high !== null).map((b) => (
          <span key={b.rating} style={{ left: `${pct(b.high!)}%` }}>{b.high}</span>
        ))}
      </div>

      <p className="dash-hint">
        IStructE SCORS bands, structural scope only (A1–A5). B (≤200 kgCO₂e/m²)
        is the target band.
      </p>
    </section>
  )
}
