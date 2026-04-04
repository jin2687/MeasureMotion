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
  /** Downsample to this many points for performance (default 500). */
  maxPoints?: number
}

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
  const data = downsample(
    samples.map(s => ({
      t:    parseFloat(s.t.toFixed(1)),
      lat:  parseFloat(s.gLateral.toFixed(3)),
      lon:  parseFloat(s.gLongitudinal.toFixed(3)),
      vert: parseFloat(s.gVertical.toFixed(3)),
      tot:  parseFloat(s.gTotal.toFixed(3)),
    })),
    maxPoints,
  )

  if (data.length === 0) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-slate-500 text-sm">
        グラフデータがありません
      </div>
    )
  }

  const tickStyle = { fontSize: 10, fill: '#94a3b8' }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={260}>
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
            labelFormatter={(v) => `${v} s`}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="tot"  name="合計"   stroke="#60a5fa" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="vert" name="上下"   stroke="#4ade80" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="lat"  name="横"     stroke="#fb923c" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="lon"  name="縦"     stroke="#c084fc" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
