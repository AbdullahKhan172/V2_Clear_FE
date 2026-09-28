/**
 * The "no geometry" state, kept in its own module.
 *
 * It lives apart from ModelViewer so AnalysisTab can render it WITHOUT pulling
 * in three.js: a spreadsheet run has no geometry to draw, and downloading a 3D
 * engine to say so would be ~600 kB wasted on every CSV upload.
 */

export default function ViewerEmpty() {
  return (
    <div className="viewer-empty">
      No 3D geometry — this run came from a spreadsheet rather than an IFC model.
    </div>
  )
}
