import { useMemo, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { ProcessedSample } from '../../types/sensors'

interface Props {
  samples: ProcessedSample[]
}

// ─── 座標変換: ENU → Three.js (X=East, Y=Up, Z=-North) ─────────────────────
const toVec3 = (s: ProcessedSample) =>
  new THREE.Vector3(s.posEast, s.posUp, -s.posNorth)

// ─── Gフォース → 色 (緑→黄→赤) ──────────────────────────────────────────────
function gColor(g: number): THREE.Color {
  const t = Math.min(Math.max(g, 0) / 4, 1)
  if (t < 0.5) {
    return new THREE.Color().lerpColors(
      new THREE.Color(0x22c55e), new THREE.Color(0xfacc15), t * 2)
  }
  return new THREE.Color().lerpColors(
    new THREE.Color(0xfacc15), new THREE.Color(0xef4444), (t - 0.5) * 2)
}

// ─── 軌跡ライン (THREE.Line — Line2 より iOS 互換性が高い) ──────────────────

function TrajectoryLine({ samples }: { samples: ProcessedSample[] }) {
  const lineObj = useMemo(() => {
    if (samples.length < 2) return null

    const positions = new Float32Array(samples.length * 3)
    const colors    = new Float32Array(samples.length * 3)

    samples.forEach((s, i) => {
      positions.set([s.posEast, s.posUp, -s.posNorth], i * 3)
      const c = gColor(s.gTotal)
      colors.set([c.r, c.g, c.b], i * 3)
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))

    const mat  = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 })
    const line = new THREE.Line(geo, mat)
    line.frustumCulled = false
    return line
  }, [samples])

  useEffect(() => () => {
    lineObj?.geometry.dispose()
    ;(lineObj?.material as THREE.Material | undefined)?.dispose()
  }, [lineObj])

  return lineObj ? <primitive object={lineObj} /> : null
}

// ─── 方向矢印 (コーン) ────────────────────────────────────────────────────────

function DirectionArrows({ samples }: { samples: ProcessedSample[] }) {
  const arrows = useMemo(() => {
    if (samples.length < 2) return []
    const interval = Math.max(1, Math.round(5 / ((samples.at(-1)!.t) / samples.length)))
    const result: { pos: THREE.Vector3; dir: THREE.Vector3; color: THREE.Color }[] = []
    for (let i = interval; i < samples.length - interval; i += interval) {
      const s   = samples[i]
      const dir = new THREE.Vector3(
        Math.sin((s.heading * Math.PI) / 180), 0,
        -Math.cos((s.heading * Math.PI) / 180),
      ).normalize()
      if (dir.lengthSq() < 0.01) continue
      result.push({ pos: toVec3(s), dir, color: gColor(s.gTotal) })
    }
    return result
  }, [samples])

  return (
    <>
      {arrows.map((a, i) => <ArrowCone key={i} {...a} />)}
    </>
  )
}

