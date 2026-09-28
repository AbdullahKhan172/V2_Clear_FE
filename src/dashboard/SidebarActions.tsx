/**
 * The floating sidebar — three tabs pinned to the right edge, as the legacy
 * dashboard had them.
 *
 * Emissions and Assumptions open slide-overs; Value Eng. jumps to the
 * decarbonisation tab. They live outside the page flow on purpose: all three
 * are reachable from anywhere in a very long report, without scrolling back to
 * a header.
 *
 * Hidden below 900px, where a fixed right rail would sit on top of the content
 * it is meant to help you read, and in print, where a floating control is noise
 * on paper.
 */

interface Props {
  onEmissions: () => void
  onAssumptions: () => void
  onValueEngineering: () => void
}

export default function SidebarActions(
  { onEmissions, onAssumptions, onValueEngineering }: Props,
) {
  return (
    <nav className="sidebar-actions" aria-label="Report sections">
      <button type="button" className="sidebar-btn" onClick={onEmissions}
              title="Every priced line, grouped by member">
        <span aria-hidden="true">▤</span> Emissions
      </button>
      <button type="button" className="sidebar-btn" onClick={onAssumptions}
              title="Every value this result was built from">
        <span aria-hidden="true">ⓘ</span> Assumptions
      </button>
      <button type="button" className="sidebar-btn" onClick={onValueEngineering}
              title="Decarbonisation and value engineering">
        <span aria-hidden="true">◈</span> Value Eng.
      </button>
    </nav>
  )
}
