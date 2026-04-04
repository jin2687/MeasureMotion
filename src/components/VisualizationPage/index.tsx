import { useEffect, useState } from 'react'
import type { ProcessedSession, Session } from '../../types/sensors'
import { getSession, getProcessed, getMotionSamples, getOrientationSamples, getGpsSamples } from '../../db/database'
import { processSession } from '../../processing/processor'
import { exportJson, exportCsv } from '../../utils/export'
import TrajectoryViewer from './TrajectoryViewer'
import GForceGraph from './GForceGraph'

interface Props {
  sessionId: string
  onBack: () => void
  /** For externally imported data (no DB session). */
  importedData?: { session: Session; processed: ProcessedSession }
}

export default function VisualizationPage({ sessionId, onBack, importedData }: Props) {
  const [session, setSession]     = useState<Session | null>(importedData?.session ?? null)
  const [processed, setProcessed] = useState<ProcessedSession | null>(importedData?.processed ?? null)
  const [loading, setLoading]     = useState(!importedData)
  const [tab, setTab]             = useState<'3d' | 'graph' | 'stats'>('3d')

  useEffect(() => {
    if (importedData) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const [sess, proc] = await Promise.all([
        getSession(sessionId),
        getProcessed(sessionId),
      ])
      if (cancelled) return
      setSession(sess ?? null)
      if (proc) {
        setProcessed(proc)
      } else if (sess) {
        // Re-process if processed data not cached
        const [motion, orient, gps] = await Promise.all([
          getMotionSamples(sessionId),
          getOrientationSamples(sessionId),
          getGpsSamples(sessionId),
        ])
        if (!cancelled) setProcessed(processSession(sessionId, motion, orient, gps))
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [sessionId, importedData])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        データを読み込み中...
      </div>
    )
  }

  if (!processed) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 text-slate-400 text-sm">
        <p>処理済みデータが見つかりません</p>
        <button onClick={onBack} className="text-indigo-400 underline">戻る</button>
      </div>
    )
  }

  const { samples } = processed

  const handleExportJson = async () => {
    if (!session) return
    exportJson({
      version: 1,
      session,
      processed,
    })
  }

  const handleExportCsv = () => {
    exportCsv(samples, sessionId)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          aria-label="戻る"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{session?.name ?? 'インポートデータ'}</h1>
          <p className="text-xs text-slate-500">
            {session?.startTime ? new Date(session.startTime).toLocaleString('ja-JP') : ''}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 pb-3 shrink-0">
        {(['3d', 'graph', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 pb-4 min-h-0">
        {tab === '3d' && (
          <div className="flex flex-col gap-3">
            <TrajectoryViewer samples={samples} />
            <p className="text-xs text-slate-500 text-center">
              X軸=東, Y軸=上, Z軸=南。色はGフォース強度を示します。
            </p>
          </div>
        )}

        {tab === 'graph' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">Gフォース時系列</h2>
            <div className="bg-slate-800 rounded-2xl p-3">
              <GForceGraph samples={samples} />
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300">統計情報</h2>
            <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3 text-sm">
              <StatRow label="最大G" value={`${processed.peakG.toFixed(3)} G`} highlight />
              <StatRow label="平均G" value={`${processed.avgG.toFixed(3)} G`} />
              <StatRow label="計測時間" value={`${processed.duration.toFixed(1)} 秒`} />
              <StatRow label="サンプル数" value={samples.length.toLocaleString()} />
              <StatRow label="GPS基点緯度" value={processed.originLat?.toFixed(6) ?? 'なし'} />
              <StatRow label="GPS基点経度" value={processed.originLng?.toFixed(6) ?? 'なし'} />
            </div>

            <h2 className="text-sm font-semibold text-slate-300 mt-2">エクスポート</h2>
            <div className="flex gap-3">
              <button
                onClick={handleExportJson}
                className="flex-1 py-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
              >
                JSON ダウンロード
              </button>
              <button
                onClick={handleExportCsv}
                className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
              >
                CSV ダウンロード
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium font-mono ${highlight ? 'text-yellow-400 text-base' : 'text-slate-200'}`}>
        {value}
      </span>
    </div>
  )
}

const tabLabels = { '3d': '3D軌跡', graph: 'Gグラフ', stats: '統計・出力' }
