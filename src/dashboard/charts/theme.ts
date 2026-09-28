/**
 * Chart theme - one place, so seven charts read as one system.
 *
 * The palettes below were validated with the dataviz skill's own script against
 * THIS dashboard's surface (#ffffff, not the skill's default #fcfcfb):
 *
 *   MATERIALS  5 categorical, adjacent pairlist (bars and stacks)
 *     CVD separation      worst pair ΔE 9.1  (target >= 8)     PASS
 *     Normal-vision floor worst pair ΔE 19.6 (floor  >= 15)    PASS
 *     Contrast vs surface aqua 2.82, yellow 2.17, magenta 2.69  WARN
 *
 *   STAGES  ordinal blue ramp, single hue, monotone lightness   PASS
 *
 * That contrast WARN is an OBLIGATION, not a note: three series sit below 3:1
 * on white, so every mark carries a visible value label. It is why
 * `directLabel` is on by default rather than optional.
 *
 * Hues are assigned in the palette's fixed slot order and never cycled. A ninth
 * series would fold into "Other" rather than get a generated colour - but the
 * engine only ever emits five material buckets, so that case cannot arise here.
 */

/** Categorical slots, in fixed order. Do not reorder: the ordering IS the
 *  colourblind-safety mechanism that was validated. */
export const SERIES = [
  '#2a78d6',  // 1 blue
  '#eb6834',  // 2 orange
  '#1baf7a',  // 3 aqua
  '#eda100',  // 4 yellow
  '#e87ba4',  // 5 magenta
  '#008300',  // 6 green
  '#4a3aa7',  // 7 violet
  '#e34948',  // 8 red
]

/** Materials always take the same slot regardless of which appear in a run.
 *  Colour follows the ENTITY, never its rank - filtering a project must not
 *  repaint the materials that remain. */
export const MATERIAL_COLOR: Record<string, string> = {
  'Concrete': SERIES[0],
  'Rebar': SERIES[1],
  'Steel Section': SERIES[2],
  'Post Tensioning': SERIES[3],
  'Timber': SERIES[4],
}

/** Lifecycle stages are an ORDERED sequence, not independent identities, so
 *  they get an ordinal ramp of one hue rather than categorical slots.
 *  Dark to light as the stages progress: A1-A3 usually dominates. */
export const STAGE_COLOR: Record<string, string> = {
  'A1-A3': '#184f95',
  'A4': '#2a78d6',
  'A5': '#86b6ef',
}

/** Ink and chrome. Text never wears a series colour - a coloured mark beside a
 *  label carries the identity instead. */
export const INK = {
  primary: '#1e293b',
  secondary: '#64748b',
  muted: '#94a3b8',
  grid: '#eef1f5',
  axis: '#cbd5e1',
  surface: '#ffffff',
}

export const materialColor = (name: string, i: number) =>
  MATERIAL_COLOR[name] ?? SERIES[i % SERIES.length]

/** Shared axis, grid and tooltip options. Grid and axes are deliberately
 *  recessive - the data should be the only thing with weight. */
export const baseOption = {
  textStyle: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
  tooltip: {
    trigger: 'item' as const,
    // The chart host clips its own overflow, so a tooltip near an edge would be
    // cut off if it rendered inside the container.
    appendToBody: true,
    backgroundColor: 'rgba(15,23,42,.94)',
    borderWidth: 0,
    padding: [8, 11] as [number, number],
    textStyle: { color: '#fff', fontSize: 12 },
    extraCssText: 'border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);',
  },
}

export const valueAxis = (name?: string) => ({
  type: 'value' as const,
  name,
  nameTextStyle: { color: INK.muted, fontSize: 11, padding: [0, 0, 0, 0] },
  axisLabel: { color: INK.muted, fontSize: 11 },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: INK.grid } },
})

export const categoryAxis = (data: string[]) => ({
  type: 'category' as const,
  data,
  axisLabel: { color: INK.secondary, fontSize: 11, width: 130, overflow: 'truncate' },
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
})

/** 4px rounded data-end, anchored to the baseline. Horizontal bars round on
 *  the right; a stacked segment rounds only at the outer end. */
export const BAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0]

/** Chart height that grows with the number of rows, so labels never collide -
 *  a fixed height with many categories is the commonest layout failure. */
export const rowHeight = (n: number, min = 140) =>
  Math.max(min, n * 30 + 44)

export const fmtTon = (v: number) =>
  `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e`

export const fmtKg = (v: number) =>
  `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} kgCO₂e`