function ArrowCone({ pos, dir, color }: { pos: THREE.Vector3; dir: THREE.Vector3; color: THREE.Color }) {
  const q = useMemo(() =>
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
  [dir])
  return (
    <mesh position={pos} quaternion={q}>
      <coneGeometry args={[0.4, 1.2, 6]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

// ─── START / GOAL マーカー ────────────────────────────────────────────────────

function PoleMarker({
  position, poleColor, label, labelBg,
}: {
  position: THREE.Vector3
  poleColor: string
  label: string
  labelBg: string
}) {
  const poleH = 3
  return (
    <group position={position}>
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, poleH, 8]} />
        <meshBasicMaterial color={poleColor} />
      </mesh>
      <mesh position={[0, poleH, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color={poleColor} />
      </mesh>
      <Html position={[0, poleH + 1.5, 0]} center distanceFactor={20}>
        <div style={{
          background: labelBg, color: '#fff',
          padding: '2px 8px', borderRadius: 6,
          fontSize: 12, fontWeight: 700,
          whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
        }}>
          {label}
        </div>
      </Html>
    </group>
  )
}

// ─── 方位ラベル (N/E/S/W) ─────────────────────────────────────────────────────

function CompassLabels({ cx, minY, cz, span }: { cx: number; minY: number; cz: number; span: number }) {
  const d = span * 0.88
  const y = minY + 0.3
  const mk = (color: string) => ({
    color, background: '#0f172acc',
    border: `2px solid ${color}`,
    fontSize: 15, fontWeight: 900 as const,
    padding: '3px 9px', borderRadius: 7,
    pointerEvents: 'none' as const, userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const, boxShadow: '0 2px 8px #000a',
  })
  return (
    <>
      <Html position={[cx,     y, cz - d]} center distanceFactor={22}><div style={mk('#60a5fa')}>↑ 北 N</div></Html>
      <Html position={[cx,     y, cz + d]} center distanceFactor={22}><div style={mk('#94a3b8')}>南 S ↓</div></Html>
      <Html position={[cx + d, y, cz    ]} center distanceFactor={22}><div style={mk('#94a3b8')}>東 E →</div></Html>
      <Html position={[cx - d, y, cz    ]} center distanceFactor={22}><div style={mk('#94a3b8')}>← W 西</div></Html>
    </>
  )
}

// ─── 軸線 (N-S / E-W) ────────────────────────────────────────────────────────

function AxisLines({ cx, minY, cz, span }: { cx: number; minY: number; cz: number; span: number }) {
  const linesObj = useMemo(() => {
    const group = new THREE.Group()
    const y = minY + 0.12
    const color = 0x1e40af
    const addLine = (pts: number[]) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))
      line.frustumCulled = false
      group.add(line)
    }
    addLine([cx, y, cz - span,  cx, y, cz,  cx, y, cz + span])
    addLine([cx - span, y, cz,  cx, y, cz,  cx + span, y, cz])
    return group
  }, [cx, minY, cz, span])

  useEffect(() => () => {
    linesObj.children.forEach(c => {
      (c as THREE.Line).geometry.dispose()
      ;((c as THREE.Line).material as THREE.Material).dispose()
    })
  }, [linesObj])

  return <primitive object={linesObj} />
}

// ─── 距離リング ───────────────────────────────────────────────────────────────

