import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { ProcessedSample } from '../../types/sensors'

interface Props {
  samples: ProcessedSample[]
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

/** Map G-force to colour: green → yellow → red */
function gColor(g: number): THREE.Color {
  const t = Math.min(g / 4, 1)
  if (t < 0.5) {
    return new THREE.Color().lerpColors(
      new THREE.Color(0x22c55e),
      new THREE.Color(0xfacc15),
      t * 2,
    )
  }
  return new THREE.Color().lerpColors(
    new THREE.Color(0xfacc15),
    new THREE.Color(0xef4444),
    (t - 0.5) * 2,
  )
}

// ─── Trajectory line ──────────────────────────────────────────────────────────

function TrajectoryLine({ samples }: { samples: ProcessedSample[] }) {
  const points = useMemo(
    () => samples.map(s => new THREE.Vector3(s.posEast, s.posUp, -s.posNorth)),
    [samples],
  )
  const colors = useMemo(
    () => samples.map(s => gColor(s.gTotal)),
    [samples],
  )
  if (points.length < 2) return null
  return <Line points={points} vertexColors={colors} lineWidth={2.5} />
}

// ─── Direction arrows (every ~5 seconds of data) ──────────────────────────────

function DirectionArrows({ samples }: { samples: ProcessedSample[] }) {
  const arrows = useMemo(() => {
    if (samples.length < 2) return []

    // Sample every ~5 s of data
    const interval = Math.max(1, Math.round(5 / ((samples.at(-1)!.t) / samples.length)))
    const result: { pos: THREE.Vector3; dir: THREE.Vector3; g: number }[] = []

    for (let i = interval; i < samples.length - interval; i += interval) {
      const s = samples[i]
      // Direction of travel in ENU → Three.js (X=East, Y=Up, Z=-North)
      const dx =  Math.sin((s.heading * Math.PI) / 180)
      const dz = -Math.cos((s.heading * Math.PI) / 180)
      const dir = new THREE.Vector3(dx, 0, dz).normalize()
      if (dir.lengthSq() < 0.01) continue
      result.push({
        pos: new THREE.Vector3(s.posEast, s.posUp, -s.posNorth),
        dir,
        g: s.gTotal,
      })
    }
    return result
  }, [samples])

  return (
    <>
      {arrows.map((a, i) => (
        <ArrowCone key={i} position={a.pos} direction={a.dir} color={gColor(a.g)} />
      ))}
    </>
  )
}

function ArrowCone({
  position, direction, color,
}: {
  position: THREE.Vector3
  direction: THREE.Vector3
  color: THREE.Color
}) {
  const quaternion = useMemo(() => {
    // Cone default points in +Y; rotate so it points along direction
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(up, direction)
    return q
  }, [direction])

  return (
    <mesh position={position} quaternion={quaternion}>
      <coneGeometry args={[0.4, 1.2, 6]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

// ─── Start / Goal markers ─────────────────────────────────────────────────────

function StartMarker({ position, span }: { position: THREE.Vector3; span: number }) {
  const poleH = Math.max(span * 0.08, 2)
  return (
    <group position={position}>
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, poleH, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, poleH, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <Html position={[0, poleH + 1.2, 0]} center distanceFactor={20}>
        <div style={{
          background: '#15803d', color: '#fff',
          padding: '2px 8px', borderRadius: 6,
          fontSize: 12, fontWeight: 700,
          whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
        }}>
          START
        </div>
      </Html>
    </group>
  )
}

function GoalMarker({ position, span }: { position: THREE.Vector3; span: number }) {
  const poleH = Math.max(span * 0.08, 2)
  return (
    <group position={position}>
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, poleH, 8]} />
        <meshBasicMaterial color="#f87171" />
      </mesh>
      <mesh position={[0, poleH, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color="#f87171" />
      </mesh>
      <Html position={[0, poleH + 1.2, 0]} center distanceFactor={20}>
        <div style={{
          background: '#b91c1c', color: '#fff',
          padding: '2px 8px', borderRadius: 6,
          fontSize: 12, fontWeight: 700,
          whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
        }}>
          GOAL
        </div>
      </Html>
    </group>
  )
}

// ─── Compass labels (N / E / S / W) ──────────────────────────────────────────

function CompassLabels({
  cx, minY, cz, span,
}: {
  cx: number; minY: number; cz: number; span: number
}) {
  const d = span * 0.88
  const y = minY + 0.3

  const mkStyle = (color: string, bg: string) => ({
    color,
    background: bg,
    border: `2px solid ${color}`,
    fontSize: 16,
    fontWeight: 900 as const,
    padding: '4px 10px',
    borderRadius: 8,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 2px 8px #000a',
    letterSpacing: '1px',
  })

  return (
    <>
      {/* 北 N — Three.js -Z direction */}
      <Html position={[cx, y, cz - d]} center distanceFactor={18}>
        <div style={mkStyle('#60a5fa', '#0f172acc')}>↑ 北 N</div>
      </Html>
      {/* 南 S — Three.js +Z direction */}
      <Html position={[cx, y, cz + d]} center distanceFactor={18}>
        <div style={mkStyle('#94a3b8', '#0f172acc')}>南 S ↓</div>
      </Html>
      {/* 東 E — Three.js +X direction */}
      <Html position={[cx + d, y, cz]} center distanceFactor={18}>
        <div style={mkStyle('#94a3b8', '#0f172acc')}>東 E →</div>
      </Html>
      {/* 西 W — Three.js -X direction */}
      <Html position={[cx - d, y, cz]} center distanceFactor={18}>
        <div style={mkStyle('#94a3b8', '#0f172acc')}>← W 西</div>
      </Html>
    </>
  )
}

// ─── Axis lines (faint cross through scene centre) ────────────────────────────

function AxisLines({
  cx, minY, cz, span,
}: {
  cx: number; minY: number; cz: number; span: number
}) {
  const y = minY + 0.12
  const nsPts = useMemo(() => [
    new THREE.Vector3(cx, y, cz - span),
    new THREE.Vector3(cx, y, cz + span),
  ], [cx, cz, span, y])
  const ewPts = useMemo(() => [
    new THREE.Vector3(cx - span, y, cz),
    new THREE.Vector3(cx + span, y, cz),
  ], [cx, cz, span, y])

  return (
    <>
      <Line points={nsPts} color="#1d4ed8" lineWidth={1} />
      <Line points={ewPts} color="#1d4ed8" lineWidth={1} />
    </>
  )
}

// ─── Distance rings ───────────────────────────────────────────────────────────

function DistanceRings({
  cx, minY, cz, span,
}: {
  cx: number; minY: number; cz: number; span: number
}) {
  const ringData = useMemo(() => {
    // Nice round interval so we get ~3–5 rings
    const raw = span / 4
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.1))))
    const n = raw / mag
    const step = n < 2 ? mag : n < 5 ? 2 * mag : 5 * mag

    const result: { r: number; pts: THREE.Vector3[]; label: string }[] = []
    for (let r = step; r < span * 0.92; r += step) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, minY + 0.12, cz + Math.sin(a) * r))
      }
      const label = r >= 1000 ? `${(r / 1000).toFixed(1)}km` : `${Math.round(r)}m`
      result.push({ r, pts, label })
    }
    return result
  }, [cx, minY, cz, span])

  return (
    <>
      {ringData.map(({ r, pts, label }) => (
        <group key={r}>
          <Line points={pts} color="#1e3a5f" lineWidth={1} />
          {/* Label placed at NE diagonal of each ring */}
          <Html
            position={[cx + r * 0.72, minY + 0.3, cz - r * 0.72]}
            center
            distanceFactor={16}
          >
            <div style={{
              color: '#93c5fd',
              fontSize: 13,
              fontFamily: 'monospace',
              fontWeight: 700,
              padding: '2px 6px',
              background: '#0f172acc',
              borderRadius: 4,
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px #000',
            }}>
              {label}
            </div>
          </Html>
        </group>
      ))}
    </>
  )
}


