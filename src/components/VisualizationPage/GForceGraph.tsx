import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { ProcessedSample } from '../../types/sensors'

interface Props {
  samples: ProcessedSample[]
  maxPoints?: number
}

type GraphMode = 'gforce' | 'speed' | 'heading'

function downsample<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr
  const step = arr.length / maxPts
  const result: T[] = []
  for (let i = 0; i < maxPts; i++) {
    result.push(arr[Math.round(i * step)])
  }
  return result
}

export default function GForceGraph({ samples, maxPoints = 500 }: Props) {
  const [mode, setMode] = useState<GraphMode>('gforce')

  const raw = downsample(samples, maxPoints)
  const data = raw.map(s => ({
    t:       parseFloat(s.t.toFixed(1)),
    tot:     parseFloat(s.gTotal.toFixed(3)),
    vert:    parseFloat(s.gVertical.toFixed(3)),
    lat:     parseFloat(s.gLateral.toFixed(3)),
    lon:     parseFloat(s.gLongitudinal.toFixed(3)),
    speed:   parseFloat((s.speed * 3.6).toFixed(2)),   // km/h
    heading: parseFloat(s.heading.toFixed(1)),
  }))

  if (data.length === 0) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-slate-500 text-sm">
        グラフデータがありません
      </div>
    )
  }

  const tickStyle = { fontSize: 10, fill: '#94a3b8' }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Mode tabs */}
      <div className="flex gap-1">
        {(['gforce', 'speed', 'heading'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-indigo-700 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={250}>
        {mode === 'gforce' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="t"
              label={{ value: '時間 (s)', position: 'insideBottomRight', offset: 0, fill: '#64748b', fontSize: 10 }}
              tick={tickStyle}
              interval="preserveStartEnd"
            />
            <YAxis
              label={{ value: 'G', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              tick={tickStyle}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v, name) => [`${(v as number).toFixed(3)} G`, name as string]}
              labelFormatter={v => `${v} s`}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="tot"  name="合計G"     stroke="#60a5fa" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="vert" name="上下G"     stroke="#4ade80" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="lat"  name="横G"       stroke="#fb923c" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="lon"  name="縦G"       stroke="#c084fc" dot={false} strokeWidth={1.5} />
          </LineChart>
        ) : mode === 'speed' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="t"
              label={{ value: '時間 (s)', position: 'insideBottomRight', offset: 0, fill: '#64748b', fontSize: 10 }}
              tick={tickStyle}
              interval="preserveStartEnd"
            />
            <YAxis
              label={{ value: 'km/h', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              tick={tickStyle}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v, name) => [`${(v as number).toFixed(1)} km/h`, name as string]}
              labelFormatter={v => `${v} s`}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Line type="monotone" dataKey="speed" name="速度 (km/h)" stroke="#38bdf8" dot={false} strokeWidth={2} />
          </LineChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="t"
              label={{ value: '時間 (s)', position: 'insideBottomRight', offset: 0, fill: '#64748b', fontSize: 10 }}
              tick={tickStyle}
              interval="preserveStartEnd"
            />
            <YAxis
              label={{ value: '方位(°)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              tick={tickStyle}
              domain={[0, 360]}
              ticks={[0, 90, 180, 270, 360]}
              tickFormatter={v => ['北', '東', '南', '西', '北'][v / 90] ?? `${v}°`}
            />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v) => [`${(v as number).toFixed(1)}° (${bearingLabel(v as number)})`, '方位']}
              labelFormatter={v => `${v} s`}
            />
            <Line type="monotone" dataKey="heading" name="進行方位" stroke="#a78bfa" dot={false} strokeWidth={2} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

const modeLabels: Record<GraphMode, string> = {
  gforce:  'Gフォース',
  speed:   '速度',
  heading: '方位',
}

function bearingLabel(deg: number): string {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return dirs[Math.round(deg / 45) % 8]
}