function DistanceRings({ cx, minY, cz, span }: { cx: number; minY: number; cz: number; span: number }) {
  const { groupObj, ringData } = useMemo(() => {
    const raw = span / 4
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.1))))
    const n   = raw / mag
    const step = n < 2 ? mag : n < 5 ? 2 * mag : 5 * mag

    const group   = new THREE.Group()
    const rings: { r: number; label: string }[] = []
    const y = minY + 0.12

    for (let r = step; r < span * 0.92; r += step) {
      const pts = new Float32Array(65 * 3)
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2
        pts.set([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], i * 3)
      }
      const geo  = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1e3a5f }))
      line.frustumCulled = false
      group.add(line)

      const label = r >= 1000 ? `${(r / 1000).toFixed(1)}km` : `${Math.round(r)}m`
      rings.push({ r, label })
    }
    return { groupObj: group, ringData: rings }
  }, [cx, minY, cz, span])

  useEffect(() => () => {
    groupObj.children.forEach(c => {
      (c as THREE.Line).geometry.dispose()
      ;((c as THREE.Line).material as THREE.Material).dispose()
    })
  }, [groupObj])

  return (
    <>
      <primitive object={groupObj} />
      {ringData.map(({ r, label }) => (
        <Html key={r}
          position={[cx + r * 0.72, minY + 0.3, cz - r * 0.72]}
          center distanceFactor={20}
        >
          <div style={{
            color: '#93c5fd', fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
            padding: '2px 6px', background: '#0f172acc', borderRadius: 4,
            pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            {label}
          </div>
        </Html>
      ))}
    </>
  )
}

// ─── グリッド ─────────────────────────────────────────────────────────────────

function SceneGrid({ cx, minY, cz, span }: { cx: number; minY: number; cz: number; span: number }) {
  const size      = span * 2
  const divisions = Math.min(20, Math.max(10, Math.floor(span / 5)))
  return (
    <gridHelper
      args={[size, divisions, '#1e293b', '#1e293b']}
      position={[cx, minY - 0.5, cz]}
    />
  )
}

// ─── メインコンポーネント ──────────────────────────────────────────────────────

export default function TrajectoryViewer({ samples }: Props) {
  if (samples.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-slate-500 text-sm">
        軌跡データがありません
      </div>
    )
  }

  const xs = samples.map(s => s.posEast)
  const ys = samples.map(s => s.posUp)
  const ns = samples.map(s => s.posNorth)

  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const minN = Math.min(...ns),  maxN = Math.max(...ns)

  // 軌跡のバウンディングボックス中心 (Three.js 座標)
  const cx   = (minX + maxX) / 2
  const avgY = (minY + maxY) / 2
  const cz   = -(minN + maxN) / 2   // Three.js Z = -North

  const span    = Math.max(maxX - minX, maxY - minY, maxN - minN, 1)
  const camDist = span * 1.5 + 10

  // カメラを軌跡中心の斜め上に配置、軌跡中心を見るよう設定
  const camPos: [number, number, number] = [
    cx + camDist, avgY + camDist * 0.5, cz + camDist,
  ]

  const startSample = samples[0]
  const goalSample  = samples[samples.length - 1]
  const startPos    = toVec3(startSample)
  const goalPos     = toVec3(goalSample)

  // 統計
  const peakG    = Math.max(...samples.map(s => s.gTotal))
  const maxSpeed = Math.max(...samples.map(s => s.speed))
  const duration = goalSample.t

  let totalDist = 0
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].posEast  - samples[i - 1].posEast
    const dy = samples[i].posUp    - samples[i - 1].posUp
    const dz = samples[i].posNorth - samples[i - 1].posNorth
    totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  const distLabel = totalDist >= 1000
    ? `${(totalDist / 1000).toFixed(2)}km`
    : `${totalDist.toFixed(0)}m`

  const startHead = startSample.heading.toFixed(0)
  const goalHead  = goalSample.heading.toFixed(0)

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-slate-900" style={{ height: 360 }}>
      <Canvas
        camera={{ position: camPos, fov: 50 }}
        gl={{ antialias: true }}
        frameloop="always"
        style={{ height: '100%' }}
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.6} />

        <TrajectoryLine  samples={samples} />
        <DirectionArrows samples={samples} />
        <PoleMarker position={startPos} poleColor="#22c55e" label="START" labelBg="#15803d" />
        <PoleMarker position={goalPos}  poleColor="#f87171" label="GOAL"  labelBg="#b91c1c" />

        <SceneGrid     cx={cx} minY={minY} cz={cz} span={span} />
        <AxisLines     cx={cx} minY={minY} cz={cz} span={span} />
        <CompassLabels cx={cx} minY={minY} cz={cz} span={span} />
        <DistanceRings cx={cx} minY={minY} cz={cz} span={span} />

        <OrbitControls
          target={[cx, avgY, cz]}
          enablePan enableZoom enableRotate
        />
      </Canvas>

      {/* 統計バー */}
      <div className="grid grid-cols-4 bg-slate-900 border-t border-slate-800 text-center text-xs py-2">
        <StatCell label="最大G"    value={`${peakG.toFixed(2)}G`}              color="text-yellow-400" />
        <StatCell label="最高速度" value={`${(maxSpeed * 3.6).toFixed(1)}km/h`} color="text-blue-400"   />
        <StatCell label="総距離"   value={distLabel}                            color="text-emerald-400" />
        <StatCell label="計測時間" value={`${duration.toFixed(0)}s`}            color="text-slate-300"  />
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1 bg-slate-900 text-xs text-slate-400">
        <LegendDot color="#22c55e" label="低G / START" />
        <LegendDot color="#facc15" label="中G" />
        <LegendDot color="#ef4444" label="高G / GOAL" />
        <span className="text-slate-600">▲ 方向矢印  |  ドラッグで視点移動</span>
      </div>

      {/* 方位情報 */}
      <div className="flex justify-around bg-slate-900 pb-2 text-xs text-slate-500">
        <span>出発: <span className="text-green-400 font-mono">{startHead}°</span> ({bearingLabel(+startHead)})</span>
        <span>到達: <span className="text-red-400   font-mono">{goalHead}°</span>  ({bearingLabel(+goalHead)})</span>
      </div>
    </div>
  )
}

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

function bearingLabel(deg: number): string {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return dirs[Math.round(deg / 45) % 8]
}