// ─── Grid ─────────────────────────────────────────────────────────────────────

function SceneGrid({
  span, minY, cx, cz,
}: {
  span: number; minY: number; cx: number; cz: number
}) {
  const size = span * 2
  const divisions = Math.min(20, Math.max(10, Math.floor(span / 5)))
  return (
    <gridHelper
      args={[size, divisions, '#1e293b', '#1e293b']}
      position={[cx, minY - 0.5, cz]}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const northVals = samples.map(s => s.posNorth)

  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const minN = Math.min(...northVals), maxN = Math.max(...northVals)

  // Trajectory bounding-box centre (Three.js coords)
  const cx = (minX + maxX) / 2
  const cz = -(minN + maxN) / 2   // Three.js Z = -North

  const span = Math.max(
    maxX - minX,
    Math.max(...ys) - minY,
    maxN - minN,
    1,
  )
  const camDist = span * 1.5 + 10

  const startSample = samples[0]
  const goalSample  = samples[samples.length - 1]

  const startPos = new THREE.Vector3(startSample.posEast, startSample.posUp, -startSample.posNorth)
  const goalPos  = new THREE.Vector3(goalSample.posEast,  goalSample.posUp,  -goalSample.posNorth)

  // Stats
  const peakG    = Math.max(...samples.map(s => s.gTotal))
  const maxSpeed = Math.max(...samples.map(s => s.speed))
  const duration = goalSample.t

  // Total path length
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
        camera={{ position: [camDist, camDist * 0.5, camDist], fov: 50 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.6} />

        <TrajectoryLine    samples={samples} />
        <DirectionArrows   samples={samples} />
        <StartMarker       position={startPos} span={span} />
        <GoalMarker        position={goalPos}  span={span} />

        <SceneGrid         span={span} minY={minY} cx={cx} cz={cz} />
        <AxisLines         span={span} minY={minY} cx={cx} cz={cz} />
        <CompassLabels     span={span} minY={minY} cx={cx} cz={cz} />
        <DistanceRings     span={span} minY={minY} cx={cx} cz={cz} />

        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>

      {/* Stats overlay */}
      <div className="grid grid-cols-4 bg-slate-900 border-t border-slate-800 text-center text-xs py-2">
        <StatCell label="最大G"    value={`${peakG.toFixed(2)}G`}             color="text-yellow-400" />
        <StatCell label="最高速度" value={`${(maxSpeed * 3.6).toFixed(1)}km/h`} color="text-blue-400" />
        <StatCell label="総距離"   value={distLabel}                           color="text-emerald-400" />
        <StatCell label="計測時間" value={`${duration.toFixed(0)}s`}           color="text-slate-300" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1 bg-slate-900 text-xs text-slate-400">
        <LegendItem color="#22c55e" label="低G / START" />
        <LegendItem color="#facc15" label="中G" />
        <LegendItem color="#ef4444" label="高G / GOAL" />
        <span className="text-slate-600">▲ 方向矢印  |  ドラッグで視点移動</span>
      </div>

      {/* Heading info */}
      <div className="flex justify-around bg-slate-900 pb-2 text-xs text-slate-500">
        <span>
          出発方位: <span className="text-green-400 font-mono">{startHead}°</span>
          {' '}({bearingLabel(Number(startHead))})
        </span>
        <span>
          到達方位: <span className="text-red-400 font-mono">{goalHead}°</span>
          {' '}({bearingLabel(Number(goalHead))})
        </span>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

/** Convert bearing in degrees to 8-direction Japanese label */
function bearingLabel(deg: number): string {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return dirs[Math.round(deg / 45) % 8]
}
