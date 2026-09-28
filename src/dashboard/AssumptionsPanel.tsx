/**
 * Assumptions & methodology - a slide-over listing every value the result was
 * built from.
 *
 * This panel is the zero-blackboxing commitment made concrete: a carbon figure
 * is only as good as the assumptions behind it, so every one of them is stated
 * here, read back from what was actually applied rather than from the defaults.
 */

import type { DashboardResponse } from '../api'

export default function AssumptionsPanel({ data, open, onClose }: {
  data: DashboardResponse; open: boolean; onClose: () => void
}) {
  const project = (data.project ?? {}) as Record<string, string | number>
  const area = Number(project.area) || 0
  // Absent on a run calculated before the methodology block was served; every
  // section that uses it is guarded rather than rendering blanks.
  const m = data.methodology

  return (
    <>
      <div className={`panel-scrim${open ? ' show' : ''}`} onClick={onClose} />
      <aside className={`slide-panel${open ? ' open' : ''}`}
             role="dialog" aria-modal={open} aria-label="Assumptions and methodology">
        <header className="slide-head">
          <h2>Assumptions &amp; methodology</h2>
          <button type="button" className="dash-btn" onClick={onClose}>Close</button>
        </header>

        <div className="slide-body">
          <Section title="Scope">
            <Row k="Assessed" v="Upfront carbon, A1–A5, structural scope only" />
            <Row k="Design stage" v={`${data.stage_label} · ±${data.uncertainty_pct}%`} />
            <Row k="Floor area (GIA)"
                 v={area ? `${area.toLocaleString()} m²` : 'not set'} />
            <Row k="Factor database" v={data.catalogue_version} />
            <p className="slide-note">
              The uncertainty band is a <em>display</em> qualifier from the design
              stage. It never changes the calculated figure — it states how much
              confidence the stage warrants.
            </p>
          </Section>

          <Section title="What each stage covers">
            <Row k="A1–A3" v="Making the materials (product stage)" />
            <Row k="A4" v="Transport to site, using the distances below" />
            <Row k="A5a" v={`Site activity — ${data.a5a_factor} kgCO₂e per m² of floor area`} />
            <Row k="A5w" v="Construction waste — waste % × (A1–A3 + A4)" />
            <p className="slide-note">
              A5a totals <strong>{data.a5a_ton} tCO₂e</strong> here. The SEAI
              figure for a whole building is 40 kgCO₂e/m²; this assessment covers
              the structure only, so 70% (28) is the default.
            </p>
          </Section>

          {data.concrete_specs_used.length > 0 && (
            <Section title="Concrete applied">
              <table className="slide-table">
                <thead><tr><th>Element</th><th>Grade</th>
                  <th className="num">GGBS</th>
                  <th className="num">kgCO₂e/kg</th></tr></thead>
                <tbody>
                  {data.concrete_specs_used.map((c, i) => (
                    <tr key={i}>
                      <td>{c.element}</td><td>{c.grade}</td>
                      <td className="num">{c.ggbs_pct}%</td>
                      <td className="num">{Number(c.a1_a3).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="slide-note">
                Read back from the factors actually in the bill of quantities, not
                from the Materials dropdown — a per-element override or a grade
                carried in the uploaded file re-maps it.
              </p>
            </Section>
          )}

          <Section title="Emission factors applied">
            <table className="slide-table">
              <thead><tr><th>Material</th><th>Factor</th>
                <th className="num">A1–A3</th>
                <th className="num">Density</th><th>Type</th></tr></thead>
              <tbody>
                {data.emission_factors_used.map((f, i) => (
                  <tr key={`${f.e_id}-${i}`}>
                    <td>{f.material}</td>
                    <td className="cell-wide">{f.name}</td>
                    <td className="num">{Number(f.a1_a3).toFixed(3)}</td>
                    <td className="num">
                      {f.density ? Number(f.density).toLocaleString()
                        : <em className="na">—</em>}
                    </td>
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
          </Section>

          {data.rebar_rates_used.length > 0 && (
            <Section title="Reinforcement rates">
              <table className="slide-table">
                <thead><tr><th>Element</th><th className="num">kg/m³</th></tr></thead>
                <tbody>
                  {data.rebar_rates_used
                    .filter((r) => !r.element.includes('|||'))
                    .map((r, i) => (
                      <tr key={i}>
                        <td className="cell-wide">{r.element}</td>
                        <td className="num">{r.rate_kg_m3}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="slide-note">
                Rate-based reinforcement, applied to concrete volume. Elements with
                modelled rebar, or a factor that already prices its own
                reinforcement, are excluded so the steel is never counted twice.
              </p>
            </Section>
          )}

          {data.transport?.length > 0 && (
            <Section title="Transport distances (A4)">
              <table className="slide-table">
                <thead><tr><th>Material</th><th className="num">Sea km</th>
                  <th className="num">Road km</th></tr></thead>
                <tbody>
                  {data.transport.map((t) => (
                    <tr key={t.key}>
                      <td>{t.label}{t.is_override &&
                        <span className="moved">edited</span>}</td>
                      <td className="num">{t.sea}</td>
                      <td className="num">{t.road}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="slide-note">
                SEAI Table 2 scenarios. Road carbon includes the empty return
                leg — a lorry burns fuel going back.
                {m && (
                  <>
                    {' '}Table 3 factors, kgCO₂e per kg·km:{' '}
                    <strong>{m.transport.road_outward}</strong> road outward
                    {' '}+ <strong>{m.transport.road_return}</strong> return,
                    {' '}<strong>{m.transport.sea}</strong> sea.
                  </>
                )}
              </p>
            </Section>
          )}

          {data.waste?.length > 0 && (
            <Section title="Waste allowances (A5w)">
              <table className="slide-table">
                <thead><tr><th>Material</th><th className="num">Waste</th>
                  <th className="num">Factor</th></tr></thead>
                <tbody>
                  {data.waste.map((w) => (
                    <tr key={w.material}>
                      <td>{w.material}{w.is_override &&
                        <span className="moved">edited</span>}</td>
                      <td className="num">{w.pct}%</td>
                      <td className="num">×{w.multiplier.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="slide-note">
                Wasted material still had to be made and delivered, so its waste
                carbon carries both stages.
              </p>
            </Section>
          )}

          {m && (
            <Section title="How each figure is calculated">
              <Row k="Method basis" v={m.standard} />
              <p className="formula">
                <b>A1–A3</b> = factor (kgCO₂e/kg) × mass (kg).
                Concrete mass = volume × {m.densities.concrete} kg/m³;
                steel and PT = supplied mass, or volume × {m.densities.steel}.
              </p>
              <p className="formula">
                <b>A4</b> = mass × sea km × {m.transport.sea}
                {' '}+ mass × road km × ({m.transport.road_outward} outward
                {' '}+ {m.transport.road_return} return).
              </p>
              <p className="formula">
                <b>A5w</b> = waste % × (A1–A3 + A4) — wasted material still had
                to be made <em>and</em> delivered before being discarded.
              </p>
              <p className="formula">
                <b>A5a</b> = {m.a5a.factor} kgCO₂e/m² × GIA, allocated{' '}
                {m.a5a.distribution}. SEAI quotes{' '}
                {m.a5a.whole_building} kgCO₂e/m² for a whole building; this
                assessment is structural scope only, so{' '}
                {m.a5a.structural_share_pct}% of it applies.
              </p>
              <p className="formula">
                <b>Social cost</b> = total tCO₂e × €{m.social_cost_per_ton}, a
                policy shadow price rather than a price anyone pays.
              </p>
            </Section>
          )}

          <Section title="What is excluded">
            <ul className="slide-list">
              <li>Operational carbon (B stages) and end-of-life (C stages) — this
                  is an upfront A1–A5 assessment.</li>
              <li>Non-structural elements: finishes, services, façade systems.</li>
              {data.no_factor.count > 0 && (
                <li>
                  <strong>{data.no_factor.count} element
                  {data.no_factor.count === 1 ? '' : 's'}</strong> with no emission
                  factor ({data.no_factor.volume_m3} m³) contribute zero —{' '}
                  {data.no_factor.categories.join(', ')}.
                </li>
              )}
              {data.sequestration_ton < 0 && (
                <li>
                  Biogenic carbon stored in timber
                  ({Math.abs(data.sequestration_ton).toFixed(2)} tCO₂e) is
                  reported separately per EN 16485 and is <strong>not</strong>{' '}
                  subtracted from the total.
                </li>
              )}
            </ul>
          </Section>

          <Section title="Benchmarks">
            <Row k="SCORS rating" v={`${data.rating} at ${data.per_sqm} kgCO₂e/m²`} />
            <Row k="SCORS B target" v={`${data.budget.target} kgCO₂e/m² — ${
              data.budget.within ? 'met' : 'not met'}`} />
            <Row k="Industry benchmark"
                 v={`${data.benchmark.benchmark} kgCO₂e/m² · this project is ${
                   Math.abs(data.benchmark.diff_pct)}% ${
                   data.benchmark.better ? 'below' : 'above'}`} />
            <Row k="Social cost"
                 v={`€${data.social_cost.cost.toLocaleString()} at €${
                   data.social_cost.price_per_ton}/tCO₂e`} />
          </Section>
        </div>
      </aside>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="slide-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="slide-row">
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  )
}
