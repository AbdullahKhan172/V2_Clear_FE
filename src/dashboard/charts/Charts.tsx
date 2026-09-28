/**
 * The chart set. Every form here is "magnitude by identity" with text labels,
 * which is what horizontal bars are for - long category names read straight,
 * and no rotated axis labels.
 *
 * Two rules the dataviz validation imposed on this palette:
 *   - every mark carries a visible value label (three series sit below 3:1 on
 *     white, so colour alone cannot carry the value)
 *   - a legend is present for >= 2 series, so identity is never colour-alone
 */

import { useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  BAR_RADIUS, INK, SERIES, STAGE_COLOR, baseOption, categoryAxis, fmtTon,
  materialColor, rowHeight, valueAxis,
} from './theme'

/**
 * ECharts that re-measures when its own container changes.
 *
 * echarts-for-react listens to WINDOW resize only. A chart whose card changes
 * width for any other reason keeps the geometry it was first laid out with and
 * goes on drawing its axis labels where they used to fit - which, in a CSS grid
 * that reflows when the 3D viewer finishes loading, meant labels rendered
 * hundreds of pixels outside their card. Observing the container is the only
 * thing that catches that, so every chart here mounts through this rather than
 * using ReactECharts directly.
 */
function Chart({ option, height }: {
  option: Record<string, unknown>; height: number
}) {
  const chart = useRef<ReactECharts>(null)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let settle = 0
    const fit = () => {
      // Resize with EXPLICIT dimensions rather than letting ECharts re-read the
      // DOM. A bare resize() was leaving the root SVG correctly sized while the
      // chart contents kept the previous layout - axis ticks painted for a
      // 1416px box inside an 1116px one. Passing the measured width removes
      // that read from the equation entirely.
      // Throws if the instance is already disposed, which a resize landing
      // during unmount will do.
      try {
        const inst = chart.current?.getEchartsInstance()
        if (inst && el.clientWidth > 0) {
          inst.resize({ width: el.clientWidth, height })
        }
      } catch { /* gone */ }
    }
    const ro = new ResizeObserver(() => {
      // A CSS-grid reflow settles over several frames, and ECharts debounces
      // its own resize on top of that. Measuring only on the first callback
      // leaves the chart sized for a box it no longer occupies, drawing its
      // axis labels where they used to fit. Re-fit on the next frame and again
      // once the reflow has certainly finished.
      fit()
      requestAnimationFrame(fit)
      window.clearTimeout(settle)
      settle = window.setTimeout(fit, 350)
    })
    ro.observe(el)
    return () => { window.clearTimeout(settle); ro.disconnect() }
  }, [])

  return (
    // overflow:hidden is the guarantee, not the fix: the observer above keeps
    // the layout correct in normal use, but a chart repainting mid-reflow must
    // never be able to draw over the card next to it. Tooltips escape this via
    // appendToBody in the shared tooltip config.
    <div ref={host} style={{ overflow: 'hidden' }}>
      <ReactECharts ref={chart} style={{ height }} opts={{ renderer: 'svg' }}
                    option={option} />
    </div>
  )
}


/** A titled chart card with a consistent header and optional note. */
export function ChartCard({ title, note, children, wide }: {
  title: string; note?: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <section className={`chart-card${wide ? ' wide' : ''}`}>
      <h3>{title}</h3>
      {note && <p className="chart-note">{note}</p>}
      <div className="chart-body">{children}</div>
    </section>
  )
}

export function EmptyChart({ message }: { message: string }) {
  return <p className="chart-empty">{message}</p>
}

/* ── Horizontal bar: magnitude by identity ──────────────────────────────── */

interface BarDatum { key: string; value: number; color?: string }

export function HBar({ data, unit = 'tCO₂e', decimals = 2, color }: {
  data: BarDatum[]; unit?: string; decimals?: number; color?: string
}) {
  if (!data.length) return <EmptyChart message="Nothing to show." />

  // Biggest at the top. ECharts draws a category axis bottom-up, so the array
  // is reversed rather than the data being re-sorted the wrong way.
  const rows = [...data].reverse()

  const fmt = (v: number) =>
    v.toLocaleString(undefined, { maximumFractionDigits: decimals })

  // containLabel reserves room for AXIS labels only — series labels sit outside
  // it, so the longest bar's value was being clipped by the card edge. Reserve
  // the widest label's own width instead of a fixed guess.
  const widest = Math.max(...rows.map((d) => fmt(d.value).length), 1)
  const rightPad = Math.ceil(widest * 6.6) + 14

  return (
    <Chart
      height={rowHeight(data.length)}
      option={{
        ...baseOption,
        grid: { ...baseOption.grid, right: rightPad },
        tooltip: {
          ...baseOption.tooltip,
          formatter: (p: { name: string; value: number }) =>
            `${p.name}<br/><b>${fmt(p.value)}</b> ${unit}`,
        },
        xAxis: valueAxis(),
        yAxis: categoryAxis(rows.map((d) => d.key)),
        series: [{
          type: 'bar',
          data: rows.map((d) => ({
            value: d.value,
            itemStyle: {
              color: d.color ?? color ?? materialColor(d.key, 0),
              borderRadius: BAR_RADIUS,
            },
          })),
          barMaxWidth: 18,
          // Required by the contrast relief rule, not decoration.
          label: {
            show: true, position: 'right', color: INK.secondary, fontSize: 11,
            formatter: (p: { value: number }) => fmt(p.value),
          },
        }],
      }}
    />
  )
}

