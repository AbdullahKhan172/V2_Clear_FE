/**
 * The dashboard, loaded on demand.
 *
 * ECharts and three.js together are ~1.4 MB, and both live entirely under
 * dashboard/. Importing the shell eagerly made every visitor download the
 * charting and 3D engines before they had even chosen a file - and the
 * dashboard is unreachable until a calculation has finished. Splitting it here
 * keeps the wizard light and starts the download when the user actually
 * crosses into results.
 *
 * Both entry points (App's deep link and Step 6) import THIS module rather than
 * the shell, so they share one chunk instead of pulling in two copies.
 */

import { Suspense, lazy } from 'react'

const DashboardShell = lazy(() => import('./DashboardShell'))

interface Props {
  runId: string
  onBack: () => void
}

export default function LazyDashboard(props: Props) {
  return (
    <Suspense fallback={
      <div className="dash-loading">
        <div className="spinner" />
        <p>Loading the dashboard...</p>
      </div>
    }>
      <DashboardShell {...props} />
    </Suspense>
  )
}
