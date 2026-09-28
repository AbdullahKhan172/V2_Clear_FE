/**
 * 3D viewer colour logic - ported from the legacy dashboard verbatim.
 *
 * These ramps are NOT the dataviz categorical palette, and deliberately so.
 * The charts encode identity across a handful of series; the model encodes
 * MAGNITUDE across thousands of elements at once, where a green-to-red ramp is
 * the convention structural engineers already read. Changing it would make the
 * ported viewer disagree with the HTML report people have been using.
 *
 * The one rule kept from the chart palette: grey (#94a3b8) means "no emission
 * data", never "low". An element that was excluded in Step 2 must look absent
 * from the assessment, not cheap.
 */

import * as THREE from 'three'

/** Category tints, used when colouring by element type rather than carbon. */
export const CAT_COLORS: Record<string, number> = {
  'Column': 0x5a7a9e,
  'Beam': 0x9a6c38,
  'Slab/Floor': 0x4e7d5e,
  'Wall': 0x8a7060,
  'Foundation/Footing': 0x5c5040,
  'Pile': 0x4a5e50,
  'Roof': 0x4d7080,
  'Stair': 0x7a6080,
  'Reinforcement': 0x6a5a50,
  'Post-Tensioning': 0x4a6e6e,
  'Glazing/Curtain Wall': 0x6a9ab4,
  'Door': 0x9a7840,
  'Other': 0x7a8490,
}

export const NO_DATA = 0x94a3b8

/** Refine a category from the element's own name, for items the IFC type
 *  labelled generically. */
// Moved to ../categories so the emissions drawer can use it without pulling
// three.js (and this file) into the eagerly-loaded dashboard chunk. Re-exported
// here so the viewer's own imports are unchanged.
export { resolveCategory } from '../categories'

/* ── Intensity ramp: fixed 25-unit bands from 400 to 700 kgCO2e/m3 ──────── */
// Fixed rather than data-relative on purpose: an absolute scale lets two
// projects be compared, which a per-project normalisation would destroy.
const EC_MIN = 400
const EC_MAX = 700
const EC_ANCHORS: [number, [number, number, number]][] = [
  [400, [0x14, 0x5a, 0x14]],
  [450, [0x1a, 0x7a, 0x1a]],
  [500, [0x5c, 0xb8, 0x5c]],
  [550, [0x90, 0xee, 0x90]],
  [600, [0xf0, 0xe0, 0x20]],
  [625, [0xf5, 0xc0, 0x10]],
  [650, [0xf0, 0x70, 0x10]],
  [675, [0xe0, 0x40, 0x20]],
  [700, [0x8b, 0x00, 0x00]],
]

export function ecInterp(val: number): THREE.Color {
  const first = EC_ANCHORS[0][1]
  const last = EC_ANCHORS[EC_ANCHORS.length - 1][1]
  if (val <= EC_MIN) return new THREE.Color(first[0] / 255, first[1] / 255, first[2] / 255)
  if (val >= EC_MAX) return new THREE.Color(last[0] / 255, last[1] / 255, last[2] / 255)

  let lo = EC_ANCHORS[0]
  let hi = EC_ANCHORS[EC_ANCHORS.length - 1]
  for (let i = 0; i < EC_ANCHORS.length - 1; i++) {
    if (val >= EC_ANCHORS[i][0] && val <= EC_ANCHORS[i + 1][0]) {
      lo = EC_ANCHORS[i]; hi = EC_ANCHORS[i + 1]; break
    }
  }
  const t = (val - lo[0]) / (hi[0] - lo[0])
  return new THREE.Color(
    Math.round(lo[1][0] + t * (hi[1][0] - lo[1][0])) / 255,
    Math.round(lo[1][1] + t * (hi[1][1] - lo[1][1])) / 255,
    Math.round(lo[1][2] + t * (hi[1][2] - lo[1][2])) / 255,
  )
}

export function ecHex(val: number): string {
  const c = ecInterp(val)
  const h = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

export function emissionColor(perM3: number): THREE.Color {
  if (perM3 <= 0) return new THREE.Color(NO_DATA)
  const band = Math.max(EC_MIN, Math.min(EC_MAX, Math.floor(perM3 / 25) * 25))
  return ecInterp(band)
}

/* ── Total ramp: quantile bands within THIS model ───────────────────────── */
// Relative rather than absolute, because a "big" element only means anything
// against the rest of the same building.
export const TOTAL_BANDS = [0x4ade80, 0xa3e635, 0xfbbf24, 0xf97316, 0xef4444]

export function totalColor(t: number, p25: number, p50: number,
                           p75: number, p90: number): THREE.Color {
  if (t <= 0) return new THREE.Color(NO_DATA)
  if (t <= p25) return new THREE.Color(TOTAL_BANDS[0])
  if (t <= p50) return new THREE.Color(TOTAL_BANDS[1])
  if (t <= p75) return new THREE.Color(TOTAL_BANDS[2])
  if (t <= p90) return new THREE.Color(TOTAL_BANDS[3])
  return new THREE.Color(TOTAL_BANDS[4])
}

export function percentile(sorted: number[], p: number): number {
  return sorted.length
    ? sorted[Math.max(0, Math.floor((sorted.length * p) / 100) - 1)] : 0
}

export type StageMode = 'a1a5' | 'a1a3'
export type ColorMode = 'category' | 'per_m3' | 'total'

export interface GeomEl {
  x: number; y: number; z: number
  w: number; d: number; h: number
  cat: string; name: string; level: string
  total: number; a1_a3_t: number; a1_a3_kg: number
  per_m3: number; per_m3_a1a3: number
  v?: number[]; t?: number[]
}

export const stageTotal = (g: GeomEl, mode: StageMode) =>
  mode === 'a1a3' ? Number(g.a1_a3_t || 0) : Number(g.total || 0)

export const stageIntensity = (g: GeomEl, mode: StageMode) =>
  mode === 'a1a3' ? Number(g.per_m3_a1a3 || 0) : Number(g.per_m3 || 0)

/** Real tessellated mesh when the model supplied one, else a box from w/d/h.
 *  The axis swap (y and z) is the legacy convention: IFC is Z-up, three.js
 *  is Y-up. */
export function buildGeometry(g: GeomEl): THREE.BufferGeometry {
  if (g.v && g.t && g.v.length >= 9 && g.t.length >= 3) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(g.v), 3))
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(g.t), 1))
    geo.computeVertexNormals()
    return geo
  }
  const gw = Math.max(g.w, 0.05)
  const gd = Math.max(g.d, 0.05)
  const gh = Math.max(g.h, 0.05)
  const box = new THREE.BoxGeometry(gw, gh, gd)
  box.translate(g.x + gw / 2, g.z + gh / 2, g.y + gd / 2)
  return box
}