/* ── Stacked bar: parts of one whole ────────────────────────────────────── */

/** A single 100%-wide bar split by lifecycle stage. One bar rather than a pie:
 *  three ordered parts compare far better along a common baseline. */
export function StageBar({ stages, total }: {
  stages: Record<string, number>; total: number
}) {
  const order = ['A1-A3', 'A4', 'A5']
  const present = order.filter((k) => (stages[k] ?? 0) !== 0)
  if (!present.length || total <= 0) {
    return <EmptyChart message="No staged emissions." />
  }

  return (
    <Chart
      height={132}
      option={{
        ...baseOption,
        grid: { left: 8, right: 8, top: 4, bottom: 34, containLabel: true },
        legend: {
          bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10,
          textStyle: { color: INK.secondary, fontSize: 11 },
        },
        tooltip: {
          ...baseOption.tooltip,
          trigger: 'item',
          formatter: (p: { seriesName: string; value: number }) =>
            `${p.seriesName}<br/><b>${p.value.toFixed(2)}</b> tCO₂e · ` +
            `${((p.value / total) * 100).toFixed(1)}%`,
        },
        xAxis: { ...valueAxis(), show: false, max: total },
        yAxis: { type: 'category', data: [''], axisLine: { show: false },
                 axisTick: { show: false }, axisLabel: { show: false } },
        series: present.map((k, i) => ({
          name: k,
          type: 'bar',
          stack: 'stage',
          data: [stages[k]],
          barMaxWidth: 34,
          itemStyle: {
            color: STAGE_COLOR[k],
            // 2px surface gap between segments, so adjacent fills read as
            // separate parts rather than one blended band.
            borderColor: INK.surface,
            borderWidth: 2,
            borderRadius: i === 0 ? [4, 0, 0, 4]
              : i === present.length - 1 ? [0, 4, 4, 0] : 0,
          },
          label: {
            show: true, position: 'inside', color: '#fff',
            fontSize: 11, fontWeight: 600,
            formatter: (p: { value: number }) =>
              (p.value / total) > 0.08
                ? `${((p.value / total) * 100).toFixed(0)}%` : '',
          },
        })),
      }}
    />
  )
}

/* ── Grouped bar: material x stage ──────────────────────────────────────── */

/** Where each material's carbon sits across the lifecycle. Grouped rather than
 *  stacked: the question is "how does A4 compare between materials", which a
 *  common baseline answers and a stack does not. */
export function MaterialStageBar({ rows }: {
  rows: { key: string; a1_a3: number; a4: number; a5: number }[]
}) {
  if (!rows.length) return <EmptyChart message="Nothing to show." />
  const stages: [string, keyof (typeof rows)[0]][] = [
    ['A1-A3', 'a1_a3'], ['A4', 'a4'], ['A5', 'a5'],
  ]
  const cats = [...rows].reverse()

  return (
    <Chart
      height={rowHeight(rows.length * 1.7, 190)}
      option={{
        ...baseOption,
        grid: { left: 8, right: 30, top: 8, bottom: 34, containLabel: true },
        legend: {
          bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10,
          textStyle: { color: INK.secondary, fontSize: 11 },
        },
        tooltip: {
          ...baseOption.tooltip, trigger: 'axis',
          axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,.04)' } },
          valueFormatter: (v: number) =>
            `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e`,
        },
        // No axis NAME here: ECharts anchors it past the axis end, outside
        // what `containLabel` reserves, so it overhangs the card. The unit
        // belongs in the card note, which is where the reader looks anyway.
        xAxis: valueAxis(),
        yAxis: categoryAxis(cats.map((r) => r.key)),
        series: stages.map(([label, field]) => ({
          name: label,
          type: 'bar',
          // Tonnes, matching every other figure on the page. The breakdown
          // arrives in kg; mixing units across one dashboard is a misread
          // waiting to happen.
          data: cats.map((r) => (Number(r[field]) || 0) / 1000),
          barMaxWidth: 11,
          itemStyle: { color: STAGE_COLOR[label], borderRadius: BAR_RADIUS },
        })),
      }}
    />
  )
}

/* ── Two-part split ─────────────────────────────────────────────────────── */

