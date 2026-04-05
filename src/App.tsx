import { useState, lazy, Suspense } from 'react'
import type { ExportData } from './types/sensors'
import MeasurementPage from './components/MeasurementPage'
import Navigation from './components/common/Navigation'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Lazy-load heavy pages so Three.js / Recharts don't block first paint
const VisualizationPage = lazy(() => import('./components/VisualizationPage'))
const HistoryPage        = lazy(() => import('./components/HistoryPage'))

type Tab = 'measure' | 'history'
type View =
  | { type: 'tab'; tab: Tab }
  | { type: 'viz'; sessionId: string; importedData?: { session: ExportData['session']; processed: ExportData['processed'] } }

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-slate-600 border-t-indigo-400 animate-spin"
          style={{ animation: 'spin 0.8s linear infinite' }}
        />
        <span className="text-slate-500 text-sm">読み込み中...</span>
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>({ type: 'tab', tab: 'measure' })

  const currentTab: Tab = view.type === 'tab' ? view.tab : 'measure'

  const handleSessionReady = (sessionId: string) =>
    setView({ type: 'viz', sessionId })

  const handleViewSession = (sessionId: string) =>
    setView({ type: 'viz', sessionId })

  const handleImport = (data: ExportData) =>
    setView({
      type: 'viz',
      sessionId: data.session.id,
      importedData: { session: data.session, processed: data.processed },
    })

  const handleBack = () => setView({ type: 'tab', tab: 'history' })

  return (
    <div className="flex flex-col h-full bg-slate-900 max-w-md mx-auto">
      {/* iOS safe-area top spacer */}
      <div className="shrink-0 safe-top bg-slate-900" />

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary>
          <Suspense fallback={<PageSpinner />}>
            {view.type === 'viz' ? (
              <VisualizationPage
                sessionId={view.sessionId}
                onBack={handleBack}
                importedData={view.importedData}
              />
            ) : view.tab === 'measure' ? (
              <MeasurementPage onSessionReady={handleSessionReady} />
            ) : (
              <HistoryPage onView={handleViewSession} onImport={handleImport} />
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Bottom nav – hidden while viewing visualization */}
      {view.type === 'tab' && (
        <Navigation
          active={currentTab}
          onChange={(tab) => setView({ type: 'tab', tab })}
        />
      )}
    </div>
  )
}
