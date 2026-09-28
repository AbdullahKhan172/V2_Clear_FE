/**
 * 3D model viewer - the legacy dashboard's viewer, ported.
 *
 * Raw three.js inside a React component rather than react-three-fiber. The
 * legacy viewer is several hundred lines of proven picking, fitting and
 * colour-mapping logic; r3f would have meant re-deriving every one of those
 * behaviours, which is how features get quietly lost. This keeps the working
 * code and changes only how it is mounted.
 *
 * All twelve legacy behaviours are preserved:
 *   orbit with damping · fit-to-view (button and double-click) · three colour
 *   modes · A1-A5 / A1-A3 lifecycle filter · level filter · per-category
 *   toggles with All/None · click to select and highlight · hover tooltip ·
 *   info panel · legend · container-aware resize · real meshes with box fallback
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import ViewerEmpty from './ViewerEmpty'
import {
  CAT_COLORS, NO_DATA, TOTAL_BANDS, buildGeometry, ecHex, emissionColor,
  percentile, resolveCategory, stageIntensity, stageTotal, totalColor,
  type ColorMode, type GeomEl, type StageMode,
} from './colors'

interface Props {
  elements: GeomEl[]
  hasMeshes: boolean
}

interface Picked {
  name: string; cat: string; level: string
  total: number; intensity: number
  w: number; d: number; h: number
}

export default function ModelViewer({ elements, hasMeshes }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Mutable three.js state. Refs, not state: mutating these must never trigger
  // a React render — the animation loop already redraws every frame.
  const sceneRef = useRef<THREE.Scene>()
  const cameraRef = useRef<THREE.PerspectiveCamera>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const controlsRef = useRef<OrbitControls>()
  const meshesRef = useRef<{ mesh: THREE.Mesh; data: GeomEl }[]>([])
  const highlightRef = useRef<THREE.Mesh | null>(null)
  const boundsRef = useRef<{ mn: number[]; mx: number[] } | null>(null)

  const [colorMode, setColorMode] = useState<ColorMode>('total')
  const [stageMode, setStageMode] = useState<StageMode>('a1a5')
  const [level, setLevel] = useState('all')
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Picked | null>(null)
  const [tooltip, setTooltip] = useState<
    { x: number; y: number; html: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(elements.map((g) => g.cat || 'Other'))].sort(), [elements])
  const levels = useMemo(
    () => [...new Set(elements.map((g) => (g.level || '').trim())
      .filter((l) => l && !['None', 'nan', 'N/A'].includes(l)))].sort(),
    [elements])

  // Quantile bands for the "total" ramp, recomputed when the lifecycle filter
  // changes: A1-A3-only totals are smaller, so the bands must move with them.
  const bands = useMemo(() => {
    const vals = elements.map((g) => stageTotal(g, stageMode))
      .filter((v) => v > 0).sort((a, b) => a - b)
    const fb = stageMode === 'a1a3'
      ? [0.01, 0.03, 0.08, 0.15] : [0.02, 0.05, 0.15, 0.3]
    return {
      p25: percentile(vals, 25) || fb[0],
      p50: percentile(vals, 50) || fb[1],
      p75: percentile(vals, 75) || fb[2],
      p90: percentile(vals, 90) || fb[3],
    }
  }, [elements, stageMode])

  /* ── Fit to view ──────────────────────────────────────────────────── */
  const fitView = useCallback(() => {
    const cam = cameraRef.current
    const ctl = controlsRef.current
    if (!cam || !ctl) return

    let mn = [Infinity, Infinity, Infinity]
    let mx = [-Infinity, -Infinity, -Infinity]
    let any = false
    for (const b of meshesRef.current) {
      if (!b.mesh.visible) continue
      const bb = b.mesh.geometry.boundingBox
      if (!bb) continue
      any = true
      mn = [Math.min(mn[0], bb.min.x), Math.min(mn[1], bb.min.y), Math.min(mn[2], bb.min.z)]
      mx = [Math.max(mx[0], bb.max.x), Math.max(mx[1], bb.max.y), Math.max(mx[2], bb.max.z)]
    }
    // Everything filtered out: fall back to the whole model rather than
    // leaving the camera wherever it happened to be.
    if (!any && boundsRef.current) {
      mn = boundsRef.current.mn; mx = boundsRef.current.mx; any = true
    }
    if (!any) return

    const c = [0, 1, 2].map((i) => (mn[i] + mx[i]) / 2)
    const s = [0, 1, 2].map((i) => mx[i] - mn[i])
    const radius = Math.max(Math.hypot(s[0], s[1], s[2]) / 2, 5)

    // Fit the bounding sphere to the NARROWER field of view, so nothing is
    // cropped whatever the panel's aspect ratio or the model's proportions.
    const fovV = (cam.fov * Math.PI) / 180
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * Math.max(cam.aspect, 0.1))
    const dist = (radius / Math.sin(Math.min(fovV, fovH) / 2)) * 1.12

    cam.near = Math.max(dist / 1000, 0.01)
    cam.far = dist + radius * 200
    cam.position.set(c[0] + dist * 0.62, c[1] + dist * 0.48, c[2] + dist * 0.62)
    cam.updateProjectionMatrix()
    ctl.target.set(c[0], c[1], c[2])
    ctl.update()
  }, [])

  /* ── Scene setup ──────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !elements.length) return

    let raf = 0
    try {
      const w = Math.max(container.clientWidth, 10)
      const h = Math.max(container.clientHeight, 10)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xdce6ef)
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000)
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      renderer.setSize(w, h)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      scene.add(new THREE.AmbientLight(0xffffff, 1.0))
      const dl = new THREE.DirectionalLight(0xffffff, 0.3)
      dl.position.set(50, 100, 50)
      scene.add(dl)

      const vals = elements.map((g) => g.total || 0)
        .filter((v) => v > 0).sort((a, b) => a - b)
      const p = {
        p25: percentile(vals, 25) || 0.02, p50: percentile(vals, 50) || 0.05,
        p75: percentile(vals, 75) || 0.15, p90: percentile(vals, 90) || 0.3,
      }

      const built: { mesh: THREE.Mesh; data: GeomEl }[] = []
      let mn = [Infinity, Infinity, Infinity]
      let mx = [-Infinity, -Infinity, -Infinity]
      let failures = 0

      for (const g of elements) {
        // One malformed element must not take the rest of the model with it.
        try {
          const geo = buildGeometry(g)
          const mat = new THREE.MeshLambertMaterial({
            color: totalColor(g.total, p.p25, p.p50, p.p75, p.p90),
            transparent: true, opacity: 0.95, side: THREE.DoubleSide,
          })
          const mesh = new THREE.Mesh(geo, mat)
          scene.add(mesh)
          built.push({ mesh, data: g })
          geo.computeBoundingBox()
          const bb = geo.boundingBox
          if (bb) {
            mn = [Math.min(mn[0], bb.min.x), Math.min(mn[1], bb.min.y), Math.min(mn[2], bb.min.z)]
            mx = [Math.max(mx[0], bb.max.x), Math.max(mx[1], bb.max.y), Math.max(mx[2], bb.max.z)]
          }
        } catch {
          failures++
        }
      }
      if (failures) console.warn(`[viewer] ${failures} element(s) could not be drawn`)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.1
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI

      sceneRef.current = scene
      cameraRef.current = camera
      rendererRef.current = renderer
      controlsRef.current = controls
      meshesRef.current = built
      boundsRef.current = { mn, mx }
      fitView()

      const animate = () => {
        raf = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
      }
      animate()

      // Resize on the CONTAINER, not just the window: this panel changes size
      // when tabs and cards reflow, with no window resize event at all.
      const resize = () => {
        const rw = container.clientWidth, rh = container.clientHeight
        if (rw > 10 && rh > 10) {
          camera.aspect = rw / rh
          camera.updateProjectionMatrix()
          renderer.setSize(rw, rh)
        }
      }
      window.addEventListener('resize', resize)
      const ro = new ResizeObserver(resize)
      ro.observe(container)

      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', resize)
        ro.disconnect()
        controls.dispose()
        built.forEach((b) => {
          b.mesh.geometry.dispose()
          ;(b.mesh.material as THREE.Material).dispose()
        })
        renderer.dispose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
  }, [elements, fitView])

  /* ── Recolour ─────────────────────────────────────────────────────── */
  useEffect(() => {
    for (const b of meshesRef.current) {
      let c: THREE.Color
      if (colorMode === 'per_m3') c = emissionColor(stageIntensity(b.data, stageMode))
      else if (colorMode === 'total') {
        c = totalColor(stageTotal(b.data, stageMode),
                       bands.p25, bands.p50, bands.p75, bands.p90)
      } else {
        const cat = resolveCategory(b.data.cat, b.data.name)
        c = new THREE.Color(CAT_COLORS[cat] ?? CAT_COLORS[b.data.cat] ?? NO_DATA)
      }
      ;(b.mesh.material as THREE.MeshLambertMaterial).color.copy(c)
    }
  }, [colorMode, stageMode, bands])

  /* ── Visibility filters ───────────────────────────────────────────── */
  useEffect(() => {
    for (const b of meshesRef.current) {
      const cat = b.data.cat || 'Other'
      const catOk = !hiddenCats.has(cat)
      const lv = (b.data.level || '').trim()
      const lvOk = level === 'all' || lv.toLowerCase() === level.toLowerCase()
      b.mesh.visible = catOk && lvOk
    }
  }, [hiddenCats, level])

  /* ── Picking ──────────────────────────────────────────────────────── */
  const pickAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const cam = cameraRef.current
    if (!canvas || !cam) return null
    const r = canvas.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1), cam)
    const hits = ray.intersectObjects(
      meshesRef.current.filter((b) => b.mesh.visible).map((b) => b.mesh))
    return hits.length ? hits[0] : null
  }, [])

  const describe = useCallback((g: GeomEl): Picked => ({
    name: g.name, cat: resolveCategory(g.cat, g.name), level: g.level,
    total: stageTotal(g, stageMode), intensity: stageIntensity(g, stageMode),
    w: g.w, d: g.d, h: g.h,
  }), [stageMode])

  function onClick(e: React.MouseEvent) {
    const hit = pickAt(e.clientX, e.clientY)
    if (!hit) return
    const mesh = hit.object as THREE.Mesh
    if (highlightRef.current && highlightRef.current !== mesh) {
      (highlightRef.current.material as THREE.MeshLambertMaterial)
        .emissive.setHex(0x000000)
    }
    ;(mesh.material as THREE.MeshLambertMaterial).emissive.setHex(0x222222)
    highlightRef.current = mesh
    const data = meshesRef.current.find((b) => b.mesh === mesh)?.data
    if (data) setPicked(describe(data))
  }

  function onMove(e: React.MouseEvent) {
    const hit = pickAt(e.clientX, e.clientY)
    const canvas = canvasRef.current
    if (!hit || !canvas) { setTooltip(null); return }
    const data = meshesRef.current.find((b) => b.mesh === hit.object)?.data
    if (!data) { setTooltip(null); return }
    const d = describe(data)
    const r = canvas.getBoundingClientRect()
    const label = stageMode === 'a1a3' ? 'A1–A3' : 'A1–A5'
    setTooltip({
      x: e.clientX - r.left + 12,
      y: e.clientY - r.top - 10,
      html: `<b>${esc(d.name)}</b><br>${esc(d.cat)}` +
        (d.level ? `<br>Level: ${esc(d.level)}` : '') +
        `<br>${label}: ${d.intensity > 0
          ? `${d.intensity.toFixed(1)} kgCO₂e/m³` : 'No EC data'}` +
        (d.total > 0 ? `<br>${d.total.toFixed(3)} tCO₂e` : ''),
    })
  }

  if (error) {
    return <div className="viewer-error">3D viewer failed: {error}</div>
  }
  if (!elements.length) {
    return <ViewerEmpty />
  }

  const stageLabel = stageMode === 'a1a3' ? 'A1–A3' : 'A1–A5'

  return (
    <div className="viewer">
      <div className="viewer-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onClick={onClick}
          onMouseMove={onMove}
          onMouseLeave={() => setTooltip(null)}
          onDoubleClick={fitView}
        />
        {tooltip && (
          <div className="viewer-tip" style={{ left: tooltip.x, top: tooltip.y }}
               dangerouslySetInnerHTML={{ __html: tooltip.html }} />
        )}
        {!hasMeshes && (
          <div className="viewer-badge">
            Simplified boxes — this model carried no tessellated geometry
          </div>
        )}
      </div>

      <aside className="viewer-side">
        <button type="button" className="viewer-fit" onClick={fitView}
                title="Frame the whole model (or double-click the viewer)">
          Fit model to view
        </button>

        <label className="viewer-field">
          <span>Colour by</span>
          <select value={colorMode}
                  onChange={(e) => setColorMode(e.target.value as ColorMode)}>
            <option value="total">Total emission</option>
            <option value="per_m3">Emission intensity (kgCO₂e/m³)</option>
            <option value="category">Element category</option>
          </select>
        </label>

        <label className="viewer-field">
          <span>Lifecycle</span>
          <select value={stageMode}
                  onChange={(e) => setStageMode(e.target.value as StageMode)}>
            <option value="a1a5">A1–A5 (total)</option>
            <option value="a1a3">A1–A3 only</option>
          </select>
        </label>

        {levels.length > 0 && (
          <label className="viewer-field">
            <span>Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="all">All levels</option>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}

        <div className="viewer-field grow">
          <span>Categories</span>
          <div className="viewer-catbtns">
            <button type="button" onClick={() => setHiddenCats(new Set())}>All</button>
            <button type="button"
                    onClick={() => setHiddenCats(new Set(categories))}>None</button>
          </div>
          <div className="viewer-cats">
            {categories.map((c) => (
              <button key={c} type="button"
                      className={`viewer-cat${hiddenCats.has(c) ? ' off' : ''}`}
                      aria-pressed={!hiddenCats.has(c)}
                      onClick={() => setHiddenCats((s) => {
                        const n = new Set(s)
                        n.has(c) ? n.delete(c) : n.add(c)
                        return n
                      })}>
                <i style={{ background: hex(CAT_COLORS[c] ?? NO_DATA) }} />
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="viewer-info">
          {picked ? (
            <>
              <strong>{picked.name}</strong>
              <dl>
                <dt>Category</dt><dd>{picked.cat}</dd>
                {picked.level && <><dt>Level</dt><dd>{picked.level}</dd></>}
                <dt>Total ({stageLabel})</dt>
                <dd>{picked.total > 0
                  ? `${picked.total.toFixed(3)} tCO₂e`
                  : <span className="nodata">No EC data</span>}</dd>
                <dt>Intensity</dt>
                <dd style={{ color: picked.intensity > 0
                  ? ecHex(picked.intensity) : '#94a3b8' }}>
                  {picked.intensity > 0
                    ? `${picked.intensity.toFixed(1)} kgCO₂e/m³` : 'N/A'}
                </dd>
                <dt>Size</dt>
                <dd>{picked.w.toFixed(2)} × {picked.d.toFixed(2)} × {picked.h.toFixed(2)} m</dd>
              </dl>
            </>
          ) : (
            <em>Click an element to see its embodied carbon.</em>
          )}
        </div>

        <Legend mode={colorMode} stageLabel={stageLabel} bands={bands} />
      </aside>
    </div>
  )
}

/* ── Legend ─────────────────────────────────────────────────────────────── */

function Legend({ mode, stageLabel, bands }: {
  mode: ColorMode; stageLabel: string
  bands: { p25: number; p50: number; p75: number; p90: number }
}) {
  if (mode === 'category') {
    return <div className="viewer-legend"><b>Coloured by element category</b></div>
  }
  if (mode === 'total') {
    // A building full of identical members collapses the quantiles - on a real
    // model p25, p50 and p75 all came out at 0.55, which listed the same
    // threshold three times. Duplicate bands are unreachable, so they are
    // dropped rather than shown as three identical rows.
    const seen = new Set<string>()
    const rows: [string, string][] = ([
      [hex(TOTAL_BANDS[0]), `≤ ${bands.p25.toFixed(2)}`],
      [hex(TOTAL_BANDS[1]), `≤ ${bands.p50.toFixed(2)}`],
      [hex(TOTAL_BANDS[2]), `≤ ${bands.p75.toFixed(2)}`],
      [hex(TOTAL_BANDS[3]), `≤ ${bands.p90.toFixed(2)}`],
      [hex(TOTAL_BANDS[4]), `> ${bands.p90.toFixed(2)}`],
    ] as [string, string][])
      .filter(([, label]) => {
        if (seen.has(label)) return false
        seen.add(label); return true
      })
      .concat([[hex(NO_DATA), 'No data']])
    return (
      <div className="viewer-legend">
        <b>Total emission ({stageLabel}), tCO₂e</b>
        {rows.map(([c, l]) => (
          <span key={l}><i style={{ background: c }} />{l}</span>
        ))}
      </div>
    )
  }
  const stops: number[] = []
  for (let v = 400; v <= 700; v += 25) stops.push(v)
  return (
    <div className="viewer-legend">
      <b>Intensity ({stageLabel}), kgCO₂e/m³</b>
      <div className="viewer-ramp">
        {stops.map((v) => <i key={v} style={{ background: ecHex(v) }} />)}
      </div>
      <div className="viewer-ramp-labels"><span>≤400</span><span>550</span><span>≥700</span></div>
      <span><i style={{ background: hex(NO_DATA) }} />No EC data</span>
    </div>
  )
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Element names come from an uploaded file and are therefore untrusted. */
const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
