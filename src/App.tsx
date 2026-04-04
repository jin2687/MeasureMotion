import { useState } from 'react'
import type { ExportData } from './types/sensors'
import MeasurementPage from './components/MeasurementPage'
import VisualizationPage from './components/VisualizationPage'
import HistoryPage from './components/HistoryPage'
import Navigation from './components/common/Navigation'

type Tab = 'measure' | 'history'
type View =
  | { type: 'tab'; tab: Tab }
  | { type: 'viz'; sessionId: string; importedData?: { session: ExportData['session']; processed: ExportData['processed'] } }

export default function App() {
  const [view, setView] = useState<View>({ type: 'tab', tab: 'measure' })

  const currentTab: Tab =
    view.type === 'tab' ? view.tab : 'measure'

  const handleSessionReady = (sessionId: string) => {
    setView({ type: 'viz', sessionId })
  }

  const handleViewSession = (sessionId: string) => {
    setView({ type: 'viz', sessionId })
  }

  const handleImport = (data: ExportData) => {
    setView({
      type: 'viz',
      sessionId: data.session.id,
      importedData: { session: data.session, processed: data.processed },
    })
  }

  const handleBack = () => {
    setView({ type: 'tab', tab: 'history' })
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 max-w-md mx-auto">
      {/* Safe area top spacer */}
      <div className="shrink-0 safe-top bg-slate-900" />

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-hidden">
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
      </main>

      {/* Bottom navigation (hide when viewing visualization) */}
      {view.type === 'tab' && (
        <Navigation
          active={currentTab}
          onChange={(tab) => setView({ type: 'tab', tab })}
        />
      )}
    </div>
  )
}
