import { useEffect, useState, useRef } from 'react'
import type { Session, ExportData } from '../../types/sensors'
import { getAllSessions, deleteSession } from '../../db/database'
import { importFile } from '../../utils/export'

interface Props {
  onView:   (sessionId: string) => void
  onImport: (data: ExportData) => void
}

export default function HistoryPage({ onView, onImport }: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading]   = useState(true)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = async () => {
    setLoading(true)
    setSessions(await getAllSessions())
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('この計測データを削除しますか？')) return
    await deleteSession(id)
    reload()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    try {
      const data = await importFile(file)
      onImport(data)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'インポートに失敗しました')
    }
    // Reset input so the same file can be selected again
    e.target.value = ''
  }

  return (
    <div className="flex flex-col h-full px-4 py-6 gap-4 overflow-y-auto scrollbar-hide">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">履歴</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
        >
          インポート
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {importError && (
        <div className="bg-red-900/60 border border-red-500 rounded-xl px-4 py-3 text-sm text-red-200 shrink-0">
          {importError}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          読み込み中...
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onView={() => onView(s.id)}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionCard({
  session, onView, onDelete,
}: {
  session: Session
  onView:   () => void
  onDelete: () => void
}) {
  const date = new Date(session.startTime).toLocaleString('ja-JP')
  const duration = session.endTime
    ? Math.round((session.endTime - session.startTime) / 1000)
    : null

  return (
    <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{session.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{date}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="flex gap-4 text-xs text-slate-400">
        {duration != null && <span>{duration} 秒</span>}
        <span>{session.sampleCount.toLocaleString()} サンプル</span>
        {session.gpsSampleCount > 0 && <span>GPS: {session.gpsSampleCount}</span>}
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onView}
          disabled={session.status !== 'done'}
          className="flex-1 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors"
        >
          表示
        </button>
        <button
          onClick={onDelete}
          className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-red-900 text-slate-300 hover:text-red-300 text-sm transition-colors"
        >
          削除
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const map: Record<Session['status'], { label: string; cls: string }> = {
    recording:  { label: '計測中', cls: 'bg-red-900/60 text-red-300' },
    processing: { label: '処理中', cls: 'bg-yellow-900/60 text-yellow-300' },
    done:       { label: '完了',   cls: 'bg-green-900/60 text-green-300' },
    error:      { label: 'エラー', cls: 'bg-slate-700 text-slate-400' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
      <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm">計測データがありません</p>
      <p className="text-xs">「計測」タブで計測を開始するか、ファイルをインポートしてください</p>
    </div>
  )
}