export function SplitBar({ a, b, labelA, labelB }: {
  a: number; b: number; labelA: string; labelB: string
}) {
  const total = a + b
  if (total <= 0) return <EmptyChart message="Nothing to split." />
  return (
    <div className="split">
      <div className="split-track">
        <span className="split-a" style={{ width: `${(a / total) * 100}%` }} />
        <span className="split-b" style={{ width: `${(b / total) * 100}%` }} />
      </div>
      <div className="split-keys">
        <span><i className="key key-a" />{labelA}
          <strong>{fmtTon(a)}</strong>
          <em>{((a / total) * 100).toFixed(1)}%</em></span>
        <span><i className="key key-b" />{labelB}
          <strong>{fmtTon(b)}</strong>
          <em>{((b / total) * 100).toFixed(1)}%</em></span>
      </div>
    </div>
  )
}

/**
 * Carbon against cost, by structural system — the value-engineering view.
 *
 * A scatter is the right form here and a bar is not: the question is a
 * TRADE-OFF between two independent quantities, and lower-left is the answer.
 * Every point is labelled, because the identity of a system is the whole point
 * and nobody should have to read it off a legend swatch.
 *
 * The current run is drawn as a distinct, larger mark and is the only point
 * with no cost — a real project's cost is not something this tool knows — so it
 * is pinned to the carbon axis at the case-study average cost and labelled as
 * carbon-only, rather than being silently placed at zero.
 */
export function CostVsCarbon({ rows, note }: {
  rows: { system: string | null; per_sqm: number; cost: number | null
          is_current: boolean }[]
  note?: string
}) {
  const priced = rows.filter((r) => r.cost !== null)
  if (!priced.length) return <EmptyChart message="No benchmark systems." />

  const current = rows.find((r) => r.is_current)
  const avgCost = priced.reduce((s, r) => s + (r.cost as number), 0) / priced.length

  const bench = priced.filter((r) => !r.is_current).map((r) => ({
    name: r.system ?? 'System',
    value: [r.cost as number, r.per_sqm],
  }))

  const series: Record<string, unknown>[] = [{
    name: 'Case study systems',
    type: 'scatter',
    symbolSize: 15,
    itemStyle: { color: SERIES[0], opacity: 0.85 },
    data: bench,
    label: {
      show: true, position: 'right', fontSize: 11, color: INK.secondary,
      formatter: (p: { name: string }) => p.name,
    },
  }]

  if (current) {
    series.push({
      name: 'This run',
      type: 'scatter',
      symbol: 'diamond',
      symbolSize: 22,
      itemStyle: { color: SERIES[1], borderColor: '#fff', borderWidth: 2 },
      data: [{ name: current.system ?? 'This run',
               value: [avgCost, current.per_sqm] }],
      label: {
        show: true, position: 'top', fontSize: 11, fontWeight: 600,
        color: SERIES[1],
        formatter: () => 'This run',
      },
      // A dashed guide at the run's intensity, so it reads against every
      // benchmark rather than only against the nearest point.
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { color: SERIES[1], type: 'dashed', width: 1 },
        label: { show: false },
        data: [{ yAxis: current.per_sqm }],
      },
    })
  }

  return (
    <>
      <Chart
        height={360}
        option={{
          ...baseOption,
          // Room on the right for the longest system name drawn beside its
          // point, and on top for the 'This run' label above its marker.
          grid: { left: 8, right: 132, top: 34, bottom: 26, containLabel: true },
          tooltip: {
            ...baseOption.tooltip,
            formatter: (p: { seriesName: string; name: string
                             value: [number, number] }) =>
              p.seriesName === 'This run'
                ? `<b>${p.name}</b><br/>${p.value[1]} kgCO₂e/m²`
                  + '<br/><span style="opacity:.7">cost not known for your run'
                  + '</span>'
                : `<b>${p.name}</b><br/>${p.value[1]} kgCO₂e/m²`
                  + `<br/>€${p.value[0]}/m²`,
          },
          // Two quantitative axes, so the unit belongs centred ALONGSIDE each
          // axis rather than at its end, where ECharts would hang it outside
          // the grid and over the plot.
          xAxis: {
            ...valueAxis('Cost €/m²'), scale: true,
            nameLocation: 'middle', nameGap: 28,
          },
          // Centring the Y name puts it a fixed gap LEFT of the tick labels,
          // which `containLabel` does not reserve for - it overhung the card.
          // Anchored at the axis top instead, it sits in the padding the grid
          // already has.
          yAxis: {
            ...valueAxis('kgCO₂e/m²'), scale: true,
            nameLocation: 'end', nameGap: 14,
            nameTextStyle: { color: INK.muted, fontSize: 11, align: 'left' },
          },
          series,
        }}
      />
      <p className="chart-note">
        {note ?? 'Lower-left is cheaper and lower-carbon.'}
        {current && (
          <> Your run is placed at the case-study average cost — the tool does
             not know your project&rsquo;s cost, so only its height is a
             measurement.</>
        )}
      </p>
    </>
  )
}
