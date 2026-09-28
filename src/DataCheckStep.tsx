/**
 * Step 5 - Data Check. Read-only.
 *
 * Nothing to fill in: it shows the factors the calculation will actually use,
 * resolved from steps 1-4, so they can be checked before anything runs.
 *
 * Every number comes from the server, which reads the catalogue CSV at request
 * time. The legacy wizard hardcoded these tables in the HTML and two of its 41
 * concrete values had already drifted from the CSV - meaning the screen headed
 * "the emission factors your results will be based on" was showing numbers the
 * calculation did not use. Nothing here is hardcoded for that reason.
 */

import { useEffect, useState } from 'react'
import { ApiError, getDataCheck, type DataCheckResponse } from './api'

interface Props {
  runId: string
  onBack: () => void
  onContinue: () => void
}

export default function DataCheckStep({ runId, onBack, onContinue }: Props) {
  const [data, setData] = useState<DataCheckResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getDataCheck(runId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [runId])

  if (loading) {
    return (
      <div className="step">
        <div className="alert alert-busy" role="status">
          <span className="spinner" aria-hidden="true" />Resolving factors…
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="step">
        <div className="alert alert-bad" role="alert">{error ?? 'No data.'}</div>
        <button className="ghost" onClick={onBack}>← Back</button>
      </div>
    )
  }

  // Tender expects supplier EPDs; earlier stages do not. Only warn where the
  // stage actually makes it a shortcoming.
  const epdShortfall = data.stage.epd_expected && data.coverage.pct < 100

  return (
    <div className="step">
      <header className="step-head">
        <h1>Data Check</h1>
        <p>
          These are the emission factors your results will be based on. Nothing
          to fill in — just review them.
        </p>
      </header>

      {/* ── Stage context ───────────────────────────────────────────── */}
      <section className={`panel stage-panel stage-${data.stage.code}`}>
        <div className="panel-head">
          <h2>{data.stage.badge}</h2>
          <span className="band">±{data.stage.uncertainty_pct}%</span>
        </div>
        <p className="hint">{data.stage.description}</p>
        <ul className="expect">
          {data.stage.expectations.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </section>

      {epdShortfall && (
        <div className="alert alert-warn" role="alert">
          <strong>
            {data.coverage.with_epd} of {data.coverage.total} factors are
            supplier EPDs ({data.coverage.pct}%).
          </strong>
          <p>
            At tender stage, supplier-specific data is expected. Generic
            catalogue factors are still valid, but they widen the uncertainty on
            the result. Add EPDs in the Materials step where suppliers are known.
          </p>
        </div>
      )}

      {/* ── What the stages mean ────────────────────────────────────── */}
      <section className="panel">
        <h2>What the lifecycle stages mean</h2>
        <dl className="stages-key">
          <dt>A1–A3</dt><dd>Making the materials</dd>
          <dt>A4</dt><dd>Getting them to site — your Step 4 distances</dd>
          <dt>A5a</dt><dd>Site activity — {data.a5a.factor} kgCO₂e/m² of floor area</dd>
          <dt>A5w</dt>
          <dd>Construction waste — the wasted material&rsquo;s making <em>and</em> delivery,
              i.e. waste % × (A1–A3 + A4)</dd>
        </dl>
      </section>

      {/* ── Concrete ────────────────────────────────────────────────── */}
      <section className="panel">
        <h2>Concrete — A1–A3 per grade assigned</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Grade</th><th>GGBS</th>
                <th className="num">kgCO₂e/kg</th><th className="num">kgCO₂e/m³</th>
                <th className="num">Saving vs 0%</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.concrete.map((c) => (
                <tr key={c.e_id + String(c.ggbs)}>
                  <td>{c.label}</td>
                  <td>{c.ggbs === null ? '—' : `${c.ggbs}%`}</td>
                  <td className="num">
                    {c.a1_a3_kg === null ? <em className="na">(EPD)</em>
                      : c.a1_a3_kg.toFixed(3)}
                  </td>
                  <td className="num">{c.a1_a3_m3.toFixed(1)}</td>
                  <td className="num">
                    {c.saving_pct ? <span className="saving">−{c.saving_pct}%</span> : ''}
                  </td>
                  <td><SourceTag source={c.source} isEpd={c.is_epd} /></td>
                </tr>
              ))}
              {data.concrete.length === 0 && (
                <tr><td colSpan={6} className="empty">
                  No concrete in this run.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Steel & PT ──────────────────────────────────────────────── */}
      <section className="panel">
        <h2>Steel &amp; post-tensioning — A1–A3</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material</th><th>Used as</th>
                <th className="num">kgCO₂e/kg</th><th className="num">Density kg/m³</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.steel.map((s) => (
                <tr key={s.e_id}>
                  <td>{s.label}</td>
                  <td><span className="cat-tag">{s.bucket}</span></td>
                  <td className="num">{s.a1_a3_kg.toFixed(3)}</td>
                  <td className="num">{s.density || '—'}</td>
                  <td><SourceTag source={s.source} isEpd={s.is_epd} /></td>
                </tr>
              ))}
              {data.steel.length === 0 && (
                <tr><td colSpan={5} className="empty">No steel in this run.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Transport & waste recap ─────────────────────────────────── */}
      <section className="panel">
        <h2>Transport &amp; waste as set</h2>
        <div className="two-col">
          <div>
            <h3 className="sub-h3">Delivery distances (A4)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Material</th><th className="num">Sea km</th>
                      <th className="num">Road km</th></tr>
                </thead>
                <tbody>
                  {data.transport.map((t) => (
                    <tr key={t.key}>
                      <td>{t.label}
                        {t.is_override && <span className="moved">edited</span>}</td>
                      <td className="num">{t.sea}</td>
                      <td className="num">{t.road}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="sub-h3">Waste allowances (A5w)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Material</th><th className="num">Waste</th>
                      <th className="num">Factor</th></tr>
                </thead>
                <tbody>
                  {data.waste.map((w) => (
                    <tr key={w.material}>
                      <td>{w.material}
                        {w.is_override && <span className="moved">edited</span>}</td>
                      <td className="num">{w.pct}%</td>
                      <td className="num">×{w.multiplier.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── A5a ─────────────────────────────────────────────────────── */}
      <section className="panel">
        <h2>Site activity estimate (A5a)</h2>
        <div className="a5a-calc" style={{ display: 'inline-block' }}>
          {data.a5a.total_tonnes !== null ? (
            <>
              <strong>
                {data.a5a.area.toLocaleString()} m² × {data.a5a.factor} kgCO₂e/m²
              </strong>
              <span> = {data.a5a.total_tonnes} tCO₂e</span>
            </>
          ) : (
            <span className="hint">Floor area not set — go back to Step 1.</span>
          )}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          {data.a5a.is_override
            ? `Your override — ${data.a5a.factor} kgCO₂e/m² replaces the SEAI default of ${data.a5a.default} for every element and report in this run.`
            : `SEAI default — 70% of the 40 kgCO₂e/m² whole-building figure, reflecting structural scope only.`}
        </p>
      </section>

      {/* ── EPD overrides ───────────────────────────────────────────── */}
      {data.epd_overrides.length > 0 && (
        <section className="panel panel-ok">
          <h2>Your EPD overrides</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Material</th><th className="num">A1–A3</th>
                         <th>Source</th></tr></thead>
              <tbody>
                {data.epd_overrides.map((o) => (
                  <tr key={o.key}>
                    <td>{o.key.split('|||').filter(Boolean).join(' · ')}</td>
                    <td className="num">{o.a1_a3}</td>
                    <td>{o.source || <em className="na">not stated</em>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="hint" style={{ textAlign: 'right' }}>
        Factor database version {data.catalogue_version}
      </p>

      <footer className="step-foot">
        <button type="button" className="ghost" onClick={onBack}>← Back</button>
        <button type="button" className="primary" onClick={onContinue}>
          Continue to Run &amp; Reports →
        </button>
      </footer>
    </div>
  )
}

/** Generic catalogue value vs a supplier EPD — the distinction that decides
 *  data quality, so it is shown rather than left to the reader to infer. */
function SourceTag({ source, isEpd }: { source: string; isEpd: boolean }) {
  return (
    <span className={`factor-tag ${isEpd || source === 'EPD' ? 'epd' : 'generic'}`}>
      {source}
    </span>
  )
}
