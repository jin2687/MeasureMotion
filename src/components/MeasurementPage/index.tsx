import { useState, useCallback, useRef } from 'react'
import type { Session } from '../../types/sensors'
import { useSensors } from '../../hooks/useSensors'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useWakeLock } from '../../hooks/useWakeLock'
import {
  saveSession,
  getMotionSamples,
  getOrientationSamples,
  getGpsSamples,
  saveProcessed,
} from '../../db/database'
import { processSession } from '../../processing/processor'
import { uuid } from '../../utils/id'

type Phase = 'idle' | 'recording' | 'processing' | 'done'

interface Props {
  onSessionReady: (sessionId: string) => void
}

export default function MeasurementPage({ onSessionReady }: Props) {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [sessionId, setSessionId]   = useState<string | null>(null)
  const [elapsed, setElapsed]       = useState(0)
  const [sampleCount, setSampleCount] = useState(0)
  const [error, setError]           = useState<string | null>(null)

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef  = useRef<number>(0)
  const sessionIdRef  = useRef<string | null>(null) // mirrors state for use in closures

  // Hooks – note: useSensors/useGeolocation no longer take sessionId as prop;
  // the session ID is passed directly to startListening/startTracking instead.
  const { permState, requestPermission, startListening, stopListening, latest } = useSensors()
  const { startTracking, stopTracking } = useGeolocation()
  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock()

  // ── Start recording ──────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setError(null)

    // 1. iOS permission – must be in user gesture handler
    const perm = await requestPermission()
    if (perm === 'denied') {
      setError('センサーへのアクセスが拒否されました。設定 › Safari › モーションとフィットネスを確認してください。')
      return
    }
    if (perm === 'unsupported') {
      setError('このデバイスは DeviceMotion をサポートしていません。')
      return
    }

    // 2. Create session record in DB
    const id = uuid()
    sessionIdRef.current = id
    const session: Session = {
      id,
      name:          `計測 ${new Date().toLocaleString('ja-JP')}`,
      startTime:     Date.now(),
      endTime:       null,
      status:        'recording',
      sampleCount:   0,
      gpsSampleCount: 0,
    }
    await saveSession(session)

    // 3. Start sensors – pass `id` directly so hooks never see a null sessionId
    startListening(id)   // sets sessionIdRef inside hook synchronously
    startTracking(id)
    await acquireWakeLock()

    // 4. React state update (for display only – sensors are already running)
    setSessionId(id)
    setPhase('recording')
    setSampleCount(0)

    startTimeRef.current = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }, [requestPermission, startListening, startTracking, acquireWakeLock])

  // ── Stop recording ───────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return

    stopListening()
    stopTracking()
    releaseWakeLock()
    if (timerRef.current) clearInterval(timerRef.current)

    // Load what was written
    const [motionSamples, orientSamples, gpsSamples] = await Promise.all([
      getMotionSamples(id),
      getOrientationSamples(id),
      getGpsSamples(id),
    ])

    // Update session metadata
    const updatedSession: Session = {
      id,
      name:          `計測 ${new Date().toLocaleString('ja-JP')}`,
      startTime:     startTimeRef.current,
      endTime:       Date.now(),
      status:        'processing',
      sampleCount:   motionSamples.length,
      gpsSampleCount: gpsSamples.length,
    }
    await saveSession(updatedSession)
    setSampleCount(motionSamples.length)
    setPhase('processing')

    // Run processing pipeline
    const processed = processSession(id, motionSamples, orientSamples, gpsSamples)
    await saveProcessed(processed)
    await saveSession({ ...updatedSession, status: 'done' })
    setPhase('done')
  }, [stopListening, stopTracking, releaseWakeLock])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const handleView = useCallback(() => {
    if (sessionId) onSessionReady(sessionId)
  }, [sessionId, onSessionReady])

  const handleReset = useCallback(() => {
    sessionIdRef.current = null
    setPhase('idle')
    setSessionId(null)
    setElapsed(0)
    setSampleCount(0)
    setError(null)
  }, [])

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return (
    <div className="flex flex-col h-full px-4 py-6 gap-6 overflow-y-auto scrollbar-hide">
      <h1 className="text-2xl font-bold text-white text-center tracking-tight">計測</h1>

      {/* Real-time G-force display */}
      <div className="bg-slate-800 rounded-2xl p-5 grid grid-cols-2 gap-4">
        <GCard label="合計 G"    value={latest.gTotal}        highlight />
        <GCard label="横方向"   value={latest.gLateral} />
        <GCard label="進行方向" value={latest.gLongitudinal} />
        <GCard label="上下方向" value={latest.gVertical} />
      </div>

      {/* Status panel */}
      <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3 text-sm">
        <StatusRow label="センサー権限" value={permLabels[permState]} />
        <StatusRow label="経過時間"     value={formatTime(elapsed)} />
        <StatusRow label="取得サンプル数" value={sampleCount.toLocaleString()} />
        <StatusRow
          label="フェーズ"
          value={phaseLabels[phase]}
          color={
            phase === 'recording'  ? 'text-red-400'    :
            phase === 'done'       ? 'text-green-400'  :
            phase === 'processing' ? 'text-yellow-400' : 'text-slate-300'
          }
        />
      </div>

      {error && (
        <div className="bg-red-900/60 border border-red-500 rounded-xl px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 mt-auto">
        {phase === 'idle' && (
          <button
            onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-400 active:bg-red-600 text-white font-bold text-lg transition-colors"
          >
            計測開始
          </button>
        )}

        {phase === 'recording' && (
          <button
            onClick={handleStop}
            className="w-full py-4 rounded-2xl bg-slate-600 hover:bg-slate-500 text-white font-bold text-lg transition-colors"
          >
            計測終了
          </button>
        )}

        {phase === 'processing' && (
          <div className="w-full py-4 rounded-2xl bg-slate-700 text-slate-400 font-bold text-lg text-center animate-pulse">
            データ処理中...
          </div>
        )}

        {phase === 'done' && (
          <>
            <button
              onClick={handleView}
              className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg transition-colors"
            >
              結果を表示
            </button>
            <button
              onClick={handleReset}
              className="w-full py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium transition-colors"
            >
              新しい計測
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GCard({
  label, value, highlight,
}: {
  label: string; value: number; highlight?: boolean
}) {
  const absV = Math.abs(value)
  const color =
    absV > 3 ? 'text-red-400' :
    absV > 2 ? 'text-yellow-400' : 'text-green-400'

  return (
    <div className="bg-slate-900/60 rounded-xl p-3 flex flex-col items-center gap-1">
      <span className="text-xs text-slate-400 uppercase tracking-widest">{label}</span>
      <span className={`font-mono font-bold ${highlight ? 'text-3xl' : 'text-xl'} ${color}`}>
        {value.toFixed(2)}
      </span>
      <span className="text-xs text-slate-500">G</span>
    </div>
  )
}

function StatusRow({
  label, value, color,
}: {
  label: string; value: string; color?: string
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium ${color ?? 'text-slate-200'}`}>{value}</span>
    </div>
  )
}

const permLabels: Record<string, string> = {
  unknown:     '未確認',
  granted:     '許可済み ✓',
  denied:      '拒否',
  unsupported: '非対応',
}

const phaseLabels: Record<Phase, string> = {
  idle:       '待機中',
  recording:  '● 計測中',
  processing: '処理中',
  done:       '完了',
}
