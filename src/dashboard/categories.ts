/**
 * Display category for an element — pure string logic, no dependencies.
 *
 * Lives in its own module rather than beside the viewer's colour ramps because
 * two very different things need it: the 3D viewer (which imports three.js) and
 * the emissions drawer (which must not). Importing it from viewer/colors.ts
 * dragged three.js into the eagerly-loaded dashboard chunk and undid the code
 * split that keeps a spreadsheet run from downloading a 3D engine it can never
 * use — a 171 kB regression that `tests-browser/verify_split.js` exists to
 * catch.
 */

/**
 * Infer a likely non-structural type from an element's name.
 *
 * Structural categories (Slab/Floor, Beam, Column, …) pass straight through —
 * this only relabels things the IFC categoriser lumped together, so that a
 * curtain wall does not read as a structural wall in the emissions table.
 * Ported from the legacy dashboard's getDisplayCategory().
 */
export function resolveCategory(cat: string, name: string): string {
  const n = (name || '').toLowerCase()
  if (/glaz|curtain|cladding|facade|glazed/.test(n)) return 'Glazing'
  if (/window/.test(n)) return 'Glazing'
  if (/door/.test(n)) return 'Door'
  if (/railing|balustrade|handrail/.test(n)) return 'Railing'
  if (/ceiling|soffit/.test(n)) return 'Ceiling'
  if (/insul/.test(n)) return 'Insulation'
  if (/parapet/.test(n)) return 'Parapet'
  return cat || 'Other'
}
